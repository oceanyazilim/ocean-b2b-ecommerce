import Link from "next/link";

import { listCollections } from "@/lib/storefront";

export default async function CollectionsPage() {
  const collections = await listCollections();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Collections</h1>
      {collections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No collections yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {collections.map((c) => (
            <Link
              key={c.id}
              href={`/collections/${c.handle}`}
              className="group flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:border-foreground/30"
            >
              <div className="aspect-video overflow-hidden rounded-md bg-muted">
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image.url} alt={c.image.alt ?? c.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No image</div>
                )}
              </div>
              <span className="text-sm font-medium">{c.title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
