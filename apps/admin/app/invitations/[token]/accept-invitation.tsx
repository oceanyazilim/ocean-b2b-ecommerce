"use client";

import { Alert, Button } from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

export function AcceptInvitation({
  token,
  invitedEmail,
  currentEmail,
}: {
  token: string;
  invitedEmail: string;
  currentEmail: string;
}) {
  const router = useRouter();
  const { pending, error, run } = useSubmit();
  const mismatch = invitedEmail !== currentEmail;

  async function accept() {
    const ok = await run(() => api("/invitations/accept", { body: { token } }));
    if (ok !== undefined) {
      router.replace("/");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {mismatch && (
        <Alert variant="warning">
          You are signed in as {currentEmail}, but this invitation was sent to {invitedEmail}.{" "}
          <Link
            href={`/login?next=${encodeURIComponent(`/invitations/${token}`)}`}
            className="underline"
          >
            Switch account
          </Link>
          .
        </Alert>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      <Button onClick={accept} loading={pending} disabled={mismatch}>
        Accept invitation
      </Button>
    </div>
  );
}
