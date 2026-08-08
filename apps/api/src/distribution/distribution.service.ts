import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Channex adapter stub — owns mapping/ARI/booking inbox contracts.
 * Real Channex HTTP calls land in later certification workstream.
 */
@Injectable()
export class DistributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listConnections(propertyId: string) {
    return this.prisma.channelConnection.findMany({ where: { propertyId } });
  }

  async provision(propertyId: string, actor: { id: string; tenantId: string }) {
    const existing = await this.prisma.channelConnection.findFirst({
      where: { propertyId, provider: 'channex' },
    });
    if (existing) return existing;

    const conn = await this.prisma.channelConnection.create({
      data: {
        propertyId,
        provider: 'channex',
        status: 'awaiting_authorisation',
        externalId: `chx_prop_${propertyId.slice(-8)}`,
      },
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      propertyId,
      actorId: actor.id,
      action: 'channel.provisioned',
      entityType: 'channel_connection',
      entityId: conn.id,
      after: conn,
    });

    return conn;
  }

  async activate(id: string, actor: { id: string; tenantId: string }) {
    const conn = await this.prisma.channelConnection.update({
      where: { id },
      data: {
        status: 'active',
        lastAriAt: new Date(),
      },
    });
    await this.audit.log({
      tenantId: actor.tenantId,
      propertyId: conn.propertyId,
      actorId: actor.id,
      action: 'channel.activated',
      entityType: 'channel_connection',
      entityId: id,
    });
    return conn;
  }

  async fullSync(id: string) {
    return this.prisma.channelConnection.update({
      where: { id },
      data: {
        status: 'sync_testing',
        lastAriAt: new Date(),
        errorCount: 0,
      },
    });
  }
}
