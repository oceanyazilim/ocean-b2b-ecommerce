import { Injectable } from "@nestjs/common";
import type { AppBlockDefinitionSummary, CreateAppBlockDefinitionInput } from "@ocean/types";
import type { Prisma } from "@ocean/db";

import { ConflictError, NotFoundError } from "../../common/errors/domain-error";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

function toSummary(def: {
  id: string;
  type: string;
  label: string;
  settingsSchema: unknown;
  createdAt: Date;
}): AppBlockDefinitionSummary {
  return {
    id: def.id,
    type: def.type,
    label: def.label,
    settingsSchema: (def.settingsSchema as Record<string, unknown>[]) ?? [],
    createdAt: def.createdAt.toISOString(),
  };
}

// A registry of block TYPES an app offers, real and queryable — not yet merged into the live
// theme editor's block picker (see the model comment in schema.prisma for why that's deferred).
@Injectable()
export class AppBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireApp(tenant: TenantContext, appId: string) {
    const app = await this.prisma.developerApp.findFirst({
      where: { id: appId, storeId: tenant.storeId as string },
    });
    if (!app) throw new NotFoundError("App");
    return app;
  }

  async list(tenant: TenantContext, appId: string): Promise<AppBlockDefinitionSummary[]> {
    await this.requireApp(tenant, appId);
    const defs = await this.prisma.appBlockDefinition.findMany({
      where: { appId },
      orderBy: { createdAt: "asc" },
    });
    return defs.map(toSummary);
  }

  async create(
    tenant: TenantContext,
    appId: string,
    input: CreateAppBlockDefinitionInput,
  ): Promise<AppBlockDefinitionSummary> {
    await this.requireApp(tenant, appId);
    try {
      const created = await this.prisma.appBlockDefinition.create({
        data: {
          appId,
          type: input.type,
          label: input.label,
          settingsSchema: input.settingsSchema as Prisma.InputJsonValue,
        },
      });
      return toSummary(created);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictError(`This app already has a block type "${input.type}".`, [
          { path: "type", message: "Already registered" },
        ]);
      }
      throw error;
    }
  }
}
