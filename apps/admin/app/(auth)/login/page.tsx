import { redirect } from "next/navigation";

import { getMe, homePath } from "@/lib/session";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Ocean Admin" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const me = await getMe();
  const { next } = await searchParams;
  if (me) redirect(next && next.startsWith("/") ? next : homePath(me));
  return <LoginForm next={next && next.startsWith("/") ? next : undefined} />;
}
