import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('v1')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post('availability/search')
  search(
    @Body()
    body: {
      propertyId: string;
      arrivalDate: string;
      departureDate: string;
      adults?: number;
      children?: number;
      rooms?: number;
    },
  ) {
    return this.inventory.search(body);
  }

  @Get('inventory/calendar')
  calendar(
    @Query('propertyId') propertyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.inventory.calendar(propertyId, from, to);
  }
}
