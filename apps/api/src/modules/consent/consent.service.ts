import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  ConsentCategoryDefinition,
  ConsentDecisionInput,
  ConsentRecordSummary,
  ConsentRulesResponse,
  TrackingScriptInput,
  TrackingScriptSummary,
  UpdateTrackingScriptInput,
} from "@ocean/types";

import { ConflictError, NotFoundError } from "../../common/errors/domain-error";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

type TrackingScriptRow = Prisma.TrackingScriptGetPayload<Record<string, never>>;
type ConsentRecordRow = Prisma.ConsentRecordGetPayload<Record<string, never>>;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

// L6 Global Localization (spec section 47, "cookie & privacy consent architecture").
//
// Scope note on "third-party script controls": this module gives a merchant a real, persisted
// list of the tracking scripts they use, each tagged with a cookie category, plus a correctly
// computed "is this category allowed" signal derived from an actual visitor's ConsentRecord (see
// isCategoryAllowed below) or from the store's own opt-in/opt-out default (see
// TrackingScriptSummary.allowedByDefault). It deliberately does NOT dynamically inject or block
// <script> tags on the storefront — that would be a much larger sandboxing/CSP engine, out of
// scope for this pass. A future loader integration wires its own script-injection logic to
// isCategoryAllowed(...) using the visitor's actual consent choice from GET .../consent/rules.
@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly categoryDefs: ConsentCategoryDefinition[] = [
    {
      key: "necessary",
      label: "Necessary",
      description:
        "Required for the storefront to work at all (cart, checkout, security) — cannot be turned off.",
      isAlwaysOn: true,
    },
    {
      key: "functional",
      label: "Functional",
      description: "Remembers preferences like language, currency, and recently viewed items.",
      isAlwaysOn: false,
    },
    {
      key: "analytics",
      label: "Analytics",
      description: "Helps us understand how visitors use the store so we can improve it.",
      isAlwaysOn: false,
    },
    {
      key: "marketing",
      label: "Marketing",
      description: "Used to show relevant ads and measure the performance of marketing campaigns.",
      isAlwaysOn: false,
    },
  ];

  listCategories(): ConsentCategoryDefinition[] {
    return this.categoryDefs;
  }

  // Whether a given category is allowed to run under a specific visitor's actual recorded
  // consent — the real integration point a script loader should call, per the module comment.
  isCategoryAllowed(
    category: ConsentCategoryDefinition["key"],
    consent: { necessary: boolean; functional: boolean; analytics: boolean; marketing: boolean },
  ): boolean {
    if (category === "necessary") return true;
    return consent[category];
  }

  private scopeScript(ctx: TenantContext): Prisma.TrackingScriptWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private async resolveDefaultMarket(
    ctx: TenantContext,
  ): Promise<{ id: string; countryCode: string } | null> {
    const market = await this.prisma.market.findFirst({
      where: { storeId: ctx.storeId as string, organizationId: ctx.organizationId, isDefault: true },
    });
    return market ? { id: market.id, countryCode: market.countryCode } : null;
  }

  private async resolveOptInRequired(countryCode: string | null): Promise<boolean> {
    // No market/country context at all: fall back to the conservative (opt-in-required) rule,
    // same as CountryProfile.consentOptInRequired's own schema default.
    if (!countryCode) return true;
    const profile = await this.prisma.countryProfile.findUnique({ where: { countryCode } });
    return profile?.consentOptInRequired ?? true;
  }

  // --- Tracking scripts (merchant-configured, store-scoped) ---

  private toScriptSummary(row: TrackingScriptRow, optInRequired: boolean): TrackingScriptSummary {
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      category: row.category,
      snippet: row.snippet,
      isEnabled: row.isEnabled,
      allowedByDefault: row.category === "necessary" ? true : !optInRequired,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listScripts(ctx: TenantContext): Promise<TrackingScriptSummary[]> {
    const market = await this.resolveDefaultMarket(ctx);
    const optInRequired = await this.resolveOptInRequired(market?.countryCode ?? null);
    const rows = await this.prisma.trackingScript.findMany({
      where: this.scopeScript(ctx),
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toScriptSummary(r, optInRequired));
  }

  async createScript(ctx: TenantContext, input: TrackingScriptInput): Promise<TrackingScriptSummary> {
    const created = await this.prisma.trackingScript
      .create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          name: input.name,
          provider: input.provider ?? null,
          category: input.category,
          snippet: input.snippet ?? null,
          isEnabled: input.isEnabled,
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("A tracking script with this name already exists.");
        throw error;
      });
    const market = await this.resolveDefaultMarket(ctx);
    const optInRequired = await this.resolveOptInRequired(market?.countryCode ?? null);
    return this.toScriptSummary(created, optInRequired);
  }

  async updateScript(
    ctx: TenantContext,
    id: string,
    input: UpdateTrackingScriptInput,
  ): Promise<TrackingScriptSummary> {
    const current = await this.prisma.trackingScript.findFirst({ where: { ...this.scopeScript(ctx), id } });
    if (!current) throw new NotFoundError("Tracking script");

    const data: Prisma.TrackingScriptUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.provider !== undefined) data.provider = input.provider;
    if (input.category !== undefined) data.category = input.category;
    if (input.snippet !== undefined) data.snippet = input.snippet;
    if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;

    const updated = await this.prisma.trackingScript
      .update({ where: { id }, data })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("A tracking script with this name already exists.");
        throw error;
      });
    const market = await this.resolveDefaultMarket(ctx);
    const optInRequired = await this.resolveOptInRequired(market?.countryCode ?? null);
    return this.toScriptSummary(updated, optInRequired);
  }

  async removeScript(ctx: TenantContext, id: string): Promise<void> {
    const current = await this.prisma.trackingScript.findFirst({ where: { ...this.scopeScript(ctx), id } });
    if (!current) throw new NotFoundError("Tracking script");
    await this.prisma.trackingScript.delete({ where: { id } });
  }

  // --- Consent rules (storefront-facing) ---

  async getConsentRules(
    ctx: TenantContext,
    countryCodeParam: string | undefined,
    visitorId: string | null,
  ): Promise<ConsentRulesResponse> {
    let countryCode = countryCodeParam?.trim().toUpperCase() || null;
    if (!countryCode) {
      const market = await this.resolveDefaultMarket(ctx);
      countryCode = market?.countryCode ?? null;
    }
    const optInRequired = await this.resolveOptInRequired(countryCode);

    let current: ConsentRulesResponse["current"] = null;
    if (visitorId) {
      const record = await this.prisma.consentRecord.findFirst({
        where: { storeId: ctx.storeId as string, organizationId: ctx.organizationId, visitorId },
        orderBy: { createdAt: "desc" },
      });
      if (record) {
        current = {
          necessary: record.necessary,
          functional: record.functional,
          analytics: record.analytics,
          marketing: record.marketing,
        };
      }
    }

    return { categories: this.categoryDefs, optInRequired, countryCode, current };
  }

  // --- Consent logging (storefront-facing write) ---

  private toRecordSummary(row: ConsentRecordRow): ConsentRecordSummary {
    return {
      id: row.id,
      visitorId: row.visitorId,
      customerId: row.customerId,
      countryCode: row.countryCode,
      marketId: row.marketId,
      necessary: row.necessary,
      functional: row.functional,
      analytics: row.analytics,
      marketing: row.marketing,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async recordConsent(
    ctx: TenantContext,
    visitorId: string,
    input: ConsentDecisionInput,
    customerId: string | null,
    userAgent: string | null,
  ): Promise<ConsentRecordSummary> {
    let countryCode = input.countryCode ?? null;
    let marketId = input.marketId ?? null;
    if (!countryCode || !marketId) {
      const market = await this.resolveDefaultMarket(ctx);
      countryCode = countryCode ?? market?.countryCode ?? null;
      marketId = marketId ?? market?.id ?? null;
    }

    const created = await this.prisma.consentRecord.create({
      data: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        visitorId,
        customerId,
        countryCode,
        marketId,
        necessary: true,
        functional: input.functional,
        analytics: input.analytics,
        marketing: input.marketing,
        source: input.source,
        userAgent,
      },
    });
    return this.toRecordSummary(created);
  }

  // Admin-facing compliance visibility — the most recent consent decisions logged for this
  // store, newest first.
  async listRecords(ctx: TenantContext, limit = 50): Promise<ConsentRecordSummary[]> {
    const rows = await this.prisma.consentRecord.findMany({
      where: { storeId: ctx.storeId as string, organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((r) => this.toRecordSummary(r));
  }
}
