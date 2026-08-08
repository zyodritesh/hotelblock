import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur < last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function sellable(day: {
  baseCapacity: number;
  confirmedRoomNights: number;
  activeGroupBlocks: number;
  activeHolds: number;
  outOfOrderOrService: number;
  authorisedOverbooking: number;
}) {
  return (
    day.baseCapacity -
    day.confirmedRoomNights -
    day.activeGroupBlocks -
    day.activeHolds -
    day.outOfOrderOrService +
    day.authorisedOverbooking
  );
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async search(input: {
    propertyId: string;
    arrivalDate: string;
    departureDate: string;
    adults?: number;
    rooms?: number;
  }) {
    const nights = datesBetween(input.arrivalDate, input.departureDate);
    if (!nights.length) {
      throw new ConflictException({
        code: 'VALIDATION_INVALID_DATES',
        message: 'Departure must be after arrival',
      });
    }

    const products = await this.prisma.roomProduct.findMany({
      where: { propertyId: input.propertyId, isActive: true },
      include: {
        roomType: true,
        ratePlans: { where: { isActive: true } },
      },
    });

    const results = [];
    for (const product of products) {
      if (
        input.adults &&
        product.roomType.maxOccupancy < (input.adults || 1)
      ) {
        continue;
      }

      const days = await this.prisma.inventoryDay.findMany({
        where: {
          propertyId: input.propertyId,
          roomTypeId: product.roomTypeId,
          stayDate: { in: nights },
        },
      });

      if (days.length < nights.length) continue;

      const minSellable = Math.min(...days.map(sellable));
      const requested = input.rooms ?? 1;
      if (minSellable < requested) continue;

      const ratePlan = product.ratePlans[0];
      if (!ratePlan) continue;

      results.push({
        roomProductId: product.id,
        roomProductCode: product.code,
        roomProductName: product.name,
        roomTypeId: product.roomTypeId,
        roomTypeName: product.roomType.name,
        ratePlanId: ratePlan.id,
        ratePlanCode: ratePlan.code,
        ratePlanName: ratePlan.name,
        nightlyRate: ratePlan.baseRate,
        currency: ratePlan.currency,
        mealPlan: ratePlan.mealPlan,
        nights: nights.length,
        totalRate: ratePlan.baseRate * nights.length * requested,
        available: minSellable,
        inclusions: JSON.parse(product.inclusions || '[]'),
      });
    }

    return {
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      nights: nights.length,
      options: results,
    };
  }

  async calendar(propertyId: string, from: string, to: string) {
    const days = await this.prisma.inventoryDay.findMany({
      where: {
        propertyId,
        stayDate: { gte: from, lte: to },
      },
      include: { roomType: true },
      orderBy: [{ stayDate: 'asc' }, { roomType: { code: 'asc' } }],
    });

    return days.map((d) => ({
      ...d,
      sellable: sellable(d),
    }));
  }

  /**
   * Transactional inventory lock for last-room safety (PRD §8).
   */
  async reserveNights(
    tx: Prisma.TransactionClient,
    input: {
      propertyId: string;
      roomTypeId: string;
      arrivalDate: string;
      departureDate: string;
      quantity: number;
    },
  ) {
    const nights = datesBetween(input.arrivalDate, input.departureDate);
    for (const stayDate of nights) {
      const day = await tx.inventoryDay.findUnique({
        where: {
          propertyId_roomTypeId_stayDate: {
            propertyId: input.propertyId,
            roomTypeId: input.roomTypeId,
            stayDate,
          },
        },
      });
      if (!day) {
        throw new NotFoundException({
          code: 'INVENTORY_DAY_MISSING',
          message: `No inventory for ${stayDate}`,
        });
      }
      if (sellable(day) < input.quantity) {
        throw new ConflictException({
          code: 'INVENTORY_NO_AVAILABILITY',
          message: `No availability on ${stayDate}`,
        });
      }
      await tx.inventoryDay.update({
        where: { id: day.id },
        data: {
          confirmedRoomNights: { increment: input.quantity },
          recordVersion: { increment: 1 },
        },
      });
    }
  }

  async releaseNights(
    tx: Prisma.TransactionClient,
    input: {
      propertyId: string;
      roomTypeId: string;
      arrivalDate: string;
      departureDate: string;
      quantity: number;
    },
  ) {
    const nights = datesBetween(input.arrivalDate, input.departureDate);
    for (const stayDate of nights) {
      const day = await tx.inventoryDay.findUnique({
        where: {
          propertyId_roomTypeId_stayDate: {
            propertyId: input.propertyId,
            roomTypeId: input.roomTypeId,
            stayDate,
          },
        },
      });
      if (!day) continue;
      await tx.inventoryDay.update({
        where: { id: day.id },
        data: {
          confirmedRoomNights: {
            decrement: Math.min(day.confirmedRoomNights, input.quantity),
          },
          recordVersion: { increment: 1 },
        },
      });
    }
  }
}
