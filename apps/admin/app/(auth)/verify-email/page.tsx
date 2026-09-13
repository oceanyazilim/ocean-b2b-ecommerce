import { VerifyEmail } from "./verify-email";

export const metadata = { title: "Verify email · Ocean Admin" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <VerifyEmail token={token ?? null} />;
}
