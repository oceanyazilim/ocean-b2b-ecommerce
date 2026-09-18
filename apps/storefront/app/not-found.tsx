import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">We couldn&apos;t find what you were looking for.</p>
      <Link href="/" className="text-sm font-medium underline">
        Back to home
      </Link>
    </div>
  );
}
