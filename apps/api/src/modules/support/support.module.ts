import { Module } from "@nestjs/common";

import { ImpersonationService } from "./impersonation.service";
import { SupportController } from "./support.controller";

@Module({
  controllers: [SupportController],
  providers: [ImpersonationService],
})
export class SupportModule {}
