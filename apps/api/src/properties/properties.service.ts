import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(tenantId: string, propertyIds: string[]) {
    return this.prisma.property.findMany({
      where: {
        company: { tenantId },
        id: propertyIds.length ? { in: propertyIds } : undefined,
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  async updateSettings(
    id: string,
    data: Partial<{
      checkInTime: string;
      checkOutTime: string;
      timezone: string;
      currency: string;
    }>,
  ) {
    return this.prisma.property.update({ where: { id }, data });
  }
}
