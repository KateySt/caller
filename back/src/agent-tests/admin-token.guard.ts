import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { constantTimeEquals } from '../common/crypto.util.js';

export const ADMIN_TOKEN_HEADER = 'x-admin-token';

/**
 * Gates the browser agent-test routes behind the shared `ADMIN_DEBUG_TOKEN`, sent raw
 * (no `Bearer` prefix) in the `X-Admin-Token` header. The value is never logged or returned.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  private readonly expectedToken: string;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.expectedToken = configService.getOrThrow<string>('ADMIN_DEBUG_TOKEN');
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers[ADMIN_TOKEN_HEADER];
    const token = typeof header === 'string' ? header : undefined;

    if (!token || !constantTimeEquals(token, this.expectedToken)) {
      throw new UnauthorizedException('Invalid admin token');
    }

    return true;
  }
}
