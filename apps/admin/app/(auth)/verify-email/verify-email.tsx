"use client";

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

type Status = "idle" | "verifying" | "verified" | "failed";

export function VerifyEmail({ token }: { token: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(token ? "verifying" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api("/auth/verify-email", { body: { token } })
      .then(() => {
        if (cancelled) return;
        setStatus("verified");
        router.refresh();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(errorMessage(err));
        setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  async function resend() {
    try {
      await api("/auth/resend-verification", { method: "POST" });
      setResent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>
          {status === "idle" && "Check your inbox for the verification link we sent you."}
          {status === "verifying" && "Confirming your email address…"}
          {status === "verified" && "Your email address is confirmed."}
          {status === "failed" && "We could not confirm your email address."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status === "verifying" && <Spinner className="h-5 w-5" />}
        {status === "failed" && error && <Alert variant="error">{error}</Alert>}
        {status === "verified" && <Button onClick={() => router.replace("/")}>Continue</Button>}
        {(status === "idle" || status === "failed") && (
          <div className="flex flex-col gap-3">
            {resent ? (
              <Alert variant="success">A new verification link is on its way.</Alert>
            ) : (
              <Button variant="outline" onClick={resend}>
                Send a new link
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Signed in with the wrong account?{" "}
              <Link href="/login" className="underline">
                Sign in again
              </Link>
              .
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
