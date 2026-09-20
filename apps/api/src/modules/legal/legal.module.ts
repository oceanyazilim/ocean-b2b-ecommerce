import { Module } from "@nestjs/common";

import { LegalController, LegalRequirementsController } from "./legal.controller";
import { LegalService } from "./legal.service";

@Module({
  controllers: [LegalController, LegalRequirementsController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}
