import { Controller, Get, HttpCode, HttpStatus, Inject, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../common/auth-context';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../database/prisma.service';

/**
 * Which optional services this server can actually use. Only yes/no, never a key or an address:
 * it answers "why did no email arrive?" without anyone having to open the server.
 */
class FeaturesDto {
  @ApiProperty({ description: 'Real email can be sent (verification codes reach people).' })
  email!: boolean;

  @ApiProperty({ description: 'Notifications can be delivered to Android devices.' })
  androidPush!: boolean;

  @ApiProperty({ description: 'Notifications can be delivered to iPhones.' })
  iosPush!: boolean;

  @ApiProperty({ description: 'Notifications can be delivered to browsers.' })
  webPush!: boolean;
}

class HealthDto {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status!: 'ok' | 'degraded';

  @ApiProperty({ enum: ['up', 'down'] })
  database!: 'up' | 'down';

  @ApiProperty({ format: 'date-time' })
  time!: string;

  @ApiProperty({ type: FeaturesDto })
  features!: FeaturesDto;
}

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** A mail server that is still the development default cannot reach anybody. */
  private get emailConfigured(): boolean {
    const host = this.config.smtp.host.toLowerCase();
    return host !== '127.0.0.1' && host !== 'localhost' && host.length > 0;
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: HealthDto })
  @ApiServiceUnavailableResponse({ type: HealthDto })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthDto> {
    const up = await this.db.isHealthy();
    if (!up) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: up ? 'ok' : 'degraded',
      database: up ? 'up' : 'down',
      time: new Date().toISOString(),
      features: {
        email: this.emailConfigured,
        androidPush: this.config.fcm !== null,
        iosPush: this.config.apns !== null,
        webPush: this.config.vapid.publicKey.length > 0,
      },
    };
  }
}
