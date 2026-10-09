import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { constantTimeEquals } from '../../common/crypto.util.js';

/**
 * Authenticates the voice agent (deployed separately, on LiveKit Cloud) against the
 * `/internal/calls` routes with a shared `AGENT_INTERNAL_TOKEN` bearer token.
 */
@Injectable()
export class AgentTokenGuard implements CanActivate {
  private readonly expectedToken: string;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.expectedToken = configService.getOrThrow<string>('AGENT_INTERNAL_TOKEN');
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token || !constantTimeEquals(token, this.expectedToken)) {
      throw new UnauthorizedException('Invalid agent token');
    }

    return true;
  }
}
