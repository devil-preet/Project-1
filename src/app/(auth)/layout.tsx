import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Signed-in users have no business on the sign-in pages.
  const session = await getSession();
  if (session) redirect(session.emailVerified ? "/dashboard" : "/verify-email");
  return children;
}
