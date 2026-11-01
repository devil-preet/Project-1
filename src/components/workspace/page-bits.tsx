import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, kicker }: { title: string; description?: string; actions?: ReactNode; kicker?: string }) {
  return (
    <div className="nv-rise mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {kicker && <p className="nv-kicker mb-3"><i className="nv-pulse" aria-hidden />{kicker}</p>}
        <h1 className="nv-title text-[clamp(28px,3.6vw,48px)]">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="nv-panel flex flex-col items-center border-dashed border-[var(--nv-line-strong)] px-6 py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full border border-[var(--nv-line-strong)] bg-[rgba(217,184,244,.1)] text-primary" aria-hidden>{icon}</div>
      <h2 className="nv-title text-xl">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function NoAccess({ what }: { what: string }) {
  return (
    <div role="alert" className="nv-panel p-6 text-sm text-muted-foreground">
      Your role doesn&apos;t include {what}. Ask the business owner if you need access.
    </div>
  );
}
