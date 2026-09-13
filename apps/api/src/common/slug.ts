import { slugify } from "@ocean/utils";

// Produces a unique slug by appending -2, -3, … when the base is taken.
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
  fallback = "store",
): Promise<string> {
  const root = slugify(base) || fallback;
  if (!(await exists(root))) return root;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${root}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Could not find a free slug for "${base}"`);
}
