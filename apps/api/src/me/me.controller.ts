import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  changeEmailSchema,
  confirmEmailChangeSchema,
  deleteAccountSchema,
  notificationSettingsSchema,
  totpDisableSchema,
  totpEnableSchema,
  totpSetupSchema,
  updateProfileSchema,
} from '@wusool/shared';
import type { z } from 'zod';
import { Audit } from '../audit/audit';
import { Auth, ClientIp, type AuthContext } from '../common/auth-context';
import { ApiZodBody, zod } from '../common/zod';
import { MeService } from './me.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  profile(@Auth() auth: AuthContext) {
    return this.me.profile(auth.userId);
  }

  @Patch()
  @ApiZodBody(updateProfileSchema)
  update(
    @Auth() auth: AuthContext,
    @Body(zod(updateProfileSchema)) body: z.output<typeof updateProfileSchema>,
  ) {
    return this.me.updateProfile(auth.userId, body);
  }

  @Patch('notification-settings')
  @ApiZodBody(notificationSettingsSchema)
  notificationSettings(
    @Auth() auth: AuthContext,
    @Body(zod(notificationSettingsSchema)) body: z.output<typeof notificationSettingsSchema>,
  ) {
    return this.me.setNotificationSettings(auth.userId, body.muteRoutineNotifications);
  }

  @Post('email-change')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiZodBody(changeEmailSchema)
  async requestEmailChange(
    @Auth() auth: AuthContext,
    @Body(zod(changeEmailSchema)) body: z.output<typeof changeEmailSchema>,
    @ClientIp() ip: string | null,
  ) {
    await this.me.requestEmailChange(auth.userId, body.newEmail, body.password, ip);
    return { status: 'verification_sent' };
  }

  @Post('email-change/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(confirmEmailChangeSchema)
  confirmEmailChange(
    @Auth() auth: AuthContext,
    @Body(zod(confirmEmailChangeSchema)) body: z.output<typeof confirmEmailChangeSchema>,
  ) {
    return this.me.confirmEmailChange(auth.userId, body.code);
  }

  @Post('totp/setup')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(totpSetupSchema)
  setupTotp(
    @Auth() auth: AuthContext,
    @Body(zod(totpSetupSchema)) body: z.output<typeof totpSetupSchema>,
  ) {
    return this.me.setupTotp(auth.userId, body.password);
  }

  @Post('totp/enable')
  @HttpCode(HttpStatus.OK)
  @Audit('totp.enable', 'user')
  @ApiZodBody(totpEnableSchema)
  enableTotp(
    @Auth() auth: AuthContext,
    @Body(zod(totpEnableSchema)) body: z.output<typeof totpEnableSchema>,
  ) {
    return this.me.enableTotp(auth.userId, body.code);
  }

  @Post('totp/disable')
  @HttpCode(HttpStatus.OK)
  @Audit('totp.disable', 'user')
  @ApiZodBody(totpDisableSchema)
  disableTotp(
    @Auth() auth: AuthContext,
    @Body(zod(totpDisableSchema)) body: z.output<typeof totpDisableSchema>,
  ) {
    return this.me.disableTotp(auth.userId, body.password, body.code);
  }

  @Delete()
  @Audit('account.delete', 'user')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(deleteAccountSchema)
  async deleteAccount(
    @Auth() auth: AuthContext,
    @Body(zod(deleteAccountSchema)) body: z.output<typeof deleteAccountSchema>,
  ) {
    await this.me.deleteAccount(auth.userId, body.password);
  }
}
