import { redirect } from "next/navigation";

import { getPlatformOperator } from "@/lib/session";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Ocean Platform Admin" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const me = await getPlatformOperator();
  const { next } = await searchParams;
  if (me) redirect(next && next.startsWith("/") ? next : "/organizations");
  return <LoginForm next={next && next.startsWith("/") ? next : undefined} />;
}
