import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../auth/auth.types';

@Controller('v1/properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.properties.listForUser(user.tenantId, user.propertyIds);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.properties.get(id);
  }

  @Patch(':id/settings')
  updateSettings(
    @Param('id') id: string,
    @Body()
    body: {
      checkInTime?: string;
      checkOutTime?: string;
      timezone?: string;
      currency?: string;
    },
  ) {
    return this.properties.updateSettings(id, body);
  }
}
