import { redirect } from "next/navigation";

import { getMe, homePath } from "@/lib/session";

import { SignupForm } from "./signup-form";

export const metadata = { title: "Create account · Ocean Admin" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const me = await getMe();
  const { next, email } = await searchParams;
  if (me) redirect(next && next.startsWith("/") ? next : homePath(me));
  return <SignupForm next={next && next.startsWith("/") ? next : undefined} initialEmail={email} />;
}
