import { listAccountTeam } from "@/lib/account";
import { isApiError } from "@/lib/api";
import { TeamManager } from "@/components/team-manager";

export default async function AccountTeamPage() {
  // A signed-in individual buyer (no company) or a non-admin company member can land here
  // directly (bookmark, back button, typed URL) even though AccountSidebar hides this link for
  // them. The API throws ForbiddenError in that case — treat it the same way
  // company/page.tsx treats "no membership": a graceful not-available message, not a crash.
  let members: Awaited<ReturnType<typeof listAccountTeam>> | null = null;
  try {
    members = await listAccountTeam();
  } catch (error) {
    if (!isApiError(error, "forbidden")) throw error;
  }

  if (!members) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          Team management isn&apos;t available for your account.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
      <p className="text-sm text-muted-foreground">
        Invite teammates to buy on behalf of your company and manage what they can do.
      </p>
      <TeamManager initialMembers={members} />
    </div>
  );
}
