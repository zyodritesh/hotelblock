import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';

function confirmationNo() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `HO-${n}`;
}

function nightsBetween(arrival: string, departure: string) {
  const a = new Date(`${arrival}T00:00:00Z`);
  const d = new Date(`${departure}T00:00:00Z`);
  return Math.max(
    0,
    Math.round((d.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)),
  );
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  list(propertyId: string, status?: string) {
    return this.prisma.reservation.findMany({
      where: {
        propertyId,
        status: status || undefined,
      },
      include: {
        guest: true,
        rooms: { include: { roomProduct: true, ratePlan: true } },
        folios: true,
      },
      orderBy: { arrivalDate: 'asc' },
    });
  }

  async get(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        guest: true,
        rooms: { include: { roomProduct: true, ratePlan: true } },
        stays: { include: { assignments: { include: { room: true } } } },
        folios: { include: { postings: true, payments: true } },
        revisions: { orderBy: { revisionNo: 'desc' } },
      },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    return reservation;
  }

  async create(
    input: {
      propertyId: string;
      source?: string;
      arrivalDate: string;
      departureDate: string;
      adults?: number;
      children?: number;
      roomProductId: string;
      ratePlanId: string;
      guest: { fullName: string; mobile?: string; email?: string };
      notes?: string;
      confirm?: boolean;
    },
    actor: { id: string; tenantId: string },
  ) {
    const nights = nightsBetween(input.arrivalDate, input.departureDate);
    if (nights < 1) {
      throw new BadRequestException({
        code: 'VALIDATION_INVALID_DATES',
        message: 'Departure must be after arrival',
      });
    }

    const product = await this.prisma.roomProduct.findUnique({
      where: { id: input.roomProductId },
    });
    const ratePlan = await this.prisma.ratePlan.findUnique({
      where: { id: input.ratePlanId },
    });
    if (!product || !ratePlan) {
      throw new NotFoundException('Room product or rate plan not found');
    }

    const totalAmount = ratePlan.baseRate * nights;
    const status = input.confirm === false ? 'hold' : 'confirmed';

    const reservation = await this.prisma.$transaction(async (tx) => {
      if (status === 'confirmed') {
        await this.inventory.reserveNights(tx, {
          propertyId: input.propertyId,
          roomTypeId: product.roomTypeId,
          arrivalDate: input.arrivalDate,
          departureDate: input.departureDate,
          quantity: 1,
        });
      }

      const guest = await tx.guest.create({
        data: {
          propertyId: input.propertyId,
          tenantId: actor.tenantId,
          fullName: input.guest.fullName,
          mobile: input.guest.mobile,
          email: input.guest.email,
        },
      });

      const created = await tx.reservation.create({
        data: {
          propertyId: input.propertyId,
          confirmationNo: confirmationNo(),
          status,
          source: input.source || 'direct',
          arrivalDate: input.arrivalDate,
          departureDate: input.departureDate,
          adults: input.adults ?? 1,
          children: input.children ?? 0,
          guestId: guest.id,
          notes: input.notes,
          totalAmount,
          rooms: {
            create: {
              roomProductId: product.id,
              ratePlanId: ratePlan.id,
              nightlyRate: ratePlan.baseRate,
              quantity: 1,
            },
          },
          stays: { create: { status: 'expected' } },
          folios: { create: { propertyId: input.propertyId, balance: totalAmount } },
          revisions: {
            create: {
              revisionNo: 1,
              payload: JSON.stringify(input),
              reason: 'created',
              createdBy: actor.id,
            },
          },
        },
        include: {
          guest: true,
          rooms: { include: { roomProduct: true, ratePlan: true } },
          folios: true,
        },
      });

      if (status === 'confirmed') {
        const folio = created.folios[0];
        for (let i = 0; i < nights; i++) {
          const d = new Date(`${input.arrivalDate}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + i);
          await tx.posting.create({
            data: {
              folioId: folio.id,
              chargeCode: 'ROOM',
              description: `Room night ${d.toISOString().slice(0, 10)}`,
              amount: ratePlan.baseRate,
              taxAmount: 0,
              businessDate: d.toISOString().slice(0, 10),
            },
          });
        }
      }

      return created;
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      propertyId: input.propertyId,
      actorId: actor.id,
      action: 'reservation.created',
      entityType: 'reservation',
      entityId: reservation.id,
      after: { status: reservation.status, confirmationNo: reservation.confirmationNo },
    });

    return reservation;
  }

  async cancel(id: string, actor: { id: string; tenantId: string }, reason?: string) {
    const existing = await this.get(id);
    if (['cancelled', 'checked_out', 'checked_in'].includes(existing.status)) {
      throw new BadRequestException({
        code: 'RESERVATION_INVALID_STATE',
        message: `Cannot cancel reservation in status ${existing.status}`,
      });
    }

    const roomLine = existing.rooms[0];
    const updated = await this.prisma.$transaction(async (tx) => {
      if (existing.status === 'confirmed' && roomLine) {
        await this.inventory.releaseNights(tx, {
          propertyId: existing.propertyId,
          roomTypeId: roomLine.roomProduct.roomTypeId,
          arrivalDate: existing.arrivalDate,
          departureDate: existing.departureDate,
          quantity: roomLine.quantity,
        });
      }
      return tx.reservation.update({
        where: { id },
        data: {
          status: 'cancelled',
          recordVersion: { increment: 1 },
          revisions: {
            create: {
              revisionNo: existing.revisions.length + 1,
              payload: JSON.stringify({ reason }),
              reason: reason || 'cancelled',
              createdBy: actor.id,
            },
          },
        },
        include: { guest: true, rooms: true, folios: true },
      });
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      propertyId: existing.propertyId,
      actorId: actor.id,
      action: 'reservation.cancelled',
      entityType: 'reservation',
      entityId: id,
      reason,
    });

    return updated;
  }

  arrivals(propertyId: string, date: string) {
    return this.prisma.reservation.findMany({
      where: {
        propertyId,
        arrivalDate: date,
        status: { in: ['confirmed', 'checked_in'] },
      },
      include: {
        guest: true,
        rooms: { include: { roomProduct: true } },
        stays: { include: { assignments: { include: { room: true } } } },
      },
      orderBy: { confirmationNo: 'asc' },
    });
  }

  departures(propertyId: string, date: string) {
    return this.prisma.reservation.findMany({
      where: {
        propertyId,
        departureDate: date,
        status: { in: ['checked_in', 'checked_out'] },
      },
      include: {
        guest: true,
        rooms: { include: { roomProduct: true } },
        stays: { include: { assignments: { include: { room: true } } } },
        folios: true,
      },
    });
  }

  inHouse(propertyId: string) {
    return this.prisma.reservation.findMany({
      where: { propertyId, status: 'checked_in' },
      include: {
        guest: true,
        rooms: { include: { roomProduct: true } },
        stays: { include: { assignments: { include: { room: true } } } },
        folios: true,
      },
    });
  }

  async tapeChart(propertyId: string, from: string, to: string) {
    const rooms = await this.prisma.physicalRoom.findMany({
      where: { propertyId, isActive: true },
      include: { roomType: true },
      orderBy: { number: 'asc' },
    });

    const reservations = await this.prisma.reservation.findMany({
      where: {
        propertyId,
        status: { in: ['confirmed', 'checked_in', 'hold'] },
        arrivalDate: { lt: to },
        departureDate: { gt: from },
      },
      include: {
        guest: true,
        stays: {
          include: {
            assignments: {
              where: { isCurrent: true },
              include: { room: true },
            },
          },
        },
        rooms: { include: { roomProduct: true } },
      },
    });

    return { rooms, reservations, from, to };
  }
}
