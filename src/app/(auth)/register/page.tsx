import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your account"
      description="Start managing your online store."
      footer={<>Already have an account? <Link href="/login" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">Sign in</Link></>}
    >
      <RegisterForm />
    </AuthShell>
  );
}
