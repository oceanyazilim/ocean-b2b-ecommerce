import { hash, verify } from "@node-rs/argon2";
import { Injectable } from "@nestjs/common";

// argon2id, OWASP-recommended parameters. Rehash on login if these ever change.
const PARAMS = { memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain, PARAMS);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain);
    } catch {
      return false;
    }
  }
}
