import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators';

@Controller('v1/health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'hotel-os-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }
}
