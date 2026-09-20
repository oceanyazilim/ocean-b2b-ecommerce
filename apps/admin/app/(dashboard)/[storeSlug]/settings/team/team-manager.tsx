"use client";

import { STORE_ROLE_PERMISSIONS, type StoreRole } from "@ocean/permissions";
import { STORE_ROLES, type CustomRoleSummary, type InvitationSummary, type StoreMemberSummary } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataGrid,
  EmptyState,
  FormField,
  Input,
  Select,
  type DataGridColumn,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

import { CustomRolesCard } from "./custom-roles-card";

const roleLabel = (role: string) => role.replace(/_/g, " ");
const BUILT_IN_ROLES = STORE_ROLES.filter((r): r is Exclude<StoreRole, "custom"> => r !== "custom");

// Short, human descriptions of what each built-in role can actually do — derived by eye from
// STORE_ROLE_PERMISSIONS (packages/permissions), not a separate source of truth. The permission
// *count* shown next to each card is computed live from that same table, so it can't drift.
const ROLE_DESCRIPTIONS: Record<Exclude<StoreRole, "custom">, string> = {
  store_owner: "Full access to everything in this store, including billing and users.",
  admin: "Full access to everything except managing other users' roles.",
  store_manager: "Day-to-day operations — products, orders, customers, companies, quotes, discounts, content.",
  product_manager: "Manage products, collections, and inventory.",
  order_manager: "Manage orders, fulfillments, returns, and quotes.",
  marketing: "Manage collections, discounts, content, and themes.",
  finance: "Manage payments, taxes, credit, and view finance reports.",
  developer: "Manage themes, domains, and store settings; install apps.",
  viewer: "Read-only access across the whole store.",
};

export function TeamManager({
  storeId,
  storeSlug,
  currentUserId,
  members,
  invitations,
  customRoles,
}: {
  storeId: string;
  storeSlug: string;
  currentUserId: string;
  members: StoreMemberSummary[];
  invitations: InvitationSummary[];
  customRoles: CustomRoleSummary[];
}) {
  const router = useRouter();
  const invite = useSubmit();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("viewer");
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [impersonateBusy, setImpersonateBusy] = useState<string | null>(null);

  async function viewAs(userId: string, name: string) {
    const reason = window.prompt(`Why are you viewing as ${name}? (recorded in the activity log)`);
    if (!reason || reason.trim().length < 3) return;
    setImpersonateBusy(userId);
    setRowError(null);
    try {
      await api(`/stores/${storeId}/support/impersonate`, { body: { userId, reason: reason.trim() } });
      // A full navigation, not a client-side route change: the impersonated session's cookie
      // needs to be the one every subsequent request (including this page's own data) uses.
      window.location.href = `/${storeSlug}`;
    } catch (err) {
      setRowError(errorMessage(err));
      setImpersonateBusy(null);
    }
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    const res = await invite.run(() =>
      api(`/stores/${storeId}/invitations`, { body: { email, role } }),
    );
    if (res !== undefined) {
      setEmail("");
      router.refresh();
    }
  }

  async function mutate(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setRowError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setRowError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const columns: DataGridColumn<StoreMemberSummary>[] = [
    {
      key: "person",
      header: "Person",
      cell: (m) => (
        <div>
          <div className="flex items-center gap-2 font-medium">
            {m.name}
            {m.userId === currentUserId && <Badge variant="outline">you</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">{m.email}</div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (m) => (
        <Select
          aria-label={`Role for ${m.name}`}
          value={m.customRole ? `custom:${m.customRole.id}` : m.role}
          disabled={busy === m.userId}
          onChange={(e) => {
            const v = e.target.value;
            const body = v.startsWith("custom:")
              ? { role: "custom", customRoleId: v.slice(7) }
              : { role: v };
            void mutate(m.userId, () =>
              api(`/stores/${storeId}/members/${m.userId}`, { method: "PATCH", body }),
            );
          }}
          className="h-8 w-48"
        >
          {BUILT_IN_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
          {customRoles.length > 0 && (
            <optgroup label="Custom roles">
              {customRoles.map((cr) => (
                <option key={cr.id} value={`custom:${cr.id}`}>
                  {cr.name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      ),
    },
    {
      key: "joined",
      header: "Joined",
      cell: (m) => (
        <span className="text-muted-foreground">{new Date(m.joinedAt).toLocaleDateString()}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (m) =>
        m.userId === currentUserId ? null : (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={impersonateBusy === m.userId}
              onClick={() => void viewAs(m.userId, m.name)}
            >
              View as
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={busy === m.userId}
              onClick={() => {
                if (!window.confirm(`Remove ${m.name} from this store?`)) return;
                void mutate(m.userId, () =>
                  api(`/stores/${storeId}/members/${m.userId}`, { method: "DELETE" }),
                );
              }}
            >
              Remove
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Users & permissions</h2>
        <p className="text-sm text-muted-foreground">
          Who can access this store, what they can do, and role-based access control.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Members" value={String(members.length)} />
        <StatTile label="Pending invitations" value={String(invitations.length)} />
        <StatTile label="Built-in roles" value={String(BUILT_IN_ROLES.length)} />
        <StatTile label="Custom roles" value={String(customRoles.length)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite a teammate</CardTitle>
          <CardDescription>They receive an email link that expires in 7 days.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={onInvite}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            noValidate
          >
            <FormField
              id="invite-email"
              label="Email"
              error={invite.fieldErrors["email"]}
              className="flex-1"
            >
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                invalid={!!invite.fieldErrors["email"]}
              />
            </FormField>
            <FormField
              id="invite-role"
              label="Role"
              error={invite.fieldErrors["role"]}
              className="sm:w-48"
            >
              <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value)}>
                {BUILT_IN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button type="submit" loading={invite.pending}>
              Send invite
            </Button>
          </form>
          {invite.error && !Object.keys(invite.fieldErrors).length && (
            <Alert variant="error" className="mt-3">
              {invite.error}
            </Alert>
          )}
        </CardContent>
      </Card>

      {rowError && <Alert variant="error">{rowError}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Built-in roles</CardTitle>
          <CardDescription>
            Ship with the platform — assign one from the Members table below, or build your own
            below with exactly the permissions you need.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BUILT_IN_ROLES.map((r) => (
            <div key={r} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium capitalize">{roleLabel(r)}</span>
                <Badge variant="secondary">{STORE_ROLE_PERMISSIONS[r].length} permissions</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <CustomRolesCard storeId={storeId} customRoles={customRoles} />

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{members.length} active</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <DataGrid
            columns={columns}
            rows={members}
            rowKey={(m) => m.userId}
            className="rounded-none border-0"
            empty={{ title: "No members yet" }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>{invitations.length} waiting</CardDescription>
        </CardHeader>
        <CardContent className={invitations.length ? "p-0" : undefined}>
          {invitations.length === 0 ? (
            <EmptyState
              title="No pending invitations"
              description="Invite teammates above and they will show up here until they accept."
            />
          ) : (
            <ul className="divide-y">
              {invitations.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-4 px-6 py-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{i.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {roleLabel(i.role)} · invited by {i.invitedBy.name} · expires{" "}
                      {new Date(i.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={busy === i.id}
                    onClick={() =>
                      mutate(i.id, () =>
                        api(`/stores/${storeId}/invitations/${i.id}`, { method: "DELETE" }),
                      )
                    }
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}
