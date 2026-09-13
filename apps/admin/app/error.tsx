"use client";

import { Alert, Button } from "@ocean/ui";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6">
      <Alert variant="error" title="Something went wrong">
        {error.message || "The page failed to load."}
      </Alert>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
