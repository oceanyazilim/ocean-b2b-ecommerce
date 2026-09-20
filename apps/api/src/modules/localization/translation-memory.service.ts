import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { TranslationMemoryLookupResult } from "@ocean/types";

import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

const hashSource = (text: string) => createHash("sha256").update(text.trim()).digest("hex");

// Translation memory (spec section 7): "If 'Add to cart' was previously translated as 'Sepete
// ekle', the platform should reuse the translation across compatible contexts." A plain exact-
// source-string -> translation cache, keyed per store + source/target locale pair. No AI
// involved — this is a lookup table, populated every time a translation is saved.
@Injectable()
export class TranslationMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async lookup(
    ctx: TenantContext,
    sourceLocale: string,
    targetLocale: string,
    sourceText: string,
  ): Promise<TranslationMemoryLookupResult | null> {
    const trimmed = sourceText.trim();
    if (!trimmed) return null;
    const row = await this.prisma.translationMemoryEntry.findFirst({
      where: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        sourceLocale,
        targetLocale,
        sourceHash: hashSource(trimmed),
      },
    });
    if (!row) return null;
    return { targetText: row.targetText, updatedAt: row.updatedAt.toISOString() };
  }

  // Called after every successful translation save. Silently a no-op when either side is blank
  // (nothing useful to remember) — never throws, translation saves must never fail because of it.
  async record(
    ctx: TenantContext,
    sourceLocale: string,
    targetLocale: string,
    sourceText: string,
    targetText: string,
  ): Promise<void> {
    const trimmedSource = sourceText.trim();
    const trimmedTarget = targetText.trim();
    if (!trimmedSource || !trimmedTarget || sourceLocale === targetLocale) return;
    const sourceHash = hashSource(trimmedSource);
    await this.prisma.translationMemoryEntry.upsert({
      where: {
        storeId_sourceLocale_targetLocale_sourceHash: {
          storeId: ctx.storeId as string,
          sourceLocale,
          targetLocale,
          sourceHash,
        },
      },
      create: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        sourceLocale,
        targetLocale,
        sourceHash,
        sourceText: trimmedSource,
        targetText: trimmedTarget,
      },
      update: { targetText: trimmedTarget, sourceText: trimmedSource },
    });
  }
}
