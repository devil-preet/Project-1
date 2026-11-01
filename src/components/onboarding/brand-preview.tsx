import { ShoppingBag } from "lucide-react";

export function BrandPreview({
  name, primary, secondary, accent, theme, logoUrl,
}: { name: string; primary: string; secondary: string; accent: string; theme: "light" | "dark"; logoUrl?: string }) {
  const dark = theme === "dark";
  const bg = dark ? "#0B0F19" : "#FFFFFF";
  const fg = dark ? "#F9FAFB" : "#111827";
  return (
    <div className="overflow-hidden rounded-xl border shadow-sm" aria-label="Storefront preview" role="img">
      <div className="flex items-center justify-between px-4 py-3" style={{ background: bg, color: fg, borderBottom: `1px solid ${secondary}33` }}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img src={logoUrl} alt="" className="size-6 rounded object-contain" />
          ) : (
            <span className="flex size-6 items-center justify-center rounded" style={{ background: primary, color: "#fff" }}>
              <ShoppingBag className="size-3.5" />
            </span>
          )}
          <span className="truncate">{name || "Your store"}</span>
        </div>
        <span className="text-xs" style={{ color: secondary }}>Shop · About</span>
      </div>
      <div className="space-y-3 px-4 py-5" style={{ background: bg, color: fg }}>
        <p className="text-base font-semibold">New arrivals</p>
        <p className="text-xs" style={{ color: secondary }}>A short line about what makes your brand special.</p>
        <div className="flex items-center gap-3">
          <span className="rounded-md px-3 py-1.5 text-xs font-medium text-white" style={{ background: primary }}>Shop now</span>
          <span className="text-xs font-medium underline underline-offset-4" style={{ color: accent }}>Learn more</span>
        </div>
      </div>
    </div>
  );
}
