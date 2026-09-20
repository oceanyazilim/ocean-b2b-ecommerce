"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Automatic customer language detection (spec section 9): a dismissible banner suggesting the
// browser's preferred storefront language, computed server-side in lib/locale.ts's
// getSuggestedLocale() from the request's Accept-Language header. Rendered only when the server
// found a genuinely better match than what's currently active — see the root layout.
export function LanguageBanner({ locale }: { locale: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"switch" | "dismiss" | null>(null);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  async function post(body: Record<string, string>) {
    await fetch("/api/locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function onSwitch() {
    setPending("switch");
    try {
      await post({ locale });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function onDismiss() {
    setPending("dismiss");
    try {
      await post({ action: "dismiss", locale });
      setHidden(true);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-secondary px-4 py-2 text-center text-sm text-secondary-foreground">
      <span>This store is also available in {locale}.</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void onSwitch()}
          disabled={pending !== null}
          className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50"
        >
          Switch to {locale}
        </button>
        <button
          type="button"
          onClick={() => void onDismiss()}
          disabled={pending !== null}
          aria-label="Dismiss language suggestion"
          className="rounded-md px-2 py-1 text-xs font-medium underline-offset-2 hover:underline disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
