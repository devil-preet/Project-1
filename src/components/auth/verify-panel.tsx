"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/api/client";
import { FormMessage } from "./auth-ui";
import { LogoutButton } from "./logout-button";

const COOLDOWN_SEC = 60;

export function VerifyPanel({ email }: { email: string }) {
  const router = useRouter();
  const [cooldown, setCooldown] = useState(COOLDOWN_SEC); // an email was just sent at registration/login
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<"resend" | "check" | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    setBusy("resend");
    setMsg(null);
    const res = await postJson<{ alreadyVerified: boolean }>("/api/auth/resend-verification");
    setBusy(null);
    if (!res.ok) return setMsg({ kind: "error", text: res.error });
    if (res.alreadyVerified) return check();
    setCooldown(COOLDOWN_SEC);
    setMsg({ kind: "success", text: "Verification email sent. It can take a minute to arrive." });
  }

  async function check() {
    setBusy("check");
    setMsg(null);
    const res = await fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (res?.emailVerified) {
      router.replace("/dashboard");
      return router.refresh();
    }
    setMsg({ kind: "error", text: "Your email isn't verified yet. Open the link in the email we sent, then try again." });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        We sent a verification link to <strong className="text-foreground">{email}</strong>. Open it to activate your account.
      </p>
      {msg && <FormMessage kind={msg.kind}>{msg.text}</FormMessage>}
      <Button className="w-full" onClick={check} disabled={busy !== null}>
        {busy === "check" ? "Checking…" : "I've verified my email"}
      </Button>
      <Button variant="outline" className="w-full" onClick={resend} disabled={busy !== null || cooldown > 0}>
        {cooldown > 0 ? `Resend email (${cooldown}s)` : busy === "resend" ? "Sending…" : "Resend verification email"}
      </Button>
      <div className="pt-1 text-center"><LogoutButton variant="link" label="Use a different account" /></div>
    </div>
  );
}
