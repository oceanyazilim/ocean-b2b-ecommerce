import type { CustomRoleSummary, InvitationSummary, StoreMemberSummary } from "@ocean/types";
import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { api } from "@/lib/api";
import { can, cookieHeader, findStore, requireMe } from "@/lib/session";

import { TeamManager } from "./team-manager";

export const metadata = { title: "Team · Ocean Admin" };

export default async function TeamPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const me = await requireMe(`/${storeSlug}/settings/team`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { store } = found;

  if (!can(store, "users.manage")) {
    return (
      <Alert variant="warning" title="Team management is restricted">
        Your role ({store.role?.replace(/_/g, " ") ?? "organization member"}) cannot manage the
        team. Ask a store owner or admin.
      </Alert>
    );
  }

  const cookie = await cookieHeader();
  const [members, invitations, customRoles] = await Promise.all([
    api<{ data: StoreMemberSummary[] }>(`/stores/${store.id}/members`, { cookie }),
    api<{ data: InvitationSummary[] }>(`/stores/${store.id}/invitations`, { cookie }),
    api<{ data: CustomRoleSummary[] }>(`/stores/${store.id}/custom-roles`, { cookie }),
  ]);

  return (
    <TeamManager
      storeId={store.id}
      storeSlug={storeSlug}
      currentUserId={me.user.id}
      members={members.data}
      invitations={invitations.data}
      customRoles={customRoles.data}
    />
  );
}
