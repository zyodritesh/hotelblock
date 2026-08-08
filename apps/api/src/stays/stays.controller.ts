import { Body, Controller, Param, Post } from '@nestjs/common';
import { StaysService } from './stays.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../auth/auth.types';

@Controller('v1/stays')
export class StaysController {
  constructor(private readonly stays: StaysService) {}

  @Post(':id/check-in')
  @RequirePermissions('stay:check_in')
  checkIn(
    @Param('id') id: string,
    @Body() body: { roomId: string; depositAmount?: number; notes?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.stays.checkIn(id, body, {
      id: user.id,
      tenantId: user.tenantId,
    });
  }

  @Post(':id/check-out')
  @RequirePermissions('stay:check_out')
  checkOut(
    @Param('id') id: string,
    @Body()
    body: {
      paymentMethod?: string;
      paymentAmount?: number;
      notes?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.stays.checkOut(id, body, {
      id: user.id,
      tenantId: user.tenantId,
    });
  }

  @Post(':id/room-move')
  @RequirePermissions('stay:room_move')
  roomMove(
    @Param('id') id: string,
    @Body() body: { toRoomId: string; reason?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.stays.roomMove(id, body, {
      id: user.id,
      tenantId: user.tenantId,
    });
  }
}
