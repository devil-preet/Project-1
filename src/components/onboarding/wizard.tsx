"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormMessage } from "@/components/auth/auth-ui";
import { postJson } from "@/lib/api/client";
import { slugify } from "@/lib/utils/slug";
import { cn } from "@/lib/utils";
import { INDUSTRIES, onboardingSchema } from "@/lib/validations/onboarding";
import { BrandPreview } from "./brand-preview";
import { LogoUploader, type LogoState } from "./logo-uploader";
import { StepIndicator, STEPS } from "./step-indicator";

type FormValues = z.input<typeof onboardingSchema>;
type Output = z.output<typeof onboardingSchema>;

const STEP_FIELDS: Record<number, FieldPath<FormValues>[]> = {
  1: ["businessName", "industry", "description", "contactEmail", "contactPhone"],
  2: ["storeDisplayName", "slug", "storeDescription", "storeStatus"],
  3: ["primaryColor", "secondaryColor", "accentColor", "defaultTheme"],
};

const DEFAULTS: FormValues = {
  businessName: "",
  industry: "" as FormValues["industry"],
  description: "",
  contactEmail: "",
  contactPhone: "",
  storeDisplayName: "",
  slug: "",
  storeDescription: "",
  storeStatus: "unpublished",
  primaryColor: "#111827",
  secondaryColor: "#6B7280",
  accentColor: "#2563EB",
  defaultTheme: "light",
};

export interface WizardInitial {
  step: number;
  values: Partial<FormValues>;
  logo: LogoState | null;
  /** The saved draft is COMPLETED: the first save must start a new one (second business). */
  needsFresh: boolean;
  userEmail: string;
  isAdditional: boolean;
}

type SlugState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken"; suggestion?: string }
  | { status: "invalid" | "reserved" };

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";

