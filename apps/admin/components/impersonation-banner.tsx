"use client";

import type { ImpersonationSessionSummary } from "@ocean/types";
import { Button } from "@ocean/ui";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";

export function ImpersonationBanner({ storeId }: { storeId: string }) {
  const [status, setStatus] = useState<ImpersonationSessionSummary | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ data: ImpersonationSessionSummary | null }>(`/stores/${storeId}/support/impersonation-status`)
      .then((res) => {
        if (!cancelled) setStatus(res.data);
      })
      .catch(() => {
        // A failed check just means no banner shows — never block the page on it.
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  async function end() {
    setEnding(true);
    try {
      await api(`/stores/${storeId}/support/impersonate/end`, { method: "POST" });
    } finally {
      window.location.reload();
    }
  }

  if (!status) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-warning/20 px-4 py-2 text-sm text-warning-foreground">
      <span>
        Viewing as <strong>{status.targetName}</strong> ({status.targetEmail}) — {status.reason}
      </span>
      <Button size="sm" variant="outline" onClick={() => void end()} loading={ending}>
        End impersonation
      </Button>
    </div>
  );
}
