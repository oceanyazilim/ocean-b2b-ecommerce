import Link from "next/link";

import { listBlogs } from "@/lib/storefront";

export default async function BlogsPage() {
  const blogs = await listBlogs();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Blogs</h1>
      {blogs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No blogs yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {blogs.map((b) => (
            <Link
              key={b.id}
              href={`/blogs/${b.handle}`}
              className="group flex flex-col gap-1 rounded-lg border p-4 transition-colors hover:border-foreground/30"
            >
              <span className="text-base font-medium group-hover:underline">{b.title}</span>
              <span className="text-sm text-muted-foreground">/blogs/{b.handle}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
