import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";

import type { Env } from "../../config/env";
import { RedisService } from "../../infrastructure/redis/redis.service";
import {
  customerSessionCookie,
  MERCHANT_SESSION_COOKIE,
  type SessionRealm,
  type SessionRecord,
} from "./session.types";

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

// Sessions written before Phase 1b have no mfaVerified field.
type StoredSession = Omit<SessionRecord, "mfaVerified"> & { mfaVerified?: boolean };

function parseRecord(raw: string): SessionRecord {
  const stored = JSON.parse(raw) as StoredSession;
  return { ...stored, mfaVerified: stored.mfaVerified ?? false };
}

export function signSessionId(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

export function parseSessionCookie(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const expected = signSessionId(id, secret);
  if (signature.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? id : null;
}

@Injectable()
export class SessionService {
  private readonly secret: string;
  private readonly idleTtl: number;
  private readonly absoluteTtl: number;
  private readonly secureCookie: boolean;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get("SESSION_SECRET", { infer: true });
    this.idleTtl = config.get("SESSION_IDLE_TTL_SECONDS", { infer: true });
    this.absoluteTtl = config.get("SESSION_ABSOLUTE_TTL_SECONDS", { infer: true });
    this.secureCookie = config.get("COOKIE_SECURE", { infer: true });
  }

  private key(realm: SessionRealm, id: string): string {
    return `sess:${realm}:${id}`;
  }

  private userIndexKey(realm: SessionRealm, userId: string): string {
    return `user_sessions:${realm}:${userId}`;
  }

  async create(
    realm: SessionRealm,
    userId: string,
    meta: { ip: string | null; userAgent: string | null },
    options: { mfaVerified?: boolean } = {},
  ): Promise<SessionRecord> {
    const now = Date.now();
    const record: SessionRecord = {
      id: randomBytes(32).toString("base64url"),
      realm,
      userId,
      createdAt: now,
      lastSeenAt: now,
      ip: meta.ip,
      userAgent: meta.userAgent,
      mfaVerified: options.mfaVerified ?? false,
    };
    await this.redis.client
      .multi()
      .set(this.key(realm, record.id), JSON.stringify(record), "EX", this.idleTtl)
      .sadd(this.userIndexKey(realm, userId), record.id)
      .expire(this.userIndexKey(realm, userId), this.absoluteTtl)
      .exec();
    return record;
  }

  async load(realm: SessionRealm, id: string): Promise<SessionRecord | null> {
    const raw = await this.redis.client.get(this.key(realm, id));
    if (!raw) return null;
    const record = parseRecord(raw);
    if (Date.now() - record.createdAt > this.absoluteTtl * 1000) {
      await this.revoke(realm, id, record.userId);
      return null;
    }
    if (Date.now() - record.lastSeenAt > TOUCH_INTERVAL_MS) {
      record.lastSeenAt = Date.now();
      await this.redis.client.set(this.key(realm, id), JSON.stringify(record), "EX", this.idleTtl);
    }
    return record;
  }

  async listForUser(realm: SessionRealm, userId: string): Promise<SessionRecord[]> {
    const ids = await this.redis.client.smembers(this.userIndexKey(realm, userId));
    if (ids.length === 0) return [];
    const raws = await this.redis.client.mget(ids.map((id) => this.key(realm, id)));
    const alive: SessionRecord[] = [];
    const stale: string[] = [];
    raws.forEach((raw, i) => {
      const id = ids[i] as string;
      if (raw) alive.push(parseRecord(raw));
      else stale.push(id);
    });
    if (stale.length) await this.redis.client.srem(this.userIndexKey(realm, userId), ...stale);
    return alive.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async revoke(realm: SessionRealm, id: string, userId: string): Promise<void> {
    await this.redis.client
      .multi()
      .del(this.key(realm, id))
      .srem(this.userIndexKey(realm, userId), id)
      .exec();
  }

  async revokeAllForUser(realm: SessionRealm, userId: string, keepId?: string): Promise<number> {
    const ids = (await this.redis.client.smembers(this.userIndexKey(realm, userId))).filter(
      (id) => id !== keepId,
    );
    if (ids.length === 0) return 0;
    const multi = this.redis.client.multi();
    for (const id of ids) multi.del(this.key(realm, id));
    multi.srem(this.userIndexKey(realm, userId), ...ids);
    await multi.exec();
    return ids.length;
  }

  cookieValue(id: string): string {
    return `${id}.${signSessionId(id, this.secret)}`;
  }

  idFromCookie(value: string | undefined): string | null {
    return parseSessionCookie(value, this.secret);
  }

  attachCookie(res: Response, record: SessionRecord): void {
    res.cookie(MERCHANT_SESSION_COOKIE, this.cookieValue(record.id), {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: this.idleTtl * 1000,
    });
  }

  clearCookie(res: Response): void {
    res.clearCookie(MERCHANT_SESSION_COOKIE, {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: "lax",
      path: "/",
    });
  }

  attachCustomerCookie(res: Response, storeId: string, record: SessionRecord): void {
    res.cookie(customerSessionCookie(storeId), this.cookieValue(record.id), {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: this.idleTtl * 1000,
    });
  }

  clearCustomerCookie(res: Response, storeId: string): void {
    res.clearCookie(customerSessionCookie(storeId), {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: "lax",
      path: "/",
    });
  }
}
