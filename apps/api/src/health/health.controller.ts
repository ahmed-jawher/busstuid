import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { DatabaseService } from '../database/database.service';

class HealthDto {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status!: 'ok' | 'degraded';

  @ApiProperty({ enum: ['up', 'down'] })
  database!: 'up' | 'down';

  @ApiProperty({ format: 'date-time' })
  time!: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

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
    };
  }
}
