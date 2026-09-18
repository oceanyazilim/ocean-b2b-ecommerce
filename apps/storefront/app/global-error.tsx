"use client";

// Only catches errors thrown by the root layout itself; page-level errors use app/error.tsx.
// Must render its own <html>/<body> since it replaces the root layout entirely when it fires.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-muted-foreground">This storefront couldn&apos;t be loaded right now.</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-2 inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
