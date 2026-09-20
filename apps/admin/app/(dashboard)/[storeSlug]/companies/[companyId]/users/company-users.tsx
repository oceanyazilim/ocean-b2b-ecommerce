"use client";

import { COMPANY_ROLE_PERMISSIONS, type CompanyPermission } from "@ocean/permissions";
import {
  COMPANY_ROLES,
  type CompanyDetail,
  type CompanyRole,
  type CompanyUserSummary,
  type CustomerCandidate,
} from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Select,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

// Friendly labels for the spec's "Owner, Buyer, Approver, Accountant, Viewer" role vocabulary,
// mapped onto this codebase's real CompanyRole enum (company_admin/buyer/approver/finance/viewer)
// — the only roles the permission engine actually understands. "Company admin" is the Owner
// equivalent; "Finance" is the Accountant equivalent.
const ROLE_LABEL: Record<CompanyRole, string> = {
  company_admin: "Company admin",
  buyer: "Buyer",
  approver: "Approver",
  finance: "Finance",
  viewer: "Viewer",
};

const ROLE_HINT: Record<CompanyRole, string> = {
  company_admin: "Manages the company, its team, orders and quotes (the Owner role)",
  buyer: "Creates orders and quote requests",
  approver: "Approves orders that need sign-off",
  finance: "Sees invoices and statements (the Accountant role)",
  viewer: "Read-only",
};

// Every string here is a real CompanyPermission from @ocean/permissions — the same table
// COMPANY_ROLE_PERMISSIONS is checked against server-side. No fabricated "view pricing" or
// "manage payment terms" permission is listed because the engine doesn't have one: catalog/price
// visibility rides along with company.read (any company member sees the prices that apply to
// them), so it isn't its own toggle.
const PERMISSION_LABEL: Record<CompanyPermission, string> = {
  "company.read": "View company profile, locations & catalog pricing",
  "company.write": "Edit company profile",
  "company.members.manage": "Manage users",
  "company.orders.create": "Place orders",
  "company.orders.approve": "Approve orders",
  "company.quotes.create": "Create quote requests",
  "company.invoices.read": "View invoices",
};

