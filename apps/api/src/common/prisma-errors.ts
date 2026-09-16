// Prisma error codes worth branching on. Kept here so services do not each redefine them.
export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

export const uniqueViolationTarget = (error: unknown): string[] =>
  isUniqueViolation(error)
    ? (((error as { meta?: { target?: unknown } }).meta?.target as string[] | undefined) ?? [])
    : [];
