"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { postJson, safeNext } from "@/lib/api/client";
import { Field, FormMessage, PasswordInput, SubmitButton } from "./auth-ui";

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [error, setError] = useState<string | null>(null);
  const {
    register, handleSubmit, setError: setFieldError, formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { remember: false } });

  async function onSubmit(values: LoginInput) {
    setError(null);
    const res = await postJson<{ emailVerified: boolean }>("/api/auth/login", values);
    if (!res.ok) {
      if (res.fieldErrors?.email) setFieldError("email", { message: res.fieldErrors.email[0] });
      return setError(res.error);
    }
    router.replace(res.emailVerified ? safeNext(next) : "/verify-email");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!errors.email} {...register("email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <PasswordInput id="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} />
      </Field>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4 rounded border-input accent-primary" {...register("remember")} />
          Remember me
        </label>
        <Link href="/forgot-password" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">Forgot password?</Link>
      </div>
      <SubmitButton pending={isSubmitting}>Sign in</SubmitButton>
    </form>
  );
}
