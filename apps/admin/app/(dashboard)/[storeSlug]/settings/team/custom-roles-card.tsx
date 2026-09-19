"use client";

import type { CustomRoleSummary } from "@ocean/types";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, FormField, Input, TagInput } from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

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
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const createAction = useSubmit();

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

  async function remove(id: string) {
    setBusy(id);
    setRowError(null);
    try {
      await api(`/stores/${storeId}/custom-roles/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setRowError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle>Custom roles</CardTitle>
          <CardDescription>Store-defined permission sets, assignable from the Members table below.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          Create role
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rowError && <Alert variant="error">{rowError}</Alert>}
        {customRoles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No custom roles yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {customRoles.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-0">
                <div>
                  <p className="font-medium">
                    {r.name} <Badge variant="secondary">{r.memberCount} member{r.memberCount === 1 ? "" : "s"}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">{r.permissions.join(", ")}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === r.id}
                  onClick={() => void remove(r.id)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Create custom role">
        <div className="flex flex-col gap-3">
          {createAction.error && <Alert variant="error">{createAction.error}</Alert>}
          <FormField id="role-name" label="Name">
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField id="role-permissions" label="Permissions" hint="e.g. orders.read, orders.write, products.read">
            <TagInput id="role-permissions" value={permissions} onChange={setPermissions} />
          </FormField>
          <Button onClick={() => void create()} loading={createAction.pending} disabled={!name || permissions.length === 0}>
            Create
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
