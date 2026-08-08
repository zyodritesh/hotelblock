import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
    if (!tenant) {
      throw new UnauthorizedException({
        code: 'AUTH_TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      include: {
        userRoles: { include: { role: true } },
        propertyAccesses: { include: { property: true } },
      },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      tenantId: tenant.id,
    });

    await this.audit.log({
      tenantId: tenant.id,
      actorId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
    });

    const permissions = new Set<string>();
    for (const ur of user.userRoles) {
      (JSON.parse(ur.role.permissions) as string[]).forEach((p) =>
        permissions.add(p),
      );
    }

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        roles: user.userRoles.map((ur) => ur.role.name),
        permissions: [...permissions],
        properties: user.propertyAccesses.map((pa) => ({
          id: pa.property.id,
          name: pa.property.name,
          code: pa.property.code,
          businessDate: pa.property.businessDate,
          timezone: pa.property.timezone,
          currency: pa.property.currency,
        })),
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: true,
        userRoles: { include: { role: true } },
        propertyAccesses: { include: { property: true } },
      },
    });
    if (!user) throw new UnauthorizedException();

    const permissions = new Set<string>();
    for (const ur of user.userRoles) {
      (JSON.parse(ur.role.permissions) as string[]).forEach((p) =>
        permissions.add(p),
      );
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      tenantId: user.tenantId,
      tenantSlug: user.tenant.slug,
      roles: user.userRoles.map((ur) => ur.role.name),
      permissions: [...permissions],
      properties: user.propertyAccesses.map((pa) => ({
        id: pa.property.id,
        name: pa.property.name,
        code: pa.property.code,
        businessDate: pa.property.businessDate,
        timezone: pa.property.timezone,
        currency: pa.property.currency,
      })),
    };
  }
}
