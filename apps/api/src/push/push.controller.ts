import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { pushSubscriptionSchema } from '@wusool/shared';
import type { z } from 'zod';
import { Auth, Public, type AuthContext } from '../common/auth-context';
import { ApiZodBody, zod } from '../common/zod';
import { PushService } from './push.service';

@ApiTags('push')
@ApiBearerAuth()
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('vapid-public-key')
  @Public()
  vapidPublicKey() {
    return { publicKey: this.push.vapidPublicKey() };
  }

  @Get('subscriptions')
  list(@Auth() auth: AuthContext) {
    return this.push.list(auth.userId);
  }

  @Post('subscriptions')
  @ApiZodBody(pushSubscriptionSchema)
  subscribe(
    @Auth() auth: AuthContext,
    @Body(zod(pushSubscriptionSchema)) body: z.output<typeof pushSubscriptionSchema>,
  ) {
    return this.push.subscribe(auth.userId, body);
  }

  @Delete('subscriptions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.push.unsubscribe(auth.userId, id);
  }

  @Post('subscriptions/:id/test')
  @HttpCode(HttpStatus.OK)
  test(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.push.sendTest(auth.userId, id);
  }
}
