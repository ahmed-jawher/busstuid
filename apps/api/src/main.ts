import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApi, configureApp } from './bootstrap';
import { parseConfig } from './config/env';
import { initMonitoring } from './common/monitoring';
import { loadEnvFile } from './config/load-env-file';

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') loadEnvFile();
  const config = parseConfig(process.env);
  initMonitoring(config);
  const app = await NestFactory.create(AppModule.forRoot(config), { bufferLogs: true });
  configureApp(app, config);
  SwaggerModule.setup('docs', app, buildOpenApi(app));
  await app.listen(config.port);
}

void main();
