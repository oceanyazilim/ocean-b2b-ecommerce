import { listAccountTeam } from "@/lib/account";
import { TeamManager } from "@/components/team-manager";

export default async function AccountTeamPage() {
  const members = await listAccountTeam();

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
