import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../auth/auth.types';

@Controller('v1')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get('reservations')
  list(
    @Query('propertyId') propertyId: string,
    @Query('status') status?: string,
  ) {
    return this.reservations.list(propertyId, status);
  }

  @Get('reservations/:id')
  get(@Param('id') id: string) {
    return this.reservations.get(id);
  }

  @Post('reservations')
  @RequirePermissions('reservation:create')
  create(
    @Body()
    body: {
      propertyId: string;
      source?: string;
      arrivalDate: string;
      departureDate: string;
      adults?: number;
      children?: number;
      roomProductId: string;
      ratePlanId: string;
      guest: { fullName: string; mobile?: string; email?: string };
      notes?: string;
      confirm?: boolean;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.reservations.create(body, {
      id: user.id,
      tenantId: user.tenantId,
    });
  }

  @Post('reservations/:id/cancel')
  @RequirePermissions('reservation:cancel')
  cancel(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.reservations.cancel(
      id,
      { id: user.id, tenantId: user.tenantId },
      body.reason,
    );
  }

  @Get('arrivals')
  arrivals(
    @Query('propertyId') propertyId: string,
    @Query('date') date: string,
  ) {
    return this.reservations.arrivals(propertyId, date);
  }

  @Get('departures')
  departures(
    @Query('propertyId') propertyId: string,
    @Query('date') date: string,
  ) {
    return this.reservations.departures(propertyId, date);
  }

  @Get('in-house')
  inHouse(@Query('propertyId') propertyId: string) {
    return this.reservations.inHouse(propertyId);
  }

  @Get('tape-chart')
  tapeChart(
    @Query('propertyId') propertyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reservations.tapeChart(propertyId, from, to);
  }
}
