import { Module } from '@nestjs/common';
import { OrgSetupController } from './org-setup.controller';
import { OrgSetupService } from './org-setup.service';

@Module({
  controllers: [OrgSetupController],
  providers: [OrgSetupService],
})
export class OrgSetupModule {}
