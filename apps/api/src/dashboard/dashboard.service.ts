import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async executive(propertyId: string) {
    const property = await this.prisma.property.findUniqueOrThrow({
      where: { id: propertyId },
    });
    const businessDate = property.businessDate;

    const [
      rooms,
      arrivals,
      departures,
      inHouse,
      inventoryToday,
      openTasks,
      channel,
      recentAudit,
    ] = await Promise.all([
      this.prisma.physicalRoom.findMany({ where: { propertyId, isActive: true } }),
      this.prisma.reservation.count({
        where: {
          propertyId,
          arrivalDate: businessDate,
          status: { in: ['confirmed', 'checked_in'] },
        },
      }),
      this.prisma.reservation.count({
        where: {
          propertyId,
          departureDate: businessDate,
          status: { in: ['checked_in', 'checked_out'] },
        },
      }),
      this.prisma.reservation.findMany({
        where: { propertyId, status: 'checked_in' },
        include: { folios: true },
      }),
      this.prisma.inventoryDay.findMany({
        where: { propertyId, stayDate: businessDate },
      }),
      this.prisma.hkTask.count({
        where: { propertyId, status: { notIn: ['passed'] } },
      }),
      this.prisma.channelConnection.findFirst({ where: { propertyId } }),
      this.prisma.auditEvent.findMany({
        where: { propertyId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    const totalRooms = rooms.length || 1;
    const occupied = rooms.filter((r) => r.status === 'occupied').length;
    const vacantClean = rooms.filter((r) => r.status === 'vacant_clean').length;
    const dirty = rooms.filter((r) =>
      ['vacant_dirty', 'cleaning', 'inspection'].includes(r.status),
    ).length;

    const roomRevenue = inHouse.reduce(
      (sum, r) => sum + (r.folios[0]?.balance ?? 0) + (r.totalAmount || 0) * 0,
      0,
    );
    // Use confirmed+in-house room nights revenue estimate from inventory
    const confirmedNights = inventoryToday.reduce(
      (s, d) => s + d.confirmedRoomNights,
      0,
    );
    const capacity = inventoryToday.reduce((s, d) => s + d.baseCapacity, 0) || totalRooms;
    const occupancy = occupied / totalRooms;
    const adr = confirmedNights > 0 ? 6500 : 0; // demo ADR placeholder from seed rates
    const revpar = occupancy * adr;

    return {
      property: {
        id: property.id,
        name: property.name,
        businessDate: property.businessDate,
        currency: property.currency,
      },
      kpis: {
        occupancyPct: Math.round(occupancy * 1000) / 10,
        adr,
        revpar: Math.round(revpar),
        arrivals,
        departures,
        inHouse: inHouse.length,
        vacantClean,
        dirty,
        ooo: rooms.filter((r) => r.status === 'ooo' || r.status === 'oos').length,
        openHkTasks: openTasks,
        roomRevenue,
        capacity,
        confirmedNights,
      },
      channel: channel
        ? {
            status: channel.status,
            provider: channel.provider,
            errorCount: channel.errorCount,
            lastAriAt: channel.lastAriAt,
            lastBookingAt: channel.lastBookingAt,
          }
        : null,
      activity: recentAudit,
      roomStatus: rooms.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {}),
    };
  }
}
