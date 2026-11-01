"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations/auth";
import { postJson } from "@/lib/api/client";
import { Field, FormMessage, PasswordInput, SubmitButton } from "./auth-ui";

/** Handles Firebase email links when the action URL is set to /auth/action. */
export function ActionHandler({ mode, oobCode }: { mode?: string; oobCode?: string }) {
  if (!oobCode || (mode !== "verifyEmail" && mode !== "resetPassword")) {
    return (
      <div className="space-y-4">
        <FormMessage kind="error">This link is invalid or incomplete.</FormMessage>
        <Link href="/login" className={buttonVariants({ variant: "outline", className: "w-full" })}>Back to sign in</Link>
      </div>
    );
  }
  return mode === "verifyEmail" ? <VerifyEmail oobCode={oobCode} /> : <ResetPassword oobCode={oobCode} />;
}

function VerifyEmail({ oobCode }: { oobCode: string }) {
  const [state, setState] = useState<{ status: "pending" } | { status: "done" } | { status: "error"; error: string }>({ status: "pending" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // codes are single-use: never fire twice (StrictMode)
    started.current = true;
    postJson("/api/auth/verify-email", { oobCode }).then((r) =>
      setState(r.ok ? { status: "done" } : { status: "error", error: r.error }),
    );
  }, [oobCode]);

  if (state.status === "pending") {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Verifying your email…</p>;
  }
  return (
    <div className="space-y-4">
      {state.status === "done"
        ? <FormMessage kind="success">Your email address is verified.</FormMessage>
        : <FormMessage kind="error">{state.error}</FormMessage>}
      <Link href={state.status === "done" ? "/dashboard" : "/verify-email"} className={buttonVariants({ className: "w-full" })}>
        Continue
      </Link>
    </div>
  );
}

function ResetPassword({ oobCode }: { oobCode: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { oobCode },
  });

  async function onSubmit(values: ResetPasswordInput) {
    setError(null);
    const res = await postJson("/api/auth/reset-password", values);
    if (!res.ok) return setError(res.error);
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <FormMessage kind="success">Your password has been changed. Other devices have been signed out.</FormMessage>
        <Link href="/login" className={buttonVariants({ className: "w-full" })}>Sign in</Link>
      </div>
    );
  }
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <input type="hidden" {...register("oobCode")} />
      <Field label="New password" htmlFor="password" error={errors.password?.message}
        hint="At least 10 characters with upper and lower case letters and a number.">
        <PasswordInput id="password" autoComplete="new-password" autoFocus aria-invalid={!!errors.password} {...register("password")} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
        <PasswordInput id="confirmPassword" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register("confirmPassword")} />
      </Field>
      <SubmitButton pending={isSubmitting}>Change password</SubmitButton>
    </form>
  );
}
