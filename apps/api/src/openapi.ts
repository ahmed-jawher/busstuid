// Writes openapi.json for @wusool/api-client without starting the server or touching the database.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { buildOpenApi, configureApp } from './bootstrap';
import { parseConfig } from './config/env';

async function emit(): Promise<void> {
  // Placeholder values: nothing connects or signs anything while the document is built.
  const unused = 'unused-placeholder-value-for-openapi-emit';
  const config = parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://unused@127.0.0.1:1/unused',
    DATABASE_SYSTEM_URL: 'postgres://unused@127.0.0.1:1/unused',
    JWT_ACCESS_SECRET: unused,
    JWT_REFRESH_SECRET: unused,
    FIELD_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    PHOTO_URL_SECRET: unused,
    VAPID_PUBLIC_KEY: unused,
    VAPID_PRIVATE_KEY: unused,
  });
  const app = await NestFactory.create(AppModule.forRoot(config), { logger: false });
  configureApp(app, config);
  const out = path.resolve(__dirname, '../openapi.json');
  writeFileSync(out, JSON.stringify(buildOpenApi(app), null, 2) + '\n');
  await app.close();
  console.log(`✓ ${out}`);
}

void emit();
