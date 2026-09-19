import { Module } from "@nestjs/common";

import { EncryptionService } from "../../common/crypto/encryption.service";
import { UsersModule } from "../users/users.module";
import { SsoConnectionController, SsoLoginController } from "./sso.controller";
import { SsoService } from "./sso.service";

@Module({
  imports: [UsersModule],
  controllers: [SsoConnectionController, SsoLoginController],
  providers: [SsoService, EncryptionService],
})
export class SsoModule {}
