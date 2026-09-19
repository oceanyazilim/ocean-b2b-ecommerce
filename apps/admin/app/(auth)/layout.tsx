import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="mb-8 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          O
        </span>
        <span className="text-base font-semibold tracking-tight">Ocean Commerce</span>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
