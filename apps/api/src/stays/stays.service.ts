import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class StaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async checkIn(
    stayId: string,
    input: { roomId: string; depositAmount?: number; notes?: string },
    actor: { id: string; tenantId: string },
  ) {
    const stay = await this.prisma.stay.findUnique({
      where: { id: stayId },
      include: {
        reservation: { include: { folios: true, guest: true } },
      },
    });
    if (!stay) throw new NotFoundException('Stay not found');
    if (stay.reservation.status !== 'confirmed') {
      throw new BadRequestException({
        code: 'RESERVATION_INVALID_STATE',
        message: 'Only confirmed reservations can check in',
      });
    }

    const room = await this.prisma.physicalRoom.findUnique({
      where: { id: input.roomId },
    });
    if (!room || !['vacant_clean', 'reserved'].includes(room.status)) {
      throw new BadRequestException({
        code: 'INVENTORY_ROOM_CONFLICT',
        message: 'Room is not available for check-in',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.physicalRoom.update({
        where: { id: room.id },
        data: { status: 'occupied', recordVersion: { increment: 1 } },
      });

      await tx.roomAssignment.create({
        data: {
          stayId: stay.id,
          roomId: room.id,
          fromDate: stay.reservation.arrivalDate,
          toDate: stay.reservation.departureDate,
          isCurrent: true,
        },
      });

      const updatedStay = await tx.stay.update({
        where: { id: stay.id },
        data: { status: 'in_house', checkedInAt: new Date() },
      });

      await tx.reservation.update({
        where: { id: stay.reservationId },
        data: { status: 'checked_in', recordVersion: { increment: 1 } },
      });

      if (input.depositAmount && stay.reservation.folios[0]) {
        await tx.payment.create({
          data: {
            folioId: stay.reservation.folios[0].id,
            method: 'cash',
            amount: input.depositAmount,
            status: 'captured',
            reference: 'deposit',
          },
        });
        await tx.folio.update({
          where: { id: stay.reservation.folios[0].id },
          data: { balance: { decrement: input.depositAmount } },
        });
      }

      return updatedStay;
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      propertyId: stay.reservation.propertyId,
      actorId: actor.id,
      action: 'stay.checked_in',
      entityType: 'stay',
      entityId: stay.id,
      after: { roomId: input.roomId },
    });

    return this.prisma.stay.findUnique({
      where: { id: result.id },
      include: {
        reservation: { include: { guest: true, folios: true } },
        assignments: { include: { room: true } },
      },
    });
  }

  async checkOut(
    stayId: string,
    input: {
      paymentMethod?: string;
      paymentAmount?: number;
      notes?: string;
    },
    actor: { id: string; tenantId: string },
  ) {
    const stay = await this.prisma.stay.findUnique({
      where: { id: stayId },
      include: {
        reservation: { include: { folios: true } },
        assignments: { where: { isCurrent: true } },
      },
    });
    if (!stay) throw new NotFoundException('Stay not found');
    if (stay.status !== 'in_house') {
      throw new BadRequestException({
        code: 'RESERVATION_INVALID_STATE',
        message: 'Stay is not in-house',
      });
    }

    const assignment = stay.assignments[0];
    const folio = stay.reservation.folios[0];

    const result = await this.prisma.$transaction(async (tx) => {
      if (assignment) {
        await tx.physicalRoom.update({
          where: { id: assignment.roomId },
          data: { status: 'vacant_dirty', recordVersion: { increment: 1 } },
        });
        await tx.hkTask.create({
          data: {
            propertyId: stay.reservation.propertyId,
            roomId: assignment.roomId,
            status: 'unassigned',
            priority: 'arrival',
            taskType: 'checkout_clean',
          },
        });
      }

      if (folio && input.paymentAmount && input.paymentAmount > 0) {
        await tx.payment.create({
          data: {
            folioId: folio.id,
            method: input.paymentMethod || 'cash',
            amount: input.paymentAmount,
            status: 'captured',
          },
        });
        const newBalance = folio.balance - input.paymentAmount;
        await tx.folio.update({
          where: { id: folio.id },
          data: {
            balance: newBalance,
            status: newBalance <= 0 ? 'closed' : 'partially_settled',
          },
        });
      } else if (folio && folio.balance <= 0) {
        await tx.folio.update({
          where: { id: folio.id },
          data: { status: 'closed' },
        });
      }

      await tx.stay.update({
        where: { id: stay.id },
        data: { status: 'checked_out', checkedOutAt: new Date() },
      });

      return tx.reservation.update({
        where: { id: stay.reservationId },
        data: { status: 'checked_out', recordVersion: { increment: 1 } },
        include: {
          guest: true,
          folios: { include: { payments: true, postings: true } },
          stays: { include: { assignments: { include: { room: true } } } },
        },
      });
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      propertyId: stay.reservation.propertyId,
      actorId: actor.id,
      action: 'stay.checked_out',
      entityType: 'stay',
      entityId: stay.id,
    });

    return result;
  }

  async roomMove(
    stayId: string,
    input: { toRoomId: string; reason?: string },
    actor: { id: string; tenantId: string },
  ) {
    const stay = await this.prisma.stay.findUnique({
      where: { id: stayId },
      include: {
        reservation: true,
        assignments: { where: { isCurrent: true } },
      },
    });
    if (!stay || stay.status !== 'in_house') {
      throw new BadRequestException('Stay must be in-house');
    }
    const current = stay.assignments[0];
    if (!current) throw new BadRequestException('No current room assignment');

    const toRoom = await this.prisma.physicalRoom.findUnique({
      where: { id: input.toRoomId },
    });
    if (!toRoom || !['vacant_clean', 'reserved'].includes(toRoom.status)) {
      throw new BadRequestException('Target room unavailable');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.roomAssignment.update({
        where: { id: current.id },
        data: { isCurrent: false },
      });
      await tx.physicalRoom.update({
        where: { id: current.roomId },
        data: { status: 'vacant_dirty' },
      });
      await tx.physicalRoom.update({
        where: { id: toRoom.id },
        data: { status: 'occupied' },
      });
      await tx.hkTask.create({
        data: {
          propertyId: stay.reservation.propertyId,
          roomId: current.roomId,
          status: 'unassigned',
          priority: 'high',
          taskType: 'room_move_clean',
        },
      });
      await tx.roomAssignment.create({
        data: {
          stayId,
          roomId: toRoom.id,
          fromDate: stay.reservation.arrivalDate,
          toDate: stay.reservation.departureDate,
          isCurrent: true,
        },
      });
      return tx.stay.findUnique({
        where: { id: stayId },
        include: {
          assignments: { include: { room: true } },
          reservation: { include: { guest: true } },
        },
      });
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      propertyId: stay.reservation.propertyId,
      actorId: actor.id,
      action: 'stay.room_moved',
      entityType: 'stay',
      entityId: stayId,
      reason: input.reason,
      before: { roomId: current.roomId },
      after: { roomId: toRoom.id },
    });

    return result;
  }
}
