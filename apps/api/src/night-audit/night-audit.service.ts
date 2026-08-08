import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class NightAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async precheck(propertyId: string) {
    const property = await this.prisma.property.findUniqueOrThrow({
      where: { id: propertyId },
    });

    const [unassignedArrivals, openDirty, openFolios] = await Promise.all([
      this.prisma.reservation.findMany({
        where: {
          propertyId,
          arrivalDate: property.businessDate,
          status: 'confirmed',
          stays: { every: { assignments: { none: {} } } },
        },
        include: { guest: true },
      }),
      this.prisma.physicalRoom.count({
        where: {
          propertyId,
          status: { in: ['vacant_dirty', 'cleaning'] },
        },
      }),
      this.prisma.folio.findMany({
        where: {
          propertyId,
          status: { in: ['open', 'partially_settled'] },
          reservation: { status: 'checked_out' },
        },
        include: { reservation: true },
      }),
    ]);

    const blockers = [];
    if (openFolios.length) {
      blockers.push({
        code: 'NIGHT_AUDIT_OPEN_FOLIO',
        message: `${openFolios.length} checked-out folio(s) still open`,
        items: openFolios.map((f) => f.reservation.confirmationNo),
      });
    }

    const warnings = [];
    if (unassignedArrivals.length) {
      warnings.push({
        code: 'NIGHT_AUDIT_UNASSIGNED_ARRIVALS',
        message: `${unassignedArrivals.length} arrival(s) without room assignment`,
      });
    }
    if (openDirty > 0) {
      warnings.push({
        code: 'NIGHT_AUDIT_DIRTY_ROOMS',
        message: `${openDirty} dirty/cleaning room(s) remaining`,
      });
    }

    return {
      businessDate: property.businessDate,
      ready: blockers.length === 0,
      blockers,
      warnings,
      preview: {
        roomChargeCandidates: await this.prisma.reservation.count({
          where: { propertyId, status: 'checked_in' },
        }),
      },
    };
  }

  async run(propertyId: string, actor: { id: string; tenantId: string }) {
    const pre = await this.precheck(propertyId);
    if (!pre.ready) {
      throw new BadRequestException({
        code: 'NIGHT_AUDIT_BLOCKED',
        message: 'Resolve blockers before closing business date',
        blockers: pre.blockers,
      });
    }

    const property = await this.prisma.property.findUniqueOrThrow({
      where: { id: propertyId },
    });

    const inHouse = await this.prisma.reservation.findMany({
      where: { propertyId, status: 'checked_in' },
      include: {
        folios: true,
        rooms: { include: { ratePlan: true } },
      },
    });

    const nextDate = (() => {
      const d = new Date(`${property.businessDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    })();

    await this.prisma.$transaction(async (tx) => {
      for (const reservation of inHouse) {
        const folio = reservation.folios[0];
        const rate = reservation.rooms[0]?.ratePlan.baseRate ?? 0;
        if (folio && rate > 0) {
          await tx.posting.create({
            data: {
              folioId: folio.id,
              chargeCode: 'ROOM',
              description: `Night audit room charge ${property.businessDate}`,
              amount: rate,
              taxAmount: 0,
              businessDate: property.businessDate,
            },
          });
          await tx.folio.update({
            where: { id: folio.id },
            data: { balance: { increment: rate } },
          });
        }
      }

      // No-shows: confirmed arrivals that never checked in
      const noShows = await tx.reservation.findMany({
        where: {
          propertyId,
          arrivalDate: property.businessDate,
          status: 'confirmed',
        },
      });
      for (const ns of noShows) {
        await tx.reservation.update({
          where: { id: ns.id },
          data: { status: 'no_show', recordVersion: { increment: 1 } },
        });
      }

      await tx.property.update({
        where: { id: propertyId },
        data: { businessDate: nextDate },
      });
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      propertyId,
      actorId: actor.id,
      action: 'night_audit.completed',
      entityType: 'property',
      entityId: propertyId,
      before: { businessDate: property.businessDate },
      after: { businessDate: nextDate },
    });

    return {
      previousBusinessDate: property.businessDate,
      businessDate: nextDate,
      roomChargesPosted: inHouse.length,
      noShowsProcessed: (
        await this.prisma.reservation.count({
          where: {
            propertyId,
            arrivalDate: property.businessDate,
            status: 'no_show',
          },
        })
      ),
    };
  }
}
