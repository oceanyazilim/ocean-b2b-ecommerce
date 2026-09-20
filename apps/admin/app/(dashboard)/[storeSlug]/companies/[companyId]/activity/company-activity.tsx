import type { CompanyDetail, CompanyUserSummary } from "@ocean/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ocean/ui";

interface Event {
  at: string;
  label: string;
}

// There's no audit-log lookup by resourceId (the audit-logs endpoint only filters by
// resourceType/date range across the whole store, not "this one company's history"), so — same
// approach as the customer profile's timeline — this is built from the real timestamped fields
// already on the company, its locations and its users, rather than a fabricated activity feed.
export function CompanyActivity({
  company,
  users,
}: {
  company: CompanyDetail;
  users: CompanyUserSummary[];
}) {
  const events: Event[] = [{ at: company.createdAt, label: "Company created" }];
  if (company.updatedAt && company.updatedAt !== company.createdAt) {
    events.push({ at: company.updatedAt, label: "Company profile last updated" });
  }
  for (const location of company.locations) {
    events.push({ at: location.createdAt, label: `Location "${location.name}" added` });
    if (location.updatedAt && location.updatedAt !== location.createdAt) {
      events.push({ at: location.updatedAt, label: `Location "${location.name}" updated` });
    }
  }
  for (const user of users) {
    events.push({
      at: user.createdAt,
      label: `${user.customer.displayName} added as ${user.role.replace(/_/g, " ")}`,
    });
    if (user.updatedAt && user.updatedAt !== user.createdAt) {
      events.push({
        at: user.updatedAt,
        label: `${user.customer.displayName}'s membership updated`,
      });
    }
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          Key lifecycle events for {company.displayName}, its locations and its team.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to show yet.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {events.map((e, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                <div>
                  <div className="font-medium">{e.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(e.at).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
