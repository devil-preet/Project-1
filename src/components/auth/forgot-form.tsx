"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations/auth";
import { postJson } from "@/lib/api/client";
import { Field, FormMessage, SubmitButton } from "./auth-ui";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: ForgotPasswordInput) {
    setError(null);
    const res = await postJson("/api/auth/forgot-password", values);
    if (!res.ok) return setError(res.error);
    setSentTo(values.email);
  }

  if (sentTo) {
    return (
      <FormMessage kind="success">
        If an account exists for <strong>{sentTo}</strong>, a password reset link is on its way.
        Check your inbox (and spam folder). The link expires after one hour.
      </FormMessage>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!errors.email} {...register("email")} />
      </Field>
      <SubmitButton pending={isSubmitting}>Send reset link</SubmitButton>
    </form>
  );
}
