import { Controller, Get, Post, Query } from '@nestjs/common';
import { NightAuditService } from './night-audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../auth/auth.types';

@Controller('v1/night-audit')
export class NightAuditController {
  constructor(private readonly nightAudit: NightAuditService) {}

  @Get('precheck')
  @RequirePermissions('night_audit:run')
  precheck(@Query('propertyId') propertyId: string) {
    return this.nightAudit.precheck(propertyId);
  }

  @Post('run')
  @RequirePermissions('night_audit:run')
  run(
    @Query('propertyId') propertyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.nightAudit.run(propertyId, {
      id: user.id,
      tenantId: user.tenantId,
    });
  }
}
