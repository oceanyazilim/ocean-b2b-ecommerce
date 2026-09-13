import { Module } from "@nestjs/common";

import { EncryptionService } from "../../common/crypto/encryption.service";
import { RateLimitGuard } from "../../common/rate-limit/rate-limit.guard";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoginEventsService } from "./login-events.service";
import { MfaService } from "./mfa.service";

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, MfaService, LoginEventsService, EncryptionService, RateLimitGuard],
})
export class AuthModule {}
