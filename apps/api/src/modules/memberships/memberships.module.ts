import { Module } from "@nestjs/common";

import { UsersModule } from "../users/users.module";
import { InvitationsController, StoreMembersController } from "./memberships.controller";
import { MembershipsRepository } from "./memberships.repository";
import { MembershipsService } from "./memberships.service";

@Module({
  imports: [UsersModule],
  controllers: [StoreMembersController, InvitationsController],
  providers: [MembershipsService, MembershipsRepository],
})
export class MembershipsModule {}
