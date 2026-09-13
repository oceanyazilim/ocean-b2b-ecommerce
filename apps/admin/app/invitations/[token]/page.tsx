import type { InvitationPreview } from "@ocean/types";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ocean/ui";
import Link from "next/link";

import { api, isApiError } from "@/lib/api";
import { getMe } from "@/lib/session";

import { AcceptInvitation } from "./accept-invitation";

export const metadata = { title: "Invitation · Ocean Admin" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const me = await getMe();

  let preview: InvitationPreview | null = null;
  let error: string | null = null;
  try {
    preview = (await api<{ data: InvitationPreview }>(`/invitations/${encodeURIComponent(token)}`))
      .data;
  } catch (err) {
    error = isApiError(err) ? err.message : "This invitation could not be loaded.";
  }

  const next = `/invitations/${encodeURIComponent(token)}`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>You have been invited</CardTitle>
          {preview && (
            <CardDescription>
              Join <strong>{preview.storeName}</strong> ({preview.organizationName}) as{" "}
              <strong>{preview.role.replace(/_/g, " ")}</strong>.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}
          {preview && !me && (
            <>
              <p className="text-sm text-muted-foreground">
                Sign in or create an account with <strong>{preview.email}</strong> to accept.
              </p>
              <div className="flex gap-2">
                <Link
                  href={`/login?next=${encodeURIComponent(next)}`}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Sign in
                </Link>
                <Link
                  href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(preview.email)}`}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"
                >
                  Create account
                </Link>
              </div>
            </>
          )}
          {preview && me && (
            <AcceptInvitation
              token={token}
              invitedEmail={preview.email}
              currentEmail={me.user.email}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
