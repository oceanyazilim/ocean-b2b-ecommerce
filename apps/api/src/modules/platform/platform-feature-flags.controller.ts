import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import {
  createFeatureFlagInputSchema,
  setFeatureFlagTargetInputSchema,
  updateFeatureFlagInputSchema,
  type CreateFeatureFlagInput,
  type SetFeatureFlagTargetInput,
  type UpdateFeatureFlagInput,
} from "@ocean/types";

import { CurrentPlatformOperatorId } from "../../common/auth/current-platform-operator.decorator";
import { Public } from "../../common/auth/public.decorator";
import { PlatformRoleGuard } from "../../common/auth/platform-role.guard";
import { PlatformSessionGuard } from "../../common/auth/platform-session.guard";
import { RequirePlatformRole } from "../../common/auth/require-platform-role.decorator";
import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { PlatformFeatureFlagsService } from "./platform-feature-flags.service";

// list/read stays open to any active operator (viewer and up); every mutation below requires at
// least the "operator" role — see PlatformRoleGuard and the PlatformOperator model's comment in
// schema.prisma.
@Controller("platform/feature-flags")
@Public()
@UseGuards(PlatformSessionGuard, PlatformRoleGuard)
export class PlatformFeatureFlagsController {
  constructor(private readonly flags: PlatformFeatureFlagsService) {}

  @Get()
  list() {
    return this.flags.list();
  }

  @Post()
  @RequirePlatformRole("operator")
  create(
    @Body(new ZodValidationPipe(createFeatureFlagInputSchema)) body: CreateFeatureFlagInput,
    @CurrentPlatformOperatorId() operatorId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.flags.create(body, operatorId, meta);
  }

  @Patch(":key")
  @RequirePlatformRole("operator")
  update(
    @Param("key") key: string,
    @Body(new ZodValidationPipe(updateFeatureFlagInputSchema)) body: UpdateFeatureFlagInput,
    @CurrentPlatformOperatorId() operatorId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.flags.update(key, body, operatorId, meta);
  }

  @Put(":key/targets")
  @RequirePlatformRole("operator")
  setTarget(
    @Param("key") key: string,
    @Body(new ZodValidationPipe(setFeatureFlagTargetInputSchema)) body: SetFeatureFlagTargetInput,
    @CurrentPlatformOperatorId() operatorId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.flags.setTarget(key, body, operatorId, meta);
  }

  @Delete(":key/targets/:targetId")
  @RequirePlatformRole("operator")
  removeTarget(
    @Param("key") key: string,
    @Param("targetId") targetId: string,
    @CurrentPlatformOperatorId() operatorId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.flags.removeTarget(key, targetId, operatorId, meta);
  }
}
