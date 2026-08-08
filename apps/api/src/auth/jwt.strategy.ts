import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth.types';

type JwtPayload = { sub: string; tenantId: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'dev-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userRoles: { include: { role: true } },
        propertyAccesses: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('AUTH_INVALID_SESSION');
    }

    const permissions = new Set<string>();
    const roles: string[] = [];
    for (const ur of user.userRoles) {
      roles.push(ur.role.name);
      const perms = JSON.parse(ur.role.permissions) as string[];
      perms.forEach((p) => permissions.add(p));
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      permissions: [...permissions],
      propertyIds: user.propertyAccesses.map((p) => p.propertyId),
      roles,
    };
  }
}
