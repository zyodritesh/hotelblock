import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const STATUS_TO_ROOM: Record<string, string | undefined> = {
  in_progress: 'cleaning',
  completed: 'inspection',
  inspection_pending: 'inspection',
  passed: 'vacant_clean',
  failed: 'vacant_dirty',
  rework: 'cleaning',
};

@Injectable()
export class HousekeepingService {
  constructor(private readonly prisma: PrismaService) {}

  async board(propertyId: string) {
    const [rooms, tasks] = await Promise.all([
      this.prisma.physicalRoom.findMany({
        where: { propertyId, isActive: true },
        include: { roomType: true },
        orderBy: [{ floor: 'asc' }, { number: 'asc' }],
      }),
      this.prisma.hkTask.findMany({
        where: {
          propertyId,
          status: {
            notIn: ['passed'],
          },
        },
        include: { room: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const byStatus = rooms.reduce<Record<string, number>>((acc, room) => {
      acc[room.status] = (acc[room.status] || 0) + 1;
      return acc;
    }, {});

    return { rooms, tasks, summary: byStatus };
  }

  createTask(input: {
    propertyId: string;
    roomId: string;
    priority?: string;
    taskType?: string;
    notes?: string;
  }) {
    return this.prisma.hkTask.create({
      data: {
        propertyId: input.propertyId,
        roomId: input.roomId,
        priority: input.priority || 'normal',
        taskType: input.taskType || 'checkout_clean',
        notes: input.notes,
      },
    });
  }

  async updateTask(
    id: string,
    data: { status?: string; assigneeId?: string; notes?: string },
  ) {
    const task = await this.prisma.hkTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.hkTask.update({
        where: { id },
        data: {
          status: data.status ?? task.status,
          assigneeId: data.assigneeId ?? task.assigneeId,
          notes: data.notes ?? task.notes,
        },
        include: { room: true },
      });

      const roomStatus = data.status ? STATUS_TO_ROOM[data.status] : undefined;
      if (roomStatus) {
        await tx.physicalRoom.update({
          where: { id: task.roomId },
          data: { status: roomStatus, recordVersion: { increment: 1 } },
        });
      }

      return updated;
    });
  }
}
