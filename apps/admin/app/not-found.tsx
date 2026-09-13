import { Button } from "@ocean/ui";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t find that page</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The store may not exist or you may not have access to it.
      </p>
      <Link href="/">
        <Button variant="outline">Back to home</Button>
      </Link>
    </main>
  );
}
