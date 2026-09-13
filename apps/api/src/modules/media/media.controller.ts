import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  MEDIA_MAX_BYTES,
  mediaListQuerySchema,
  updateMediaSchema,
  type MediaListQuery,
  type UpdateMediaInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { MediaService, type UploadedFile as Upload } from "./media.service";

@Controller("stores/:storeId/media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  @RequireStore("products.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(mediaListQuerySchema)) query: MediaListQuery,
  ) {
    return this.media.list(tenant, query);
  }

  @Post()
  @RequireStore("content.write")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MEDIA_MAX_BYTES, files: 1 } }))
  upload(
    @CurrentTenant() tenant: TenantContext,
    @UploadedFile() file: Upload,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.media.upload(tenant, file, meta);
  }

  @Get(":mediaId")
  @RequireStore("products.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("mediaId") id: string) {
    return this.media.get(tenant, id);
  }

  @Patch(":mediaId")
  @RequireStore("content.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("mediaId") id: string,
    @Body(new ZodValidationPipe(updateMediaSchema)) body: UpdateMediaInput,
  ) {
    return this.media.updateAlt(tenant, id, body.alt);
  }

  @Delete(":mediaId")
  @RequireStore("content.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("mediaId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.media.remove(tenant, id, meta);
  }
}
