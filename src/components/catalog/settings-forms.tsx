"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/api/client";
import { CURRENCIES } from "@/lib/utils/money";
import { ImageUploader, type ImageItem } from "./image-uploader";

const SELECT = "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm";

function useSave(businessId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  async function save(body: object, success: string) {
    setBusy(true);
    setMsg(null);
    setFields({});
    const res = await postJson(`/api/b/${businessId}/settings`, body);
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      setFields(res.fieldErrors ?? {});
      return;
    }
    setMsg({ ok: true, text: success });
    router.refresh();
  }
  return { busy, msg, fields, save };
}

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-destructive"}>{msg.text}</p>;
}

export function PublishToggle({ businessId, published, productCount }: { businessId: string; published: boolean; productCount: number }) {
  const { busy, msg, save } = useSave(businessId);
  return (
    <section className="space-y-3 rounded-xl border bg-background p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">Storefront visibility</h2>
          <p className="text-sm text-muted-foreground">
            {published ? "Your store is public. Customers can browse live products." : "Your store is private. Nobody outside your team can see it."}
          </p>
        </div>
        <Switch checked={published} disabled={busy} onCheckedChange={(v) => void save({ action: "publish", published: v }, v ? "Store published." : "Store is now private.")} aria-label="Store published" />
      </div>
      {!published && productCount === 0 && <p className="text-xs text-muted-foreground">Tip: add and publish a few products first so the store isn&apos;t empty.</p>}
      <Status msg={msg} />
    </section>
  );
}

export function StoreForm({
  businessId, initial, currencyLocked,
}: { businessId: string; initial: { displayName: string; description: string; currency: string }; currencyLocked: boolean }) {
  const { busy, msg, fields, save } = useSave(businessId);
  const [displayName, setName] = useState(initial.displayName);
  const [description, setDescription] = useState(initial.description);
  const [currency, setCurrency] = useState(initial.currency);
  return (
    <form
      noValidate
      onSubmit={(e) => { e.preventDefault(); void save({ action: "store", displayName, description, currency }, "Store settings saved."); }}
      className="space-y-4 rounded-xl border bg-background p-5"
    >
      <h2 className="font-semibold">Store details</h2>
      <div className="space-y-1.5">
        <Label htmlFor="s-name">Store name</Label>
        <Input id="s-name" value={displayName} onChange={(e) => setName(e.target.value)} maxLength={80} aria-invalid={!!fields.displayName} />
        <p className="min-h-4 text-xs text-destructive">{fields.displayName?.[0]}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-desc">Description</Label>
        <Textarea id="s-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-cur">Currency</Label>
        <select id="s-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={currencyLocked} className={`${SELECT} max-w-48`}>
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <p className="min-h-4 text-xs text-muted-foreground">{currencyLocked ? "Locked because products already exist." : "Choose before adding products; it can't change afterwards."}</p>
        <p className="text-xs text-destructive">{fields.currency?.[0]}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-3.5 animate-spin" />}Save</Button>
        <Status msg={msg} />
      </div>
    </form>
  );
}

export function BrandingForm({
  businessId, initial, canUpload,
}: {
  businessId: string;
  initial: { primaryColor: string; secondaryColor: string; accentColor: string; defaultTheme: "light" | "dark"; logo: ImageItem | null };
  canUpload: boolean;
}) {
  const { busy, msg, fields, save } = useSave(businessId);
  const [primary, setPrimary] = useState(initial.primaryColor);
  const [secondary, setSecondary] = useState(initial.secondaryColor);
  const [accent, setAccent] = useState(initial.accentColor);
  const [theme, setTheme] = useState(initial.defaultTheme);
  const [logo, setLogo] = useState<ImageItem[]>(initial.logo ? [initial.logo] : []);
  const color = (id: string, label: string, v: string, set: (s: string) => void, err?: string[]) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : "#000000"} onChange={(e) => set(e.target.value.toUpperCase())} className="size-8 shrink-0 cursor-pointer rounded border bg-transparent p-0.5" />
        <Input id={id} value={v} onChange={(e) => set(e.target.value)} maxLength={7} aria-invalid={!!err} />
      </div>
      <p className="min-h-4 text-xs text-destructive">{err?.[0]}</p>
    </div>
  );
  return (
    <form
      noValidate
      onSubmit={(e) => { e.preventDefault(); void save({ action: "branding", primaryColor: primary, secondaryColor: secondary, accentColor: accent, defaultTheme: theme, logoId: logo[0]?.mediaId ?? null }, "Branding saved."); }}
      className="space-y-4 rounded-xl border bg-background p-5"
    >
      {canUpload && <ImageUploader businessId={businessId} label="Logo" max={1} value={logo} onChange={setLogo} />}
      <div className="grid gap-4 sm:grid-cols-3">
        {color("b-primary", "Primary", primary, setPrimary, fields.primaryColor)}
        {color("b-secondary", "Secondary", secondary, setSecondary, fields.secondaryColor)}
        {color("b-accent", "Accent", accent, setAccent, fields.accentColor)}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="b-theme">Storefront theme</Label>
        <select id="b-theme" value={theme} onChange={(e) => setTheme(e.target.value as "light" | "dark")} className={`${SELECT} max-w-48`}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-3.5 animate-spin" />}Save branding</Button>
        <Status msg={msg} />
      </div>
    </form>
  );
}
