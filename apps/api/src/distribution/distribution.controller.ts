import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DistributionService } from './distribution.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../auth/auth.types';

@Controller('v1/distribution')
export class DistributionController {
  constructor(private readonly distribution: DistributionService) {}

  @Get('connections')
  @RequirePermissions('channel:manage')
  list(@Query('propertyId') propertyId: string) {
    return this.distribution.listConnections(propertyId);
  }

  @Post('channex/provision')
  @RequirePermissions('channel:manage')
  provision(
    @Query('propertyId') propertyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.distribution.provision(propertyId, {
      id: user.id,
      tenantId: user.tenantId,
    });
  }

  @Post('connections/:id/activate')
  @RequirePermissions('channel:manage')
  activate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.distribution.activate(id, {
      id: user.id,
      tenantId: user.tenantId,
    });
  }

  @Post('connections/:id/full-sync')
  @RequirePermissions('channel:manage')
  fullSync(@Param('id') id: string) {
    return this.distribution.fullSync(id);
  }
}
