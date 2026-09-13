import type { LoginEventSummary, MfaStatus, SessionSummary } from "@ocean/types";

import { api } from "@/lib/api";
import { cookieHeader, requireMe } from "@/lib/session";

import { LoginHistory } from "./login-history";
import { MfaCard } from "./mfa-card";
import { SessionsCard } from "./sessions-card";

export const metadata = { title: "Security · Ocean Admin" };

export default async function SecurityPage() {
  await requireMe("/account/security");
  const cookie = await cookieHeader();
  const [mfa, sessions, events] = await Promise.all([
    api<{ data: MfaStatus }>("/auth/mfa", { cookie }),
    api<{ data: SessionSummary[] }>("/auth/sessions", { cookie }),
    api<{ data: LoginEventSummary[] }>("/auth/login-events", { cookie }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <MfaCard status={mfa.data} />
      <SessionsCard sessions={sessions.data} />
      <LoginHistory events={events.data} />
    </div>
  );
}
