import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('executive')
  executive(@Query('propertyId') propertyId: string) {
    return this.dashboard.executive(propertyId);
  }
}
