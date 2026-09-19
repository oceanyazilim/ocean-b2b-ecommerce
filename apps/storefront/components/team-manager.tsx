"use client";

import { COMPANY_ROLES, type CompanyRole, type CompanyUserSummary } from "@ocean/types";
import { Badge, Button } from "@ocean/ui";
import { useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/client-api";

const ROLE_LABELS: Record<CompanyRole, string> = {
  company_admin: "Admin",
  buyer: "Buyer",
  approver: "Approver",
  finance: "Finance",
  viewer: "Viewer",
};

export function TeamManager({ initialMembers }: { initialMembers: CompanyUserSummary[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<CompanyRole>("buyer");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await api<{ data: CompanyUserSummary }>("/account/team", {
        body: {
          email,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          role,
          allLocations: true,
        },
      });
      setMembers((prev) => [...prev, created.data]);
      setEmail("");
      setFirstName("");
      setLastName("");
      setRole("buyer");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function onRoleChange(id: string, nextRole: CompanyRole) {
    setBusyId(id);
    setError(null);
    try {
      const updated = await api<{ data: CompanyUserSummary }>(`/account/team/${id}`, {
        method: "PATCH",
        body: { role: nextRole },
      });
      setMembers((prev) => prev.map((m) => (m.id === id ? updated.data : m)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onRemove(id: string) {
    if (!confirm("Remove this teammate from your company?")) return;
    setBusyId(id);
    setError(null);
    try {
      await api(`/account/team/${id}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((member) => (
              <tr key={member.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">{member.customer.displayName}</p>
                  <p className="text-muted-foreground">{member.customer.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={member.role}
                    disabled={busyId === member.id}
                    onChange={(e) => void onRoleChange(member.id, e.target.value as CompanyRole)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {COMPANY_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={member.status === "active" ? "success" : "outline"}>{member.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === member.id}
                    onClick={() => void onRemove(member.id)}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No teammates yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={(e) => void onInvite(e)} className="flex flex-col gap-3 rounded-lg border p-4 sm:max-w-md">
        <h2 className="text-sm font-semibold">Add a teammate</h2>
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <div className="flex gap-3">
          <input
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="h-9 w-1/2 rounded-md border border-input bg-background px-3 text-sm"
          />
          <input
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="h-9 w-1/2 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as CompanyRole)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {COMPANY_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add teammate"}
        </Button>
      </form>
    </div>
  );
}
