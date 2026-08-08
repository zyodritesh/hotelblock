import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from '../common/decorators';
import { AuthUser } from './auth.types';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(
    @Body()
    body: { email: string; password: string; tenantSlug?: string },
  ) {
    return this.auth.login(
      body.email,
      body.password,
      body.tenantSlug || 'demo',
    );
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('logout')
  logout() {
    return { ok: true };
  }
}
