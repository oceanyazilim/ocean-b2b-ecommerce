import { Module } from "@nestjs/common";

import { RateLimitGuard } from "../../common/rate-limit/rate-limit.guard";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, RateLimitGuard],
})
export class AuthModule {}
