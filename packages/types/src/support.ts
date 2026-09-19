import { z } from "zod";

export const startImpersonationInputSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
export type StartImpersonationInput = z.infer<typeof startImpersonationInputSchema>;

export interface ImpersonationSessionSummary {
  id: string;
  targetUserId: string;
  targetName: string;
  targetEmail: string;
  reason: string;
  expiresAt: string;
  endedAt: string | null;
  createdAt: string;
}
