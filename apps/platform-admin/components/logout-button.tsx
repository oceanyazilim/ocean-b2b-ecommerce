"use client";

import { Button } from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={logout} loading={pending}>
      Sign out
    </Button>
  );
}