function RolesAndPermissions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles &amp; permissions</CardTitle>
        <CardDescription>
          What each role can actually do, straight from the permission engine that enforces it on
          every request.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {COMPANY_ROLES.map((role) => (
          <div key={role} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">{ROLE_LABEL[role]}</span>
              <span className="text-sm text-muted-foreground">{ROLE_HINT[role]}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COMPANY_ROLE_PERMISSIONS[role].map((permission) => (
                <Badge key={permission} variant="secondary">
                  {PERMISSION_LABEL[permission]}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

type Editing = { kind: "new" } | { kind: "edit"; user: CompanyUserSummary } | null;

export function CompanyUsers({
  storeId,
  storeSlug,
  company,
  users,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  company: CompanyDetail;
  users: CompanyUserSummary[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<CompanyUserSummary | null>(null);
  const action = useSubmit();
  const base = `/stores/${storeId}/companies/${company.id}/users`;

  const columns: DataGridColumn<CompanyUserSummary>[] = [
    {
      key: "user",
      header: "User",
      cell: (u) => (
        <div>
          <Link
            href={`/${storeSlug}/customers/${u.customer.id}`}
            className="font-medium hover:underline"
          >
            {u.customer.displayName}
          </Link>
          <div className="text-xs text-muted-foreground">
            {u.customer.email}
            {u.title ? ` · ${u.title}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (u) => <Badge variant="secondary">{ROLE_LABEL[u.role]}</Badge>,
    },
    {
      key: "locations",
      header: "Locations",
      cell: (u) => (
        <span className="text-muted-foreground">
          {u.allLocations ? "All locations" : u.locations.map((l) => l.name).join(", ") || "None"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (u) => (
        <div className="flex gap-1">
          <Badge variant={u.status === "active" ? "success" : "secondary"}>{u.status}</Badge>
          {u.customer.status !== "active" && <Badge variant="warning">customer disabled</Badge>}
          {!u.customer.hasAccount && <Badge variant="secondary">no login yet</Badge>}
        </div>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (u: CompanyUserSummary) => (
              <div className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ kind: "edit", user: u })}
                >
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRemoving(u)}>
                  Remove
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<CompanyUserSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          The people who can act on behalf of {company.displayName} — buy, approve, view invoices
          or manage the team, depending on their role.
        </p>
        {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>Add user</Button>}
      </div>
      {action.error && <Alert variant="error">{action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={users}
        rowKey={(u) => u.id}
        empty={{
          title: "No users yet",
          description: "Add a buyer or company admin from an existing customer or a new email.",
          action: canWrite ? (
            <Button onClick={() => setEditing({ kind: "new" })}>Add first user</Button>
          ) : undefined,
        }}
      />
      <RolesAndPermissions />
      <UserDialog
        storeId={storeId}
        base={base}
        locations={company.locations.map((l) => ({ id: l.id, name: l.name }))}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.customer.displayName ?? "user"} from ${company.displayName}?`}
        description="The customer record stays; they just stop acting for this company."
        confirmLabel="Remove"
        destructive
        pending={action.pending}
        onConfirm={async () => {
          if (!removing) return;
          const ok = await action.run(() => api(`${base}/${removing.id}`, { method: "DELETE" }));
          if (ok !== undefined) {
            setRemoving(null);
            router.refresh();
          }
        }}
      />
    </div>
  );
}

function UserDialog({
  storeId,
  base,
  locations,
  editing,
  onClose,
  onSaved,
}: {
  storeId: string;
  base: string;
  locations: { id: string; name: string }[];
  editing: Editing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const current = editing?.kind === "edit" ? editing.user : null;
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<CustomerCandidate[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<CompanyRole>("buyer");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [allLocations, setAllLocations] = useState(true);
  const [locationIds, setLocationIds] = useState<string[]>([]);

  useEffect(() => {
    reset();
    setMode("existing");
    setQ("");
    setCustomerId("");
    setEmail("");
    setFirstName("");
    setLastName("");
    setRole(current?.role ?? "buyer");
    setTitle(current?.title ?? "");
    setStatus(current?.status ?? "active");
    setAllLocations(current?.allLocations ?? true);
    setLocationIds(current?.locations.map((l) => l.id) ?? []);
  }, [current, editing, reset]);

  useEffect(() => {
    if (editing?.kind !== "new" || mode !== "existing") return;
    const handle = setTimeout(() => {
      void api<{ data: CustomerCandidate[] }>(
        `/stores/${storeId}/customers/search?q=${encodeURIComponent(q)}&limit=20`,
      )
        .then((res) => setCandidates(res.data))
        .catch(() => setCandidates([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [editing, mode, q, storeId]);

  function toggleLocation(id: string) {
    setLocationIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const scope = { allLocations, locationIds: allLocations ? [] : locationIds };
    const res = await submit.run(() =>
      current
        ? api(`${base}/${current.id}`, {
            method: "PATCH",
            body: { role, status, title: title.trim() || null, ...scope },
          })
        : api(base, {
            body: {
              ...(mode === "existing"
                ? { customerId }
                : {
                    email,
                    firstName: firstName.trim() || null,
                    lastName: lastName.trim() || null,
                  }),
              role,
              title: title.trim() || null,
              ...scope,
            },
          }),
    );
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog
      open={editing !== null}
      onClose={onClose}
      title={current ? `Edit ${current.customer.displayName}` : "Add company user"}
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="company-user-form"
            loading={submit.pending}
            disabled={!current && mode === "existing" && !customerId}
          >
            {current ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <form
        id="company-user-form"
        onSubmit={(e) => void onSubmit(e)}
        className="flex flex-col gap-4"
      >
        {submit.error && <Alert variant="error">{submit.error}</Alert>}

        {!current && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "existing"}
                  onChange={() => setMode("existing")}
                />
                Existing customer
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "new"}
                  onChange={() => setMode("new")}
                />
                New by email
              </label>
            </div>
            {mode === "existing" ? (
              <>
                <FormField
                  id="cu-search"
                  label="Find customer"
                  error={submit.fieldErrors.customerId}
                >
                  <Input
                    id="cu-search"
                    placeholder="Name or email"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    autoFocus
                  />
                </FormField>
                <div
                  role="listbox"
                  aria-label="Matching customers"
                  className="max-h-48 overflow-y-auto rounded-md border text-sm"
                >
                  {candidates.length === 0 && (
                    <p className="px-3 py-2 text-muted-foreground">No matching customers.</p>
                  )}
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={customerId === c.id}
                      onClick={() => setCustomerId(c.id)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent ${
                        customerId === c.id ? "bg-accent font-medium" : ""
                      }`}
                    >
                      <span>{c.displayName}</span>
                      <span className="text-xs text-muted-foreground">{c.email}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  id="cu-email"
                  label="Email"
                  error={submit.fieldErrors.email}
                  className="sm:col-span-2"
                >
                  <Input
                    id="cu-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    invalid={!!submit.fieldErrors.email}
                    autoFocus
                  />
                </FormField>
                <FormField id="cu-first" label="First name">
                  <Input
                    id="cu-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    maxLength={80}
                  />
                </FormField>
                <FormField id="cu-last" label="Last name">
                  <Input
                    id="cu-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    maxLength={80}
                  />
                </FormField>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            id="cu-role"
            label="Role"
            hint={ROLE_HINT[role]}
            error={submit.fieldErrors.role}
          >
            <Select
              id="cu-role"
              value={role}
              onChange={(e) => setRole(e.target.value as CompanyRole)}
            >
              {COMPANY_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="cu-title" label="Job title" error={submit.fieldErrors.title}>
            <Input
              id="cu-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
            />
          </FormField>
          {current && (
            <FormField id="cu-status" label="Membership status">
              <Select
                id="cu-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "disabled")}
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </Select>
            </FormField>
          )}
        </div>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="font-medium">Location access</legend>
          <label className="flex items-center gap-2">
            <Checkbox checked={allLocations} onChange={(e) => setAllLocations(e.target.checked)} />
            All locations, including ones added later
          </label>
          {!allLocations && (
            <div className="flex flex-col gap-1 rounded-md border p-2">
              {locations.length === 0 && (
                <p className="text-muted-foreground">This company has no locations yet.</p>
              )}
              {locations.map((l) => (
                <label key={l.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={locationIds.includes(l.id)}
                    onChange={() => toggleLocation(l.id)}
                  />
                  {l.name}
                </label>
              ))}
            </div>
          )}
          {submit.fieldErrors.locationIds && (
            <p role="alert" className="text-xs text-destructive">
              {submit.fieldErrors.locationIds}
            </p>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}
