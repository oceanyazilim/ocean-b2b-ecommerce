import { Button } from "@ocean/ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-6">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Ocean Commerce
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">Storefront</h1>
      <p className="text-base text-muted-foreground">
        Theme engine and storefront runtime arrive in Phases 8–9.
      </p>
      <Button>Design system button</Button>
    </main>
  );
}
