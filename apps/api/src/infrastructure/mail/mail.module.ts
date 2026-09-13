import { Global, Module } from "@nestjs/common";

import { ConsoleMailAdapter } from "./console-mail.adapter";
import { MailService } from "./mail.service";
import { MAIL_ADAPTER } from "./mail.types";

// Swap the adapter provider for an SMTP/Resend/SES implementation in later phases.
@Global()
@Module({
  providers: [
    ConsoleMailAdapter,
    { provide: MAIL_ADAPTER, useExisting: ConsoleMailAdapter },
    MailService,
  ],
  exports: [MailService, ConsoleMailAdapter],
})
export class MailModule {}
