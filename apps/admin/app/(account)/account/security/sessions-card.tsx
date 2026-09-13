"use client";

import type { SessionSummary } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api, errorMessage } from "@/lib/api";

function describe(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export function SessionsCard({ sessions }: { sessions: SessionSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(id: string | null) {
    setBusy(id ?? "all");
    setError(null);
    try {
      await api(id ? `/auth/sessions/${id}` : "/auth/sessions", { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const others = sessions.filter((s) => !s.current);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Sessions</CardTitle>
            <CardDescription>Devices currently signed in to your account.</CardDescription>
          </div>
          {others.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              loading={busy === "all"}
              onClick={() => revoke(null)}
            >
              Sign out other sessions
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && (
          <Alert variant="error" className="m-6">
            {error}
          </Alert>
        )}
        <ul className="divide-y">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {describe(s.userAgent)}
                  {s.current && <Badge variant="outline">this device</Badge>}
                  {s.mfaVerified && <Badge variant="success">2FA</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.ip ?? "unknown ip"} · last active {new Date(s.lastSeenAt).toLocaleString()} ·
                  signed in {new Date(s.createdAt).toLocaleDateString()}
                </div>
              </div>
              {!s.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={busy === s.id}
                  onClick={() => revoke(s.id)}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
