import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../../config/env";
import { LocalDiskStorageAdapter } from "./local-disk.adapter";
import { S3StorageAdapter } from "./s3.adapter";
import { STORAGE_ADAPTER, type StorageAdapter } from "./storage.types";

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_ADAPTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): StorageAdapter => {
        const publicBaseUrl = config.get("MEDIA_PUBLIC_URL", { infer: true });
        if (config.get("STORAGE_DRIVER", { infer: true }) === "s3") {
          const bucket = config.get("S3_BUCKET", { infer: true });
          const accessKeyId = config.get("S3_ACCESS_KEY", { infer: true });
          const secretAccessKey = config.get("S3_SECRET_KEY", { infer: true });
          if (!bucket || !accessKeyId || !secretAccessKey) {
            throw new Error(
              "STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY",
            );
          }
          return new S3StorageAdapter({
            endpoint: config.get("S3_ENDPOINT", { infer: true }),
            region: config.get("S3_REGION", { infer: true }),
            bucket,
            accessKeyId,
            secretAccessKey,
            forcePathStyle: config.get("S3_FORCE_PATH_STYLE", { infer: true }),
            publicBaseUrl,
          });
        }
        return new LocalDiskStorageAdapter(
          config.get("STORAGE_LOCAL_DIR", { infer: true }),
          publicBaseUrl,
        );
      },
    },
  ],
  exports: [STORAGE_ADAPTER],
})
export class StorageModule {}
