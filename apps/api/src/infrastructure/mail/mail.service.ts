import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../../config/env";
import { MAIL_ADAPTER, type MailAdapter } from "./mail.types";

@Injectable()
export class MailService {
  private readonly adminUrl: string;

  constructor(
    @Inject(MAIL_ADAPTER) private readonly adapter: MailAdapter,
    config: ConfigService<Env, true>,
  ) {
    this.adminUrl = config.get("ADMIN_URL", { infer: true }).replace(/\/+$/, "");
  }

  verificationLink(token: string): string {
    return `${this.adminUrl}/verify-email?token=${encodeURIComponent(token)}`;
  }

  passwordResetLink(token: string): string {
    return `${this.adminUrl}/reset-password?token=${encodeURIComponent(token)}`;
  }

  invitationLink(token: string): string {
    return `${this.adminUrl}/invitations/${encodeURIComponent(token)}`;
  }

  async sendEmailVerification(to: string, name: string, token: string): Promise<void> {
    const link = this.verificationLink(token);
    await this.adapter.send({
      to,
      subject: "Verify your email address",
      text: `Hi ${name},\n\nConfirm your email address to finish setting up Ocean Commerce:\n${link}\n\nThis link expires in 24 hours.`,
    });
  }

  async sendPasswordReset(to: string, name: string, token: string): Promise<void> {
    const link = this.passwordResetLink(token);
    await this.adapter.send({
      to,
      subject: "Reset your password",
      text: `Hi ${name},\n\nReset your Ocean Commerce password:\n${link}\n\nIf you did not request this, you can ignore this email. The link expires in 1 hour.`,
    });
  }

  async sendNewDeviceSignIn(
    to: string,
    name: string,
    details: { ip: string | null; userAgent: string | null; at: Date },
  ): Promise<void> {
    await this.adapter.send({
      to,
      subject: "New sign-in to your Ocean Commerce account",
      text: `Hi ${name},\n\nYour account was just signed into from a device or location we have not seen before.\n\nWhen: ${details.at.toISOString()}\nIP: ${details.ip ?? "unknown"}\nDevice: ${details.userAgent ?? "unknown"}\n\nIf this was you, no action is needed. If not, reset your password at ${this.adminUrl}/forgot-password and enable two-factor authentication under Account → Security.`,
    });
  }

  async sendInvitation(
    to: string,
    invitedBy: string,
    storeName: string,
    role: string,
    token: string,
  ): Promise<void> {
    const link = this.invitationLink(token);
    await this.adapter.send({
      to,
      subject: `${invitedBy} invited you to ${storeName}`,
      text: `${invitedBy} invited you to join ${storeName} on Ocean Commerce as ${role}.\n\nAccept the invitation:\n${link}\n\nThe invitation expires in 7 days.`,
    });
  }
}
