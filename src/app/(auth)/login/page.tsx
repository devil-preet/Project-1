import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to manage your brand."
      footer={<>New here? <Link href="/register" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">Create an account</Link></>}
    >
      <Suspense><LoginForm /></Suspense>
    </AuthShell>
  );
}
