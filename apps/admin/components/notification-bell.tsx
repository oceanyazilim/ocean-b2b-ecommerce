"use client";

import type { NotificationSummary } from "@ocean/types";
import { Badge, BellIcon, Skeleton } from "@ocean/ui";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, errorMessage } from "@/lib/api";

const POLL_MS = 20_000;

export function NotificationBell({ storeId }: { storeId: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    try {
      const res = await api<{ data: { count: number } }>(`/stores/${storeId}/notifications/unread-count`);
      setCount(res.data.count);
    } catch {
      // Transient failure — the badge just keeps its last known count until the next poll.
    }
  }, [storeId]);

  useEffect(() => {
    void loadCount();
    const id = setInterval(() => void loadCount(), POLL_MS);
    return () => clearInterval(id);
  }, [loadCount]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function loadList() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ data: NotificationSummary[] }>(`/stores/${storeId}/notifications?limit=10`);
      setItems(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) await loadList();
  }

  async function markRead(n: NotificationSummary) {
    if (n.readAt) return;
    setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? prev);
    setCount((c) => Math.max(0, c - 1));
    try {
      await api(`/stores/${storeId}/notifications/${n.id}/read`, { method: "POST" });
    } catch {
      // Resync from the server rather than trying to precisely undo the optimistic change —
      // simpler, and self-corrects any other drift too.
      await Promise.all([loadCount(), loadList()]);
    }
  }

  async function markAllRead() {
    setItems((prev) => prev?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? prev);
    setCount(0);
    try {
      await api(`/stores/${storeId}/notifications/read-all`, { method: "POST" });
    } catch {
      await Promise.all([loadCount(), loadList()]);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label="Notifications"
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <BellIcon size={17} />
        {count > 0 && (
          <Badge variant="destructive" className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] justify-center px-1 py-0 text-[10px]">
            {count > 99 ? "99+" : count}
          </Badge>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border bg-background shadow-popover">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => void markAllRead()}
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="p-3">
                <Skeleton className="h-16 w-full" />
              </div>
            )}
            {error && <div className="p-3 text-sm text-destructive">{error}</div>}
            {!loading && items?.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
            )}
            {!loading &&
              items?.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void markRead(n)}
                  className={`block w-full border-b px-3 py-2 text-left last:border-0 hover:bg-muted/50 ${
                    n.readAt ? "" : "bg-accent/40"
                  }`}
                >
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
