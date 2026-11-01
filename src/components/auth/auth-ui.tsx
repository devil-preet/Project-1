"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { Eye, EyeOff, Loader2, CircleAlert, CircleCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Field({
  label, htmlFor, error, hint, children, compact = false,
}: {
  label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode;
  /** Skip the reserved message row (for fields that render their own status line). */
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : compact ? null : (
        // Reserve the row so a validation message appearing on blur never shifts the layout
        // (a shift mid-click makes the click land on the wrong element).
        <p className="min-h-4" aria-hidden />
      )}
    </div>
  );
}

export function PasswordInput({ id, ...props }: ComponentProps<typeof Input> & { id: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? "text" : "password"} className="pr-10" {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function FormMessage({ kind, children }: { kind: "error" | "success"; children: ReactNode }) {
  const Icon = kind === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
        kind === "error"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-emerald-600/30 bg-emerald-600/5 text-emerald-700 dark:text-emerald-400",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function SubmitButton({ pending, children, ...props }: ComponentProps<typeof Button> & { pending: boolean }) {
  return (
    <Button type="submit" className="w-full" disabled={pending || props.disabled} {...props}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}
