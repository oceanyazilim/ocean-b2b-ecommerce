import { Injectable, PipeTransform } from "@nestjs/common";
import type { ApiFieldError } from "@ocean/types";
import type { ZodType } from "zod";

import { ValidationError } from "../errors/domain-error";

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const fields: ApiFieldError[] = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }));
    const first = fields[0];
    const summary = first?.path ? `${first.path}: ${first.message}` : (first?.message ?? "Invalid");
    throw new ValidationError(`Request validation failed — ${summary}`, fields);
  }
}
