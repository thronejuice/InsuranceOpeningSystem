import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Public, RequirePermissions } from '../../common/auth/auth.decorators.js';
import { AuthService, type IssuedTokens } from './auth.service.js';
import { MeResponse, TokenResponse } from './dto/auth.response.js';
import { LoginDto } from './dto/login.dto.js';
import { LoginThrottlerGuard } from './login-throttler.guard.js';

export const REFRESH_COOKIE = 'refresh_token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @UseGuards(LoginThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenResponse })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<TokenResponse> {
    return this.withRefreshCookie(res, await this.auth.login(dto.username, dto.password));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOkResponse({ type: TokenResponse })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<TokenResponse> {
    try {
      return this.withRefreshCookie(res, await this.auth.refresh(readRefreshCookie(req)));
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw error;
    }
  }

  /** Public so a user whose access token already expired can still end the session. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<null> {
    await this.auth.logout(readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return null;
  }

  @RequirePermissions()
  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: MeResponse })
  me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return this.auth.me(user.id);
  }

  private withRefreshCookie(res: Response, tokens: IssuedTokens): TokenResponse {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...this.cookieOptions(), expires: tokens.refreshExpiresAt });
    return tokens.body;
  }

  /** DESIGN §8: httpOnly + Secure + SameSite=Strict, scoped to /api/auth. Browsers accept Secure on http://localhost. */
  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth' };
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value ? value : undefined;
}
