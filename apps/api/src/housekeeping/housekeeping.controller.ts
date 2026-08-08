import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { HousekeepingService } from './housekeeping.service';
import { RequirePermissions } from '../common/decorators';

@Controller('v1/housekeeping')
export class HousekeepingController {
  constructor(private readonly hk: HousekeepingService) {}

  @Get('board')
  @RequirePermissions('hk:view')
  board(@Query('propertyId') propertyId: string) {
    return this.hk.board(propertyId);
  }

  @Post('tasks')
  @RequirePermissions('hk:assign')
  createTask(
    @Body()
    body: {
      propertyId: string;
      roomId: string;
      priority?: string;
      taskType?: string;
      notes?: string;
    },
  ) {
    return this.hk.createTask(body);
  }

  @Patch('tasks/:id')
  @RequirePermissions('hk:complete')
  updateTask(
    @Param('id') id: string,
    @Body() body: { status?: string; assigneeId?: string; notes?: string },
  ) {
    return this.hk.updateTask(id, body);
  }
}
