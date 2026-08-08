import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PERMS = [
  'reservation:view',
  'reservation:create',
  'reservation:modify',
  'reservation:cancel',
  'stay:check_in',
  'stay:check_out',
  'stay:room_move',
  'folio:view',
  'folio:post',
  'folio:settle',
  'payment:collect',
  'payment:refund',
  'hk:view',
  'hk:assign',
  'hk:complete',
  'night_audit:run',
  'rate:manage',
  'room:manage',
  'channel:manage',
  'report:view',
  'settings:manage',
  'audit:view',
];

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  await prisma.auditEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.posting.deleteMany();
  await prisma.folio.deleteMany();
  await prisma.roomAssignment.deleteMany();
  await prisma.stayGuest.deleteMany();
  await prisma.stay.deleteMany();
  await prisma.reservationRevision.deleteMany();
  await prisma.reservationRoom.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.hkTask.deleteMany();
  await prisma.oooOosBlock.deleteMany();
  await prisma.inventoryDay.deleteMany();
  await prisma.ratePlan.deleteMany();
  await prisma.roomProduct.deleteMany();
  await prisma.physicalRoom.deleteMany();
  await prisma.roomType.deleteMany();
  await prisma.channelConnection.deleteMany();
  await prisma.propertyAccess.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();
  await prisma.property.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.company.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: { name: 'AAYOR Hospitality', slug: 'demo' },
  });

  const company = await prisma.company.create({
    data: { tenantId: tenant.id, name: 'AAYOR Hotels Pvt Ltd' },
  });

  const brand = await prisma.brand.create({
    data: { companyId: company.id, name: 'AAYOR' },
  });

  const businessDate = '2026-08-08';

  const property = await prisma.property.create({
    data: {
      tenantId: tenant.id,
      companyId: company.id,
      brandId: brand.id,
      name: 'AAYOR Grand Mumbai',
      code: 'AGM',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      businessDate,
      city: 'Mumbai',
      country: 'IN',
      address: 'Bandra Kurla Complex, Mumbai',
    },
  });

  const adminRole = await prisma.role.create({
    data: {
      tenantId: tenant.id,
      name: 'System Administrator',
      description: 'Full access',
      permissions: JSON.stringify(PERMS),
    },
  });

  const fdRole = await prisma.role.create({
    data: {
      tenantId: tenant.id,
      name: 'Front Desk Agent',
      permissions: JSON.stringify(
        PERMS.filter((p) =>
          [
            'reservation:view',
            'reservation:create',
            'reservation:modify',
            'stay:check_in',
            'stay:check_out',
            'stay:room_move',
            'folio:view',
            'folio:post',
            'folio:settle',
            'payment:collect',
            'hk:view',
            'report:view',
          ].includes(p),
        ),
      ),
    },
  });

  const passwordHash = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'admin@hotel-os.demo',
      passwordHash,
      fullName: 'Priya Nair',
      userRoles: { create: { roleId: adminRole.id } },
      propertyAccesses: { create: { propertyId: property.id } },
    },
  });

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'frontdesk@hotel-os.demo',
      passwordHash,
      fullName: 'Arjun Mehta',
      userRoles: { create: { roleId: fdRole.id } },
      propertyAccesses: { create: { propertyId: property.id } },
    },
  });

  const deluxe = await prisma.roomType.create({
    data: {
      propertyId: property.id,
      code: 'DLX',
      name: 'Deluxe King',
      description: 'City-view deluxe with work desk',
      maxOccupancy: 3,
      baseOccupancy: 2,
      physicalCount: 8,
      amenities: JSON.stringify(['wifi', 'ac', 'minibar', 'safe']),
    },
  });

  const suite = await prisma.roomType.create({
    data: {
      propertyId: property.id,
      code: 'STE',
      name: 'Executive Suite',
      description: 'Separate living area, club access',
      maxOccupancy: 4,
      baseOccupancy: 2,
      physicalCount: 4,
      amenities: JSON.stringify(['wifi', 'ac', 'minibar', 'bathtub', 'club']),
    },
  });

  const rooms: { id: string; number: string; typeId: string; status: string }[] =
    [];
  for (let i = 1; i <= 8; i++) {
    const r = await prisma.physicalRoom.create({
      data: {
        propertyId: property.id,
        roomTypeId: deluxe.id,
        number: `10${i}`,
        floor: '1',
        status: i <= 3 ? 'occupied' : i === 8 ? 'vacant_dirty' : 'vacant_clean',
      },
    });
    rooms.push({ id: r.id, number: r.number, typeId: deluxe.id, status: r.status });
  }
  for (let i = 1; i <= 4; i++) {
    const r = await prisma.physicalRoom.create({
      data: {
        propertyId: property.id,
        roomTypeId: suite.id,
        number: `20${i}`,
        floor: '2',
        status: i === 1 ? 'occupied' : 'vacant_clean',
      },
    });
    rooms.push({ id: r.id, number: r.number, typeId: suite.id, status: r.status });
  }

  const deluxeProduct = await prisma.roomProduct.create({
    data: {
      propertyId: property.id,
      roomTypeId: deluxe.id,
      code: 'DLX_BF',
      name: 'Deluxe with Breakfast',
      inclusions: JSON.stringify(['breakfast']),
    },
  });

  const suiteProduct = await prisma.roomProduct.create({
    data: {
      propertyId: property.id,
      roomTypeId: suite.id,
      code: 'STE_BF',
      name: 'Suite with Breakfast',
      inclusions: JSON.stringify(['breakfast', 'club_access']),
    },
  });

  const barDeluxe = await prisma.ratePlan.create({
    data: {
      propertyId: property.id,
      roomProductId: deluxeProduct.id,
      code: 'BAR_DLX',
      name: 'Best Available — Deluxe',
      baseRate: 6500,
      mealPlan: 'CP',
    },
  });

  const barSuite = await prisma.ratePlan.create({
    data: {
      propertyId: property.id,
      roomProductId: suiteProduct.id,
      code: 'BAR_STE',
      name: 'Best Available — Suite',
      baseRate: 12000,
      mealPlan: 'CP',
    },
  });

  // 60 days inventory
  for (let day = 0; day < 60; day++) {
    const stayDate = addDays(businessDate, day - 5);
    for (const rt of [deluxe, suite]) {
      await prisma.inventoryDay.create({
        data: {
          propertyId: property.id,
          roomTypeId: rt.id,
          stayDate,
          baseCapacity: rt.physicalCount,
          confirmedRoomNights: day === 5 ? (rt.code === 'DLX' ? 3 : 1) : 0,
        },
      });
    }
  }

  // In-house + arrivals
  const guest1 = await prisma.guest.create({
    data: {
      propertyId: property.id,
      tenantId: tenant.id,
      fullName: 'Maya Sharma',
      mobile: '+919876543210',
      email: 'maya@example.com',
      isVip: true,
    },
  });

  const inHouseRes = await prisma.reservation.create({
    data: {
      propertyId: property.id,
      confirmationNo: 'HO-100001',
      status: 'checked_in',
      source: 'direct',
      arrivalDate: addDays(businessDate, -1),
      departureDate: addDays(businessDate, 2),
      adults: 2,
      guestId: guest1.id,
      totalAmount: 19500,
      rooms: {
        create: {
          roomProductId: deluxeProduct.id,
          ratePlanId: barDeluxe.id,
          nightlyRate: 6500,
          assignedRoomId: rooms[0].id,
        },
      },
      stays: {
        create: {
          status: 'in_house',
          checkedInAt: new Date(),
          assignments: {
            create: {
              roomId: rooms[0].id,
              fromDate: addDays(businessDate, -1),
              toDate: addDays(businessDate, 2),
              isCurrent: true,
            },
          },
        },
      },
      folios: {
        create: {
          propertyId: property.id,
          balance: 6500,
          status: 'open',
          postings: {
            create: [
              {
                chargeCode: 'ROOM',
                description: 'Room night',
                amount: 6500,
                businessDate: addDays(businessDate, -1),
              },
            ],
          },
        },
      },
      revisions: {
        create: {
          revisionNo: 1,
          payload: '{}',
          reason: 'seed',
          createdBy: admin.id,
        },
      },
    },
  });

  const arrivalGuest = await prisma.guest.create({
    data: {
      propertyId: property.id,
      tenantId: tenant.id,
      fullName: 'Rohan Kapoor',
      mobile: '+919811122233',
      email: 'rohan@example.com',
    },
  });

  await prisma.reservation.create({
    data: {
      propertyId: property.id,
      confirmationNo: 'HO-100002',
      status: 'confirmed',
      source: 'ota',
      externalRef: 'BDC-778812',
      arrivalDate: businessDate,
      departureDate: addDays(businessDate, 3),
      adults: 2,
      guestId: arrivalGuest.id,
      totalAmount: 19500,
      notes: 'Late arrival ~22:00',
      rooms: {
        create: {
          roomProductId: deluxeProduct.id,
          ratePlanId: barDeluxe.id,
          nightlyRate: 6500,
        },
      },
      stays: { create: { status: 'expected' } },
      folios: {
        create: {
          propertyId: property.id,
          balance: 19500,
          postings: {
            create: [
              {
                chargeCode: 'ROOM',
                description: 'Room package',
                amount: 19500,
                businessDate,
              },
            ],
          },
        },
      },
      revisions: {
        create: {
          revisionNo: 1,
          payload: '{}',
          reason: 'seed',
          createdBy: admin.id,
        },
      },
    },
  });

  const guest3 = await prisma.guest.create({
    data: {
      propertyId: property.id,
      tenantId: tenant.id,
      fullName: 'Ananya Iyer',
      mobile: '+919900011122',
    },
  });

  await prisma.reservation.create({
    data: {
      propertyId: property.id,
      confirmationNo: 'HO-100003',
      status: 'confirmed',
      source: 'direct',
      arrivalDate: businessDate,
      departureDate: addDays(businessDate, 1),
      adults: 1,
      guestId: guest3.id,
      totalAmount: 12000,
      rooms: {
        create: {
          roomProductId: suiteProduct.id,
          ratePlanId: barSuite.id,
          nightlyRate: 12000,
        },
      },
      stays: { create: { status: 'expected' } },
      folios: {
        create: { propertyId: property.id, balance: 12000 },
      },
      revisions: {
        create: {
          revisionNo: 1,
          payload: '{}',
          reason: 'seed',
        },
      },
    },
  });

  await prisma.hkTask.create({
    data: {
      propertyId: property.id,
      roomId: rooms[7].id,
      status: 'unassigned',
      priority: 'arrival',
      taskType: 'checkout_clean',
    },
  });

  await prisma.channelConnection.create({
    data: {
      propertyId: property.id,
      provider: 'channex',
      status: 'mapping',
      externalId: 'chx_demo_agm',
      errorCount: 0,
    },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: tenant.id,
      propertyId: property.id,
      actorId: admin.id,
      action: 'seed.completed',
      entityType: 'property',
      entityId: property.id,
      afterJson: JSON.stringify({ property: property.code }),
    },
  });

  console.log('Seed complete');
  console.log('  Tenant: demo');
  console.log('  Property:', property.name, `(${property.id})`);
  console.log('  Admin: admin@hotel-os.demo / password123');
  console.log('  Front desk: frontdesk@hotel-os.demo / password123');
  console.log('  Sample reservation:', inHouseRes.confirmationNo);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
