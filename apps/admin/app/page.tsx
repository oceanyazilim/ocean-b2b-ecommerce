import { Button } from "@ocean/ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-6">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Ocean Commerce
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">Merchant Admin</h1>
      <p className="text-base text-muted-foreground">
        Sign-in, organizations and stores arrive in Phase 1.
      </p>
      <Button>Design system button</Button>
    </main>
  );
}
