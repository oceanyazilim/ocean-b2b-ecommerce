"use client";

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
  EmptyState,
  FormField,
  Input,
  Select,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

import { CustomRolesCard } from "./custom-roles-card";

const roleLabel = (role: string) => role.replace(/_/g, " ");
const BUILT_IN_ROLES = STORE_ROLES.filter((r) => r !== "custom");

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
    const reason = window.prompt(`Why are you viewing as ${name}? (recorded in the audit log)`);
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

  return (
    <div className="flex flex-col gap-6">
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

      <CustomRolesCard storeId={storeId} customRoles={customRoles} />

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{members.length} active</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-6 py-2 font-medium">Person</th>
                  <th className="px-6 py-2 font-medium">Role</th>
                  <th className="px-6 py-2 font-medium">Joined</th>
                  <th className="px-6 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((m) => {
                  const self = m.userId === currentUserId;
                  return (
                    <tr key={m.userId}>
                      <td className="px-6 py-3">
                        <div className="font-medium">
                          {m.name} {self && <Badge variant="outline">you</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                      </td>
                      <td className="px-6 py-3">
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
                              api(`/stores/${storeId}/members/${m.userId}`, {
                                method: "PATCH",
                                body,
                              }),
                            );
                          }}
                          className="h-8 w-44"
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
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {new Date(m.joinedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {!self && (
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
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
