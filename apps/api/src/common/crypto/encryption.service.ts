import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../../config/env";

const VERSION = "v1";

// AES-256-GCM with a random 96-bit IV per value. Output: `v1:<iv>:<tag>:<ciphertext>` (base64url),
// so the format can carry a key/version id when rotation lands.
export function encryptWithKey(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(":");
}

export function decryptWithKey(key: Buffer, payload: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Unrecognised encrypted payload format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    const hex: string = config.get("ENCRYPTION_KEY", { infer: true });
    this.key = Buffer.from(hex, "hex");
  }

  encrypt(plaintext: string): string {
    return encryptWithKey(this.key, plaintext);
  }

  decrypt(payload: string): string {
    return decryptWithKey(this.key, payload);
  }
}
