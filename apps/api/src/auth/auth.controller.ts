import { Body, Controller, HttpCode, HttpStatus, Post, Headers } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resendCodeSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@wusool/shared';
import type { z } from 'zod';
import { ClientIp, Public } from '../common/auth-context';
import { StrictLimit } from '../common/rate-limit';
import { ApiZodBody, zod } from '../common/zod';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
  ) {}

  @Post('register')
  @StrictLimit.email()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiZodBody(registerSchema)
  async register(
    @Body(zod(registerSchema)) body: z.output<typeof registerSchema>,
    @ClientIp() ip: string | null,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    await this.auth.register({ ...body, userAgent }, ip);
    return { status: 'verification_sent' };
  }

  @Post('verify-email')
  @StrictLimit.code()
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(verifyEmailSchema)
  verifyEmail(@Body(zod(verifyEmailSchema)) body: z.output<typeof verifyEmailSchema>) {
    return this.auth.verifyEmail(body.email, body.code, body.deviceInfo);
  }

  @Post('resend-code')
  @StrictLimit.email()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiZodBody(resendCodeSchema)
  async resendCode(
    @Body(zod(resendCodeSchema)) body: z.output<typeof resendCodeSchema>,
    @ClientIp() ip: string | null,
  ) {
    await this.auth.resendCode(body.email, body.purpose, ip);
    return { status: 'sent_if_applicable' };
  }

  @Post('login')
  @StrictLimit.login()
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(loginSchema)
  login(@Body(zod(loginSchema)) body: z.output<typeof loginSchema>) {
    return this.auth.login(body.email, body.password, body.deviceInfo, body.totp);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(refreshSchema)
  refresh(@Body(zod(refreshSchema)) body: z.output<typeof refreshSchema>) {
    return this.tokens.rotate(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(refreshSchema)
  async logout(@Body(zod(refreshSchema)) body: z.output<typeof refreshSchema>) {
    await this.tokens.revoke(body.refreshToken);
  }

  @Post('forgot-password')
  @StrictLimit.email()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiZodBody(forgotPasswordSchema)
  async forgotPassword(
    @Body(zod(forgotPasswordSchema)) body: z.output<typeof forgotPasswordSchema>,
    @ClientIp() ip: string | null,
  ) {
    await this.auth.forgotPassword(body.email, ip);
    return { status: 'sent_if_applicable' };
  }

  @Post('reset-password')
  @StrictLimit.code()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(resetPasswordSchema)
  async resetPassword(@Body(zod(resetPasswordSchema)) body: z.output<typeof resetPasswordSchema>) {
    await this.auth.resetPassword(body.email, body.code, body.newPassword);
  }
}
