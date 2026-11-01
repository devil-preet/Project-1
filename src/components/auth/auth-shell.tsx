import type { ReactNode } from "react";
import { Store } from "lucide-react";

export function AuthShell({ title, description, children, footer }: {
  title: string; description?: string; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <div className="mb-7 flex items-center justify-center gap-3 font-heading text-[15px] font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#EAD7FA,#C69CE9)] text-primary-foreground">
            <Store className="size-4" />
          </span>
          Brand Portal
        </div>
        <div className="nv-panel p-6 shadow-sm sm:p-8">
          <h1 className="nv-title text-[26px]">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  );
}
