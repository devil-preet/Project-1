"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { postJson } from "@/lib/api/client";
import { Field, FormMessage, PasswordInput, SubmitButton } from "./auth-ui";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register, handleSubmit, setError: setFieldError, formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterInput) {
    setError(null);
    const res = await postJson("/api/auth/register", values);
    if (!res.ok) {
      for (const [field, msgs] of Object.entries(res.fieldErrors ?? {})) {
        setFieldError(field as keyof RegisterInput, { message: msgs[0] });
      }
      if (res.code === "email_exists") setFieldError("email", { message: res.error });
      return setError(res.code === "email_exists" ? null : res.error);
    }
    router.replace("/verify-email");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
        <Input id="fullName" autoComplete="name" autoFocus aria-invalid={!!errors.fullName} {...register("fullName")} />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
      </Field>
      <Field
        label="Password" htmlFor="password" error={errors.password?.message}
        hint="At least 10 characters with upper and lower case letters and a number."
      >
        <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
        <PasswordInput id="confirmPassword" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register("confirmPassword")} />
      </Field>
      <SubmitButton pending={isSubmitting}>Create account</SubmitButton>
    </form>
  );
}
