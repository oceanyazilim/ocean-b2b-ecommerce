"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/client-api";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await api("/auth/logout", { body: {} });
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={pending}
      className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
