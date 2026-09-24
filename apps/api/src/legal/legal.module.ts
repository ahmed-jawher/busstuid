import { Body, Controller, Get, Global, Headers, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { acceptLegalSchema } from '@wusool/shared';
import type { z } from 'zod';
import { Audit } from '../audit/audit';
import { Auth, ClientIp, type AuthContext } from '../common/auth-context';
import { ApiZodBody, zod } from '../common/zod';
import { LegalService } from './legal.service';

@ApiTags('legal')
@ApiBearerAuth()
@Controller('me/legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  /** What this account has agreed to, and whether a newer version is waiting. */
  @Get()
  status(@Auth() auth: AuthContext) {
    return this.legal.statusOf(auth.userId);
  }

  @Post('accept')
  @Audit('legal.accept', 'user', { bodyFields: ['documents', 'version'] })
  @ApiZodBody(acceptLegalSchema)
  accept(
    @Auth() auth: AuthContext,
    @Body(zod(acceptLegalSchema)) body: z.output<typeof acceptLegalSchema>,
    @ClientIp() ip: string | null,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.legal.accept(auth.userId, body.documents, body.version, { ip, userAgent });
  }
}

@Global()
@Module({
  controllers: [LegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}
