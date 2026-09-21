import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG, type AppConfig } from '../config/env';

// Phase 0 uses a plain pg pool for connectivity checks; Prisma arrives with the schema in phase 1.
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
