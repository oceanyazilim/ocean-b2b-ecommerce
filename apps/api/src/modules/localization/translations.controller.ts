import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  productTranslationInputSchema,
  productTranslationListQuerySchema,
  systemLabelUpsertSchema,
  translationStatusUpdateSchema,
  type ProductTranslationInput,
  type ProductTranslationListQuery,
  type SystemLabelUpsertInput,
  type TranslationStatusUpdateInput,
} from "@ocean/types";
import { z } from "zod";

import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { TranslationMemoryService } from "./translation-memory.service";
import { TranslationsService } from "./translations.service";

const memoryLookupSchema = z.object({
  sourceLocale: z.string().trim().min(2).max(35),
  targetLocale: z.string().trim().min(2).max(35),
  sourceText: z.string().max(100_000),
});
type MemoryLookupInput = z.infer<typeof memoryLookupSchema>;

@Controller("stores/:storeId/translations")
export class TranslationsController {
  constructor(
    private readonly translations: TranslationsService,
    private readonly memory: TranslationMemoryService,
  ) {}

  @Get("products")
  @RequireStore("content.read")
  listProducts(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(productTranslationListQuerySchema)) query: ProductTranslationListQuery,
  ) {
    return this.translations.listProductTranslations(tenant, query);
  }

  @Get("products/:productId")
  @RequireStore("content.read")
  getProduct(
    @CurrentTenant() tenant: TenantContext,
    @Param("productId") productId: string,
    @Query("locale") locale: string,
  ) {
    return this.translations.getProductTranslation(tenant, productId, locale);
  }

  @Post("products/:productId")
  @RequireStore("content.write")
  setProduct(
    @CurrentTenant() tenant: TenantContext,
    @Param("productId") productId: string,
    @Body(new ZodValidationPipe(productTranslationInputSchema)) body: ProductTranslationInput,
  ) {
    return this.translations.setProductTranslation(tenant, productId, body);
  }

  @Patch("products/:productId/status")
  @RequireStore("content.write")
  setProductStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param("productId") productId: string,
    @Query("locale") locale: string,
    @Body(new ZodValidationPipe(translationStatusUpdateSchema)) body: TranslationStatusUpdateInput,
  ) {
    return this.translations.setProductTranslationStatus(tenant, productId, locale, body.status);
  }

  @Get("system-labels")
  @RequireStore("content.read")
  listSystemLabels(@CurrentTenant() tenant: TenantContext, @Query("locale") locale: string) {
    return this.translations.listSystemLabels(tenant, locale);
  }

  @Post("system-labels/:key")
  @RequireStore("content.write")
  setSystemLabel(
    @CurrentTenant() tenant: TenantContext,
    @Param("key") key: string,
    @Body(new ZodValidationPipe(systemLabelUpsertSchema)) body: SystemLabelUpsertInput,
  ) {
    return this.translations.upsertSystemLabel(tenant, key, body);
  }

  @Post("memory/lookup")
  @RequireStore("content.read")
  lookupMemory(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(memoryLookupSchema)) body: MemoryLookupInput,
  ) {
    return this.memory.lookup(tenant, body.sourceLocale, body.targetLocale, body.sourceText);
  }
}
