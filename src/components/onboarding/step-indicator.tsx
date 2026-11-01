import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const STEPS = [
  { id: 1, label: "Business", hint: "About your business" },
  { id: 2, label: "Store", hint: "Name and address" },
  { id: 3, label: "Branding", hint: "Colors and logo" },
  { id: 4, label: "Review", hint: "Confirm and create" },
] as const;

export function StepIndicator({ current, onJump }: { current: number; onJump: (step: number) => void }) {
  return (
    <nav aria-label="Onboarding progress">
      {/* compact (mobile) */}
      <div className="sm:hidden">
        <p className="text-xs font-medium text-muted-foreground">
          Step {current} of {STEPS.length} · <span className="text-foreground">{STEPS[current - 1].label}</span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(current / STEPS.length) * 100}%` }} />
        </div>
      </div>
      {/* full (sm and up) */}
      <ol className="hidden items-center sm:flex">
        {STEPS.map((s, i) => {
          const done = s.id < current;
          const active = s.id === current;
          return (
            <li key={s.id} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
              <button
                type="button"
                disabled={!done}
                onClick={() => onJump(s.id)}
                aria-current={active ? "step" : undefined}
                className="group flex items-center gap-2.5 text-left disabled:cursor-default"
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary text-primary ring-4 ring-primary/10",
                    !done && !active && "border-border text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : s.id}
                </span>
                <span className="hidden lg:block">
                  <span className={cn("block text-sm font-medium leading-tight", !active && !done && "text-muted-foreground")}>{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.hint}</span>
                </span>
                <span className="sr-only lg:hidden">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <span className={cn("mx-3 h-px flex-1", done ? "bg-primary" : "bg-border")} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
