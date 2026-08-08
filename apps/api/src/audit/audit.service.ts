import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    tenantId: string;
    propertyId?: string;
    actorId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
    correlationId?: string;
  }) {
    return this.prisma.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        beforeJson: input.before ? JSON.stringify(input.before) : null,
        afterJson: input.after ? JSON.stringify(input.after) : null,
        reason: input.reason,
        correlationId: input.correlationId,
      },
    });
  }

  async list(propertyId: string, take = 50) {
    return this.prisma.auditEvent.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
