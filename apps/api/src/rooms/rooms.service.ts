import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  listRoomTypes(propertyId: string) {
    return this.prisma.roomType.findMany({
      where: { propertyId, isActive: true },
      include: { _count: { select: { physicalRooms: true } } },
      orderBy: { code: 'asc' },
    });
  }

  createRoomType(
    propertyId: string,
    data: {
      code: string;
      name: string;
      description?: string;
      maxOccupancy?: number;
      baseOccupancy?: number;
      amenities?: string[];
    },
  ) {
    return this.prisma.roomType.create({
      data: {
        propertyId,
        code: data.code,
        name: data.name,
        description: data.description,
        maxOccupancy: data.maxOccupancy ?? 2,
        baseOccupancy: data.baseOccupancy ?? 2,
        amenities: JSON.stringify(data.amenities ?? []),
      },
    });
  }

  listRooms(propertyId: string) {
    return this.prisma.physicalRoom.findMany({
      where: { propertyId, isActive: true },
      include: { roomType: true },
      orderBy: { number: 'asc' },
    });
  }

  createRoom(
    propertyId: string,
    data: { roomTypeId: string; number: string; floor?: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.physicalRoom.create({
        data: {
          propertyId,
          roomTypeId: data.roomTypeId,
          number: data.number,
          floor: data.floor,
        },
      });
      await tx.roomType.update({
        where: { id: data.roomTypeId },
        data: { physicalCount: { increment: 1 } },
      });
      return room;
    });
  }

  listProducts(propertyId: string) {
    return this.prisma.roomProduct.findMany({
      where: { propertyId, isActive: true },
      include: { roomType: true, ratePlans: { where: { isActive: true } } },
      orderBy: { code: 'asc' },
    });
  }

  listRatePlans(propertyId: string) {
    return this.prisma.ratePlan.findMany({
      where: { propertyId, isActive: true },
      include: { roomProduct: true },
      orderBy: { code: 'asc' },
    });
  }

  async updateRoomStatus(roomId: string, status: string) {
    const room = await this.prisma.physicalRoom.findUnique({
      where: { id: roomId },
    });
    if (!room) throw new NotFoundException('Room not found');
    return this.prisma.physicalRoom.update({
      where: { id: roomId },
      data: { status, recordVersion: { increment: 1 } },
    });
  }
}
