"use client";

export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground">This page couldn&apos;t be loaded right now.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-2 inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
      >
        Try again
      </button>
    </div>
  );
}
