// Writes openapi.json for @wusool/api-client without starting the server or touching the database.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { buildOpenApi, configureApp } from './bootstrap';
import { parseConfig } from './config/env';

async function emit(): Promise<void> {
  const config = parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://unused@127.0.0.1:1/unused',
  });
  const app = await NestFactory.create(AppModule.forRoot(config), { logger: false });
  configureApp(app, config);
  const out = path.resolve(__dirname, '../openapi.json');
  writeFileSync(out, JSON.stringify(buildOpenApi(app), null, 2) + '\n');
  await app.close();
  console.log(`✓ ${out}`);
}

void emit();
