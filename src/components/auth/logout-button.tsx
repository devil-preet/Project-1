"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/api/client";

export function LogoutButton({ variant = "ghost", label = "Sign out" }: { variant?: "ghost" | "link" | "outline"; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await postJson("/api/auth/logout");
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant={variant} size="sm" onClick={logout} disabled={pending}>
      {variant !== "link" && <LogOut className="size-4" />}
      {label}
    </Button>
  );
}
