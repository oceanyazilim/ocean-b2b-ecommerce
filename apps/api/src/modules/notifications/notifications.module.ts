import { Module } from "@nestjs/common";

import { NotificationsController } from "./notifications.controller";
import { NotificationsRelayService } from "./notifications-relay.service";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRelayService],
  exports: [NotificationsService, NotificationsRelayService],
})
export class NotificationsModule {}
