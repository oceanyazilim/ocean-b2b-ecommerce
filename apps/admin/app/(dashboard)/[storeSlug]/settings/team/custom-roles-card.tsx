"use client";

import { STORE_PERMISSIONS, type StorePermission } from "@ocean/permissions";
import type { CustomRoleSummary } from "@ocean/types";
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
  Dialog,
  EmptyState,
  FormField,
  Input,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

// Groups the real permission catalog (packages/permissions — the same source of truth the API
// enforces) by resource, so the create-role dialog is a checklist of actual grantable permissions
// instead of a freeform text field. This is what makes "granular permissions" tangible: every box
// here is a permission string the backend actually understands, nothing invented for display.
const GROUP_LABELS: Record<string, string> = {
  products: "Products",
  collections: "Collections",
  inventory: "Inventory",
  orders: "Orders",
  fulfillments: "Fulfillments",
  returns: "Returns",
  shipping: "Shipping",
  payments: "Payments",
  taxes: "Taxes",
  customers: "Customers",
  companies: "Companies (B2B)",
  catalogs: "Catalogs",
  pricing: "Pricing",
  quotes: "Quotes",
  finance: "Finance",
  discounts: "Discounts",
  credit: "Credit",
  approvals: "Approvals",
  savedLists: "Saved lists",
  content: "Content",
  themes: "Themes",
  domains: "Domains",
  analytics: "Analytics",
  apps: "Apps",
  settings: "Settings",
  users: "Users",
};

function groupPermissions(permissions: readonly StorePermission[]): [string, StorePermission[]][] {
  const byGroup = new Map<string, StorePermission[]>();
  for (const p of permissions) {
    const group = p.split(".")[0] ?? p;
    byGroup.set(group, [...(byGroup.get(group) ?? []), p]);
  }
  return [...byGroup.entries()];
}

const PERMISSION_GROUPS = groupPermissions(STORE_PERMISSIONS);

export function CustomRolesCard({
  storeId,
  customRoles,
}: {
  storeId: string;
  customRoles: CustomRoleSummary[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<CustomRoleSummary | null>(null);
  const [deleting, setDeleting] = useState<CustomRoleSummary | null>(null);
  const createAction = useSubmit();
  const deleteAction = useSubmit();

  const allSelected = useMemo(
    () => permissions.length === STORE_PERMISSIONS.length,
    [permissions],
  );

  function toggle(permission: string) {
    setPermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission],
    );
  }

  function toggleGroup(group: StorePermission[]) {
    const groupAllSelected = group.every((p) => permissions.includes(p));
    setPermissions((prev) =>
      groupAllSelected
        ? prev.filter((p) => !group.includes(p as StorePermission))
        : [...new Set([...prev, ...group])],
    );
  }

  async function create() {
    const ok = await createAction.run(() =>
      api(`/stores/${storeId}/custom-roles`, { body: { name, permissions } }),
    );
    if (ok !== undefined) {
      setCreating(false);
      setName("");
      setPermissions([]);
      router.refresh();
    }
  }

  async function remove() {
    if (!deleting) return;
    const ok = await deleteAction.run(() =>
      api(`/stores/${storeId}/custom-roles/${deleting.id}`, { method: "DELETE" }),
    );
    if (ok !== undefined) {
      setDeleting(null);
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <div>
          <CardTitle>Custom roles</CardTitle>
          <CardDescription>
            Build any role with any set of permissions — assign it to teammates from the Members
            table below.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          Create role
        </Button>
      </CardHeader>
      <CardContent>
        {deleteAction.error && (
          <Alert variant="error" className="mb-3">
            {deleteAction.error}
          </Alert>
        )}
        {customRoles.length === 0 ? (
          <EmptyState
            title="No custom roles yet"
            description="Built-in roles cover most cases, but you can create a role with any name and exact permission set — e.g. “Warehouse manager” with only inventory and fulfillment access."
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {customRoles.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-0"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {r.name}
                    <Badge variant="secondary">
                      {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
                    </Badge>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"} ·{" "}
                    {r.permissions.slice(0, 4).join(", ")}
                    {r.permissions.length > 4 ? "…" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(r)}>
                    View
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(r)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Create custom role">
        <div className="flex max-h-[70vh] flex-col gap-3">
          {createAction.error && <Alert variant="error">{createAction.error}</Alert>}
          <FormField id="role-name" label="Name" error={createAction.fieldErrors["name"]}>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Warehouse manager"
            />
          </FormField>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Permissions
              <span className="ml-1.5 font-normal text-muted-foreground">
                ({permissions.length} of {STORE_PERMISSIONS.length} selected)
              </span>
            </span>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setPermissions(allSelected ? [] : [...STORE_PERMISSIONS])}
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          <div className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-md border p-3">
            {PERMISSION_GROUPS.map(([group, groupPermissions]) => {
              const groupAllSelected = groupPermissions.every((p) => permissions.includes(p));
              return (
                <div key={group}>
                  <button
                    type="button"
                    className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    onClick={() => toggleGroup(groupPermissions)}
                  >
                    <Checkbox checked={groupAllSelected} onChange={() => toggleGroup(groupPermissions)} />
                    {GROUP_LABELS[group] ?? group}
                  </button>
                  <div className="ml-1 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                    {groupPermissions.map((p) => (
                      <label key={p} className="flex items-center gap-1.5 text-sm">
                        <Checkbox checked={permissions.includes(p)} onChange={() => toggle(p)} />
                        {p.split(".")[1]}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <Button
            onClick={() => void create()}
            loading={createAction.pending}
            disabled={!name || permissions.length === 0}
          >
            Create role
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={expanded !== null}
        onClose={() => setExpanded(null)}
        title={expanded ? `${expanded.name} — permissions` : ""}
      >
        <div className="flex flex-wrap gap-1.5">
          {expanded?.permissions.map((p) => (
            <Badge key={p} variant="outline" className="font-mono text-[11px]">
              {p}
            </Badge>
          ))}
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="Members currently assigned this role would need to be reassigned first — this only succeeds if none are."
        destructive
        pending={deleteAction.pending}
        onConfirm={remove}
      />
    </Card>
  );
}
