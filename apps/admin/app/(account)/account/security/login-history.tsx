import type { LoginEventSummary } from "@ocean/types";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@ocean/ui";

const OUTCOME_LABEL: Record<
  LoginEventSummary["outcome"],
  { label: string; variant: "success" | "destructive" | "warning" | "secondary" }
> = {
  success: { label: "Signed in", variant: "success" },
  failed_password: { label: "Wrong password", variant: "destructive" },
  failed_mfa: { label: "Wrong 2FA code", variant: "destructive" },
  mfa_required: { label: "2FA requested", variant: "secondary" },
  locked: { label: "Locked", variant: "warning" },
};

export function LoginHistory({ events }: { events: LoginEventSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent sign-in activity</CardTitle>
        <CardDescription>
          Last {events.length} attempts. New locations and devices are flagged.
        </CardDescription>
      </CardHeader>
      <CardContent className={events.length ? "p-0" : undefined}>
        {events.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <ul className="divide-y">
            {events.map((e) => {
              const meta = OUTCOME_LABEL[e.outcome];
              return (
                <li
                  key={e.id}
                  className="flex flex-col gap-1 px-6 py-3 text-sm sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="w-40 shrink-0 text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                  <Badge variant={meta.variant} className="w-fit">
                    {meta.label}
                  </Badge>
                  <span className="truncate text-muted-foreground">{e.ip ?? "unknown ip"}</span>
                  <span className="flex gap-1">
                    {e.riskFlags.map((f) => (
                      <Badge key={f} variant="warning">
                        {f.replace("_", " ")}
                      </Badge>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
