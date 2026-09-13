import { Module } from "@nestjs/common";

import { PasswordService } from "./password.service";
import { UserTokenService } from "./user-token.service";
import { UsersService } from "./users.service";

@Module({
  providers: [UsersService, PasswordService, UserTokenService],
  exports: [UsersService, PasswordService, UserTokenService],
})
export class UsersModule {}
