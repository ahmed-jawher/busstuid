import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig, parseConfig } from './env';

@Global()
@Module({})
export class ConfigModule {
  /** Pass an explicit config in tests; otherwise it is parsed from process.env. */
  static forRoot(config?: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useFactory: () => config ?? parseConfig(process.env) }],
      exports: [APP_CONFIG],
    };
  }
}
