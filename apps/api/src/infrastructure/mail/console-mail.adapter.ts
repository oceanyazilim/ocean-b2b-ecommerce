import { Injectable, Logger } from "@nestjs/common";

import type { MailAdapter, MailMessage } from "./mail.types";

// Development adapter: prints the message so verification/reset links can be copied
// from the API log. Also keeps the last messages in memory for integration tests.
@Injectable()
export class ConsoleMailAdapter implements MailAdapter {
  private readonly logger = new Logger("Mail");
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    if (this.sent.length > 50) this.sent.shift();
    this.logger.log(`To: ${message.to}\nSubject: ${message.subject}\n${message.text}`);
  }

  lastTo(email: string): MailMessage | undefined {
    for (let i = this.sent.length - 1; i >= 0; i -= 1) {
      if (this.sent[i]?.to === email) return this.sent[i];
    }
    return undefined;
  }
}
