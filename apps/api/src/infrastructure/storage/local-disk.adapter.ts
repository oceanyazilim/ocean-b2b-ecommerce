import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";

import type { StorageAdapter } from "./storage.types";

// Development adapter: files live under STORAGE_LOCAL_DIR and are served by the API via
// express.static at MEDIA_PUBLIC_URL. Keys are validated so nothing can escape the root.
export class LocalDiskStorageAdapter implements StorageAdapter {
  readonly root: string;

  constructor(
    rootDir: string,
    private readonly publicBaseUrl: string,
  ) {
    this.root = isAbsolute(rootDir) ? rootDir : resolve(process.cwd(), rootDir);
  }

  private pathFor(key: string): string {
    const normalized = normalize(key).replace(/\\/g, "/");
    if (normalized.startsWith("/") || normalized.includes("..")) {
      throw new Error(`Refusing unsafe storage key: ${key}`);
    }
    return join(this.root, normalized);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }
}
