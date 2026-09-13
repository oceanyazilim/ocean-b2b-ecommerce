import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="mb-8 flex items-center gap-2">
        <span className="inline-block h-6 w-6 rounded-md bg-primary" aria-hidden />
        <span className="text-sm font-semibold tracking-tight">Ocean Commerce</span>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
