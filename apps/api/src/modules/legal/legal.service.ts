import { Injectable } from "@nestjs/common";
import type {
  LegalPageRequirementSummary,
  LegalRequirementStatus,
  MarketLegalStatus,
} from "@ocean/types";

import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

// L6 Global Localization (spec section 46, "local legal content"): a merchant sees, per active
// market, which conventional legal pages that market's country expects — driven entirely by the
// LegalPageRequirement catalog (data, never a code branch) — cross-referenced against real Page
// rows the merchant has already created. A requirement is "created" the moment a Page exists
// tagged with its `code` (see Page.legalRequirementCode); this deliberately reuses the existing
// Page CRUD rather than a parallel content system.
@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  async listRequirementsForCountry(countryCode: string): Promise<LegalPageRequirementSummary[]> {
    const code = countryCode.trim().toUpperCase();
    const rows = await this.prisma.legalPageRequirement.findMany({
      where: { countryCode: code },
      orderBy: { position: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      countryCode: r.countryCode,
      code: r.code,
      label: r.label,
      description: r.description,
      isRequired: r.isRequired,
      position: r.position,
    }));
  }

  async getStatusForStore(ctx: TenantContext): Promise<MarketLegalStatus[]> {
    const markets = await this.prisma.market.findMany({
      where: { storeId: ctx.storeId as string, organizationId: ctx.organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (markets.length === 0) return [];

    const countryCodes = [...new Set(markets.map((m) => m.countryCode))];
    const [requirements, pages] = await Promise.all([
      this.prisma.legalPageRequirement.findMany({
        where: { countryCode: { in: countryCodes } },
        orderBy: { position: "asc" },
      }),
      this.prisma.page.findMany({
        where: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          legalRequirementCode: { not: null },
        },
        select: { id: true, title: true, handle: true, status: true, legalRequirementCode: true },
      }),
    ]);

    // Last Page wins if a merchant somehow tagged two pages with the same code — not something
    // the create flow below allows in practice (the admin dialog only offers a code that's still
    // missing), but keeps this read-side lookup total either way.
    const pageByCode = new Map(pages.map((p) => [p.legalRequirementCode as string, p]));

    return markets.map((market) => {
      const reqs = requirements.filter((r) => r.countryCode === market.countryCode);
      return {
        marketId: market.id,
        marketName: market.name,
        countryCode: market.countryCode,
        requirements: reqs.map((r): LegalRequirementStatus => {
          const page = pageByCode.get(r.code);
          return {
            code: r.code,
            label: r.label,
            description: r.description,
            isRequired: r.isRequired,
            status: page ? "created" : "missing",
            page: page
              ? { id: page.id, title: page.title, handle: page.handle, status: page.status }
              : null,
          };
        }),
      };
    });
  }
}
