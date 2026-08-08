import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { RequirePermissions } from '../common/decorators';

@Controller('v1')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get('room-types')
  listRoomTypes(@Query('propertyId') propertyId: string) {
    return this.rooms.listRoomTypes(propertyId);
  }

  @Post('room-types')
  @RequirePermissions('room:manage')
  createRoomType(
    @Body()
    body: {
      propertyId: string;
      code: string;
      name: string;
      description?: string;
      maxOccupancy?: number;
      amenities?: string[];
    },
  ) {
    return this.rooms.createRoomType(body.propertyId, body);
  }

  @Get('rooms')
  listRooms(@Query('propertyId') propertyId: string) {
    return this.rooms.listRooms(propertyId);
  }

  @Post('rooms')
  @RequirePermissions('room:manage')
  createRoom(
    @Body()
    body: {
      propertyId: string;
      roomTypeId: string;
      number: string;
      floor?: string;
    },
  ) {
    return this.rooms.createRoom(body.propertyId, body);
  }

  @Patch('rooms/:id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.rooms.updateRoomStatus(id, body.status);
  }

  @Get('room-products')
  listProducts(@Query('propertyId') propertyId: string) {
    return this.rooms.listProducts(propertyId);
  }

  @Get('rate-plans')
  listRatePlans(@Query('propertyId') propertyId: string) {
    return this.rooms.listRatePlans(propertyId);
  }
}
