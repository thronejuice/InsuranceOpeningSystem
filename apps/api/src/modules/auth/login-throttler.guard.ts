import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/** DESIGN §8: 5 attempts/minute per IP + username, so one user cannot lock out others behind the same NAT. */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    const username = typeof req.body?.username === 'string' ? req.body.username.toLowerCase() : '';
    return `${req.ip}:${username}`;
  }
}
