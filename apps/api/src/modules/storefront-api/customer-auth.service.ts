import { Injectable } from "@nestjs/common";
import type { CustomerLoginInput, CustomerSignupInput, StorefrontCustomer } from "@ocean/types";

import { PasswordService } from "../users/password.service";
import { SessionService } from "../../common/auth/session.service";
import type { SessionRecord } from "../../common/auth/session.types";
import { ConflictError, UnauthenticatedError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { customerDisplayName } from "../customers/customer.mapper";

// Customer accounts are scoped per store (a shopper on two stores has two separate accounts).
// Signup activates immediately (no email-verification round trip yet — a deliberate scope cut,
// unlike the merchant flow in ../auth which does verify); login is gated on accountActivatedAt.
@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  private async toStorefrontCustomer(customerId: string): Promise<StorefrontCustomer> {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const membership = await this.prisma.companyUser.findFirst({
      where: { customerId, status: "active" },
      include: { company: { select: { id: true, displayName: true } } },
    });
    return {
      id: customer.id,
      email: customer.email,
      displayName: customerDisplayName(customer),
      company: membership ? membership.company : null,
    };
  }

  async signup(
    storeId: string,
    organizationId: string,
    input: CustomerSignupInput,
    meta: RequestMeta,
  ): Promise<{ customer: StorefrontCustomer; session: SessionRecord }> {
    const existing = await this.prisma.customer.findFirst({
      where: { storeId, email: input.email, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError("An account with this email already exists.", [
        { path: "email", message: "Already registered" },
      ]);
    }
    const passwordHash = await this.passwords.hash(input.password);
    const created = await this.prisma.customer.create({
      data: {
        storeId,
        organizationId,
        email: input.email,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        passwordHash,
        status: "active",
        accountActivatedAt: new Date(),
      },
    });
    const session = await this.sessions.create("customer", created.id, meta);
    await this.audit.record({
      organizationId,
      storeId,
      actorType: "customer",
      actorId: created.id,
      action: "customer.signed_up",
      resourceType: "customer",
      resourceId: created.id,
      meta,
    });
    return { customer: await this.toStorefrontCustomer(created.id), session };
  }

  async login(
    storeId: string,
    input: CustomerLoginInput,
    meta: RequestMeta,
  ): Promise<{ customer: StorefrontCustomer; session: SessionRecord }> {
    const customer = await this.prisma.customer.findFirst({
      where: { storeId, email: input.email, deletedAt: null },
    });
    const valid = customer?.passwordHash
      ? await this.passwords.verify(customer.passwordHash, input.password)
      : false;
    if (!customer || !valid || customer.status !== "active" || !customer.accountActivatedAt) {
      throw new UnauthenticatedError("Email or password is incorrect.");
    }
    const session = await this.sessions.create("customer", customer.id, meta);
    await this.audit.record({
      organizationId: customer.organizationId,
      storeId,
      actorType: "customer",
      actorId: customer.id,
      action: "customer.logged_in",
      resourceType: "customer",
      resourceId: customer.id,
      meta,
    });
    return { customer: await this.toStorefrontCustomer(customer.id), session };
  }

  async logout(session: SessionRecord, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(session.realm, session.id, session.userId);
    await this.audit.record({
      actorType: "customer",
      actorId: session.userId,
      action: "customer.logged_out",
      resourceType: "customer",
      resourceId: session.userId,
      meta,
    });
  }

  me(customerId: string): Promise<StorefrontCustomer> {
    return this.toStorefrontCustomer(customerId);
  }
}