export function OnboardingWizard({ initial }: { initial: WizardInitial }) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(Math.max(initial.step, 1), 4));
  const [logo, setLogo] = useState<LogoState | null>(initial.logo);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [remoteSlug, setRemoteSlug] = useState<{ slug: string; result: SlugState } | null>(null);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.values.slug));
  const freshPending = useRef(initial.needsFresh);
  const topRef = useRef<HTMLHeadingElement>(null);

  const {
    register, handleSubmit, trigger, getValues, setValue, setError, control, formState: { errors },
  } = useForm<FormValues, unknown, Output>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { ...DEFAULTS, contactEmail: initial.userEmail, ...initial.values },
    mode: "onTouched",
  });

  const v = useWatch({ control }) as FormValues;

  /** Saves validated fields of steps 1..upTo as the resumable draft. */
  const persist = useCallback(
    async (nextStep: number, upTo: number) => {
      const values = getValues();
      const data: Record<string, unknown> = {};
      for (let s = 1; s <= upTo; s++) for (const f of STEP_FIELDS[s] ?? []) data[f] = values[f];
      const res = await postJson("/api/onboarding/draft", { step: nextStep, data, fresh: freshPending.current || undefined });
      if (res.ok) freshPending.current = false;
      return res.ok;
    },
    [getValues],
  );

  // Auto-derive the store address from the store name until the user edits it.
  useEffect(() => {
    if (!slugTouched) setValue("slug", slugify(v.storeDisplayName ?? ""), { shouldValidate: false });
  }, [v.storeDisplayName, slugTouched, setValue]);

  // Availability: format problems are derived synchronously; only the (advisory) server
  // lookup is stored, and only from an async callback.
  const slug = v.slug ?? "";
  const slugFormatOk = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 2;
  const slugState: SlugState = !slug
    ? { status: "idle" }
    : !slugFormatOk
      ? { status: "invalid" }
      : remoteSlug?.slug === slug
        ? remoteSlug.result
        : { status: "checking" };

  useEffect(() => {
    if (step !== 2 || !slug || !slugFormatOk) return;
    let stale = false;
    const t = setTimeout(async () => {
      const res = await postJson<{ available: boolean; reason?: "invalid" | "reserved" | "taken"; suggestion?: string }>(
        "/api/onboarding/slug-check", { slug },
      );
      if (stale) return;
      const result: SlugState = !res.ok
        ? { status: "idle" }
        : res.available
          ? { status: "available" }
          : res.reason === "taken"
            ? { status: "taken", suggestion: res.suggestion }
            : { status: res.reason ?? "invalid" };
      setRemoteSlug({ slug, result });
    }, 450);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [slug, slugFormatOk, step]);

  function goTo(n: number) {
    setStep(n);
    setFormError(null);
    requestAnimationFrame(() => topRef.current?.focus());
  }

  async function next() {
    setFormError(null);
    if (!(await trigger(STEP_FIELDS[step]))) return;
    if (step === 2 && ["taken", "reserved", "invalid"].includes(slugState.status)) {
      setError("slug", { message: slugState.status === "taken" ? "That store address is already taken." : "Choose a different store address." });
      return;
    }
    setSaving(true);
    const ok = await persist(step + 1, step);
    setSaving(false);
    if (!ok) return setFormError("We couldn't save your progress. Check your connection and try again.");
    goTo(step + 1);
  }

  async function onValid(values: Output) {
    setFormError(null);
    setSubmitting(true);
    const res = await postJson<{ businessId: string }>("/api/onboarding/complete", values);
    if (!res.ok) {
      setSubmitting(false);
      if (res.code === "slug_taken") {
        setSlugTouched(true);
        setError("slug", { message: res.error });
        goTo(2);
        return;
      }
      const first = Object.entries(res.fieldErrors ?? {})[0];
      if (first) {
        const field = first[0] as FieldPath<FormValues>;
        setError(field, { message: first[1][0] });
        const s = Object.entries(STEP_FIELDS).find(([, f]) => f.includes(field))?.[0];
        if (s) goTo(Number(s));
      }
      return setFormError(res.error);
    }
    setDone(true);
    router.replace("/dashboard");
    router.refresh();
  }

  async function submit() {
    await handleSubmit(onValid)();
  }

  if (done) {
    return (
      <div className="flex flex-col items-center py-10 text-center" role="status">
        <CheckCircle2 className="size-12 text-emerald-600" />
        <h2 className="mt-4 text-lg font-semibold">Your workspace is ready</h2>
        <p className="mt-1 text-sm text-muted-foreground">Taking you to your dashboard…</p>
        <Loader2 className="mt-4 size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <StepIndicator current={step} onJump={goTo} />

      <form onSubmit={(e) => { e.preventDefault(); void (step === 4 ? submit() : next()); }} className="mt-8" noValidate>
        <h2 ref={topRef} tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none">
          {step === 1 && "Tell us about your business"}
          {step === 2 && "Set up your store"}
          {step === 3 && "Choose your brand look"}
          {step === 4 && "Review and create"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === 1 && "Required fields are marked. Everything else can be added later."}
          {step === 2 && "This is how customers will find and recognise your store."}
          {step === 3 && "Pick colors and a theme. You can refine them any time in Store Appearance."}
          {step === 4 && "Check the details below. You can edit anything before creating."}
        </p>

        {formError && <div className="mt-4"><FormMessage kind="error">{formError}</FormMessage></div>}

        <div className="mt-6 space-y-5">
          {step === 1 && (
            <>
              <Field label="Business name *" htmlFor="businessName" error={errors.businessName?.message}>
                <Input id="businessName" autoFocus autoComplete="organization" aria-invalid={!!errors.businessName} {...register("businessName")} />
              </Field>
              <Field label="Industry *" htmlFor="industry" error={errors.industry?.message}>
                <select id="industry" className={selectClass} aria-invalid={!!errors.industry} {...register("industry")}>
                  <option value="">Select an industry…</option>
                  {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </Field>
              <Field label="Description" htmlFor="description" error={errors.description?.message} hint="Optional. A sentence or two about what you sell.">
                <Textarea id="description" rows={3} aria-invalid={!!errors.description} {...register("description")} />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Contact email" htmlFor="contactEmail" error={errors.contactEmail?.message} hint="Optional">
                  <Input id="contactEmail" type="email" autoComplete="email" aria-invalid={!!errors.contactEmail} {...register("contactEmail")} />
                </Field>
                <Field label="Contact phone" htmlFor="contactPhone" error={errors.contactPhone?.message} hint="Optional">
                  <Input id="contactPhone" type="tel" autoComplete="tel" aria-invalid={!!errors.contactPhone} {...register("contactPhone")} />
                </Field>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Store display name *" htmlFor="storeDisplayName" error={errors.storeDisplayName?.message}>
                <Input id="storeDisplayName" autoFocus aria-invalid={!!errors.storeDisplayName} {...register("storeDisplayName")} />
              </Field>
              <Field label="Store address" htmlFor="slug" error={errors.slug?.message} compact
                hint={slugState.status === "idle" && !errors.slug ? "Leave blank and we'll create one from your store name." : undefined}>
                <div className="flex items-stretch overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                  <span className="flex items-center border-r bg-muted/50 px-2.5 text-xs text-muted-foreground">yourplatform.com/s/</span>
                  <input
                    id="slug"
                    className="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!!errors.slug}
                    aria-describedby="slug-status"
                    {...register("slug", {
                      onChange: (e) => {
                        setSlugTouched(true);
                        e.target.value = String(e.target.value).toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "");
                      },
                    })}
                  />
                </div>
                <SlugStatus state={slugState} onUse={(s) => { setSlugTouched(true); setValue("slug", s, { shouldValidate: true }); }} />
              </Field>
              <Field label="Store description" htmlFor="storeDescription" error={errors.storeDescription?.message} hint="Optional. Shown on your storefront.">
                <Textarea id="storeDescription" rows={3} aria-invalid={!!errors.storeDescription} {...register("storeDescription")} />
              </Field>
              <div>
                <p className="mb-1.5 text-sm font-medium">Logo <span className="font-normal text-muted-foreground">(optional)</span></p>
                <LogoUploader value={logo} onChange={setLogo} ensureDraft={() => persist(2, 1)} />
              </div>
              <RadioCards
                legend="Store status"
                value={v.storeStatus ?? "unpublished"}
                onChange={(val) => setValue("storeStatus", val as FormValues["storeStatus"])}
                options={[
                  { value: "unpublished", title: "Private", body: "Only your team can see it. Recommended while you set up." },
                  { value: "published", title: "Published", body: "Branding and contact details become publicly readable." },
                ]}
              />
            </>
          )}

          {step === 3 && (
            <div className="grid gap-6 lg:grid-cols-[1fr_17rem]">
              <div className="space-y-5">
                <ColorField id="primaryColor" label="Primary color" error={errors.primaryColor?.message} value={v.primaryColor ?? ""} register={register("primaryColor")} onPick={(c) => setValue("primaryColor", c, { shouldValidate: true })} />
                <ColorField id="secondaryColor" label="Secondary color" error={errors.secondaryColor?.message} value={v.secondaryColor ?? ""} register={register("secondaryColor")} onPick={(c) => setValue("secondaryColor", c, { shouldValidate: true })} />
                <ColorField id="accentColor" label="Accent color" error={errors.accentColor?.message} value={v.accentColor ?? ""} register={register("accentColor")} onPick={(c) => setValue("accentColor", c, { shouldValidate: true })} />
                <RadioCards
                  legend="Default theme"
                  value={v.defaultTheme ?? "light"}
                  onChange={(val) => setValue("defaultTheme", val as FormValues["defaultTheme"])}
                  options={[
                    { value: "light", title: "Light", body: "Bright background." },
                    { value: "dark", title: "Dark", body: "Dark background." },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  Logo: {logo ? <span className="font-medium text-foreground">{logo.fileName}</span> : "none yet"} ·{" "}
                  <button type="button" className="underline underline-offset-4" onClick={() => goTo(2)}>change</button>
                </p>
              </div>
              <div className="lg:sticky lg:top-6 lg:self-start">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Live preview</p>
                <BrandPreview
                  name={v.storeDisplayName ?? ""}
                  primary={validHex(v.primaryColor, "#111827")}
                  secondary={validHex(v.secondaryColor, "#6B7280")}
                  accent={validHex(v.accentColor, "#2563EB")}
                  theme={v.defaultTheme === "dark" ? "dark" : "light"}
                  logoUrl={logo?.previewUrl}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <ReviewSection title="Business" onEdit={() => goTo(1)} rows={[
                ["Name", v.businessName], ["Industry", v.industry], ["Description", v.description],
                ["Contact email", v.contactEmail], ["Contact phone", v.contactPhone],
              ]} />
              <ReviewSection title="Store" onEdit={() => goTo(2)} rows={[
                ["Display name", v.storeDisplayName],
                ["Address", `yourplatform.com/s/${v.slug || slugify(v.storeDisplayName ?? "") || "…"}${v.slug ? "" : " (auto)"}`],
                ["Description", v.storeDescription],
                ["Logo", logo?.fileName ?? ""],
                ["Status", v.storeStatus === "published" ? "Published" : "Private"],
              ]} />
              <ReviewSection title="Branding" onEdit={() => goTo(3)} rows={[
                ["Colors", <span key="c" className="flex items-center gap-1.5">
                  {[v.primaryColor, v.secondaryColor, v.accentColor].map((c, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs"><span className="size-4 rounded border" style={{ background: validHex(c, "#fff") }} />{c}</span>
                  ))}
                </span>],
                ["Theme", v.defaultTheme === "dark" ? "Dark" : "Light"],
              ]} />
              <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                You&apos;ll be the Owner of this business. Your store address stays reserved for you and can&apos;t be taken by anyone else.
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3 border-t pt-5">
          <Button type="button" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => goTo(step - 1)} disabled={step === 1 || saving || submitting} className={cn(step === 1 && "invisible")}>
            <ArrowLeft className="size-4" /> Back
          </Button>
          {step < 4 ? (
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Continue <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {submitting ? "Creating…" : "Create business"}
            </Button>
          )}
        </div>
      </form>
      <p className="sr-only" aria-live="polite">Step {step} of {STEPS.length}: {STEPS[step - 1].label}</p>
    </div>
  );
}

function validHex(v: string | undefined, fallback: string) {
  return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

function SlugStatus({ state, onUse }: { state: SlugState; onUse: (s: string) => void }) {
  let content: ReactNode = null;
  if (state.status === "checking") content = <span className="text-muted-foreground">Checking availability…</span>;
  if (state.status === "available") content = <span className="text-emerald-700 dark:text-emerald-400">Available</span>;
  if (state.status === "invalid") content = <span className="text-destructive">Use lowercase letters, numbers and single hyphens.</span>;
  if (state.status === "reserved") content = <span className="text-destructive">That address is reserved. Try another.</span>;
  if (state.status === "taken") {
    content = (
      <span className="text-destructive">
        Already taken.{" "}
        {state.suggestion && (
          <button type="button" className="font-medium underline underline-offset-4" onClick={() => onUse(state.suggestion!)}>
            Use {state.suggestion}
          </button>
        )}
      </span>
    );
  }
  return <p id="slug-status" aria-live="polite" className="mt-1.5 min-h-4 text-xs">{content}</p>;
}

function RadioCards({
  legend, value, onChange, options,
}: { legend: string; value: string; onChange: (v: string) => void; options: { value: string; title: string; body: string }[] }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "cursor-pointer rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              value === o.value ? "border-primary bg-primary/5" : "hover:bg-muted/50",
            )}
          >
            <input type="radio" name={legend} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            <span className="block text-sm font-medium">{o.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{o.body}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ColorField({
  id, label, value, error, register, onPick,
}: { id: string; label: string; value: string; error?: string; register: object; onPick: (c: string) => void }) {
  return (
    <Field label={label} htmlFor={id} error={error}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={validHex(value, "#000000")}
          onChange={(e) => onPick(e.target.value.toUpperCase())}
          className="size-9 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1"
        />
        <Input id={id} className="font-mono uppercase" maxLength={7} spellCheck={false} aria-invalid={!!error} {...register} />
      </div>
    </Field>
  );
}

function ReviewSection({
  title, rows, onEdit,
}: { title: string; rows: [string, ReactNode][]; onEdit: () => void }) {
  return (
    <section className="rounded-xl border">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}><Pencil className="size-3.5" /> Edit</Button>
      </header>
      <dl className="divide-y">
        {rows.map(([k, val]) => (
          <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-3 px-4 py-2 text-sm">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words">{val === "" || val == null ? <span className="text-muted-foreground">Not provided</span> : val}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
