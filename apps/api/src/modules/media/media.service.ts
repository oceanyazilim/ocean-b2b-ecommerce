import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { Media, MediaKind, Prisma } from "@ocean/db";
import {
  MEDIA_MAX_BYTES,
  type MediaListQuery,
  type MediaSummary,
  type Paginated,
} from "@ocean/types";
import { fromBuffer } from "file-type";
import sharp from "sharp";

import { NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { STORAGE_ADAPTER, type StorageAdapter } from "../../infrastructure/storage/storage.types";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";

const ALLOWED: Record<string, MediaKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/avif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "application/pdf": "document",
};

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

type MediaRow = Media & { _count: { products: number; collections: number } };

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  private toSummary(row: MediaRow): MediaSummary {
    return {
      id: row.id,
      kind: row.kind,
      url: this.storage.publicUrl(row.storageKey),
      mime: row.mime,
      bytes: row.bytes,
      width: row.width,
      height: row.height,
      alt: row.alt,
      originalFilename: row.originalFilename,
      usageCount: row._count.products + row._count.collections,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private scope(ctx: TenantContext): Prisma.MediaWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId, deletedAt: null };
  }

  async list(ctx: TenantContext, query: MediaListQuery): Promise<Paginated<MediaSummary>> {
    const rows = await this.prisma.media.findMany({
      where: {
        ...this.scope(ctx),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.q
          ? {
              OR: [
                { originalFilename: { contains: query.q, mode: "insensitive" } },
                { alt: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { products: true, collections: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((r) => this.toSummary(r)),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async get(ctx: TenantContext, id: string): Promise<MediaSummary> {
    const row = await this.prisma.media.findFirst({
      where: { ...this.scope(ctx), id },
      include: { _count: { select: { products: true, collections: true } } },
    });
    if (!row) throw new NotFoundError("Media");
    return this.toSummary(row);
  }

  // The filename and declared content type are never trusted; the bytes decide.
  async upload(ctx: TenantContext, file: UploadedFile, meta: RequestMeta): Promise<MediaSummary> {
    if (!file || !file.buffer?.length)
      throw new ValidationError("No file received.", [{ path: "file", message: "Required" }]);
    if (file.size > MEDIA_MAX_BYTES) {
      throw new ValidationError(
        `Files must be at most ${Math.round(MEDIA_MAX_BYTES / 1024 / 1024)} MB.`,
        [{ path: "file", message: "Too large" }],
      );
    }
    const sniffed = await fromBuffer(file.buffer);
    const mime = sniffed?.mime ?? "";
    const kind = ALLOWED[mime];
    if (!kind) {
      throw new ValidationError(
        "Unsupported file type. Use JPEG, PNG, WebP, GIF, AVIF, MP4, WebM or PDF.",
        [{ path: "file", message: "Unsupported type" }],
      );
    }

    let width: number | null = null;
    let height: number | null = null;
    if (kind === "image") {
      try {
        const info = await sharp(file.buffer, { limitInputPixels: 80_000_000 }).metadata();
        width = info.width ?? null;
        height = info.height ?? null;
      } catch {
        throw new ValidationError("The image could not be read.", [
          { path: "file", message: "Corrupt image" },
        ]);
      }
    }

    const key = `stores/${ctx.storeId}/${kind}s/${randomUUID()}.${sniffed?.ext ?? "bin"}`;
    await this.storage.put(key, file.buffer, mime);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.media.create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          kind,
          storageKey: key,
          mime,
          bytes: file.size,
          width,
          height,
          originalFilename: safeFilename(file.originalname),
          createdById: ctx.actor.id,
        },
        include: { _count: { select: { products: true, collections: true } } },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "media.uploaded",
          resourceType: "media",
          resourceId: created.id,
          after: { kind, mime, bytes: file.size },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "media.uploaded", { mediaId: created.id, kind }, tx);
      return created;
    });
    return this.toSummary(row);
  }

  async updateAlt(ctx: TenantContext, id: string, alt: string | null): Promise<MediaSummary> {
    const row = await this.prisma.media.findFirst({ where: { ...this.scope(ctx), id } });
    if (!row) throw new NotFoundError("Media");
    await this.prisma.media.update({ where: { id }, data: { alt } });
    return this.get(ctx, id);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const row = await this.prisma.media.findFirst({ where: { ...this.scope(ctx), id } });
    if (!row) throw new NotFoundError("Media");
    await this.prisma.$transaction(async (tx) => {
      await tx.productMedia.deleteMany({ where: { mediaId: id } });
      await tx.collection.updateMany({ where: { imageMediaId: id }, data: { imageMediaId: null } });
      await tx.media.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "media.deleted",
          resourceType: "media",
          resourceId: id,
          before: { storageKey: row.storageKey },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "media.deleted", { mediaId: id }, tx);
    });
    await this.storage.delete(row.storageKey);
  }
}

function safeFilename(name: string): string {
  const base = (name ?? "upload").split(/[\\/]/).pop() ?? "upload";
  return base.replace(/[^\w.\- ()]+/g, "_").slice(0, 200) || "upload";
}
