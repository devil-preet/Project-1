"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye, FolderTree, Image as ImageIcon, LayoutDashboard, Package, Palette, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavKey = "overview" | "products" | "categories" | "branding" | "media" | "team" | "settings";

const ITEMS: { key: NavKey; label: string; icon: typeof Package }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "products", label: "Products", icon: Package },
  { key: "categories", label: "Categories", icon: FolderTree },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "media", label: "Media", icon: ImageIcon },
  { key: "team", label: "Team", icon: Users },
  { key: "settings", label: "Settings", icon: Settings },
];

/**
 * Nova rail: a floating glass rail that expands on hover/focus (desktop) and becomes a bottom pill bar on
 * phones. Links are a convenience only; each target page re-authorises on the server.
 */
export function WorkspaceNav({ businessId, visible, storeSlug }: { businessId: string; visible: NavKey[]; storeSlug: string | null }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Workspace"
      className={cn(
        "group/rail fixed z-50 flex gap-1.5 overflow-hidden border border-[var(--nv-line)] bg-[rgba(20,17,24,.78)] backdrop-blur-xl",
        // phones: bottom pill bar
        "inset-x-2 bottom-2 h-16 flex-row overflow-x-auto rounded-full p-2",
        // desktop: left floating rail that expands
        "md:inset-x-auto md:bottom-3.5 md:left-3.5 md:top-3.5 md:h-auto md:w-[68px] md:flex-col md:overflow-hidden md:rounded-[26px] md:px-2.5 md:py-3",
        "md:transition-[width,box-shadow] md:duration-300 md:ease-[var(--nv-ease)] md:hover:w-56 md:hover:shadow-[0_24px_70px_rgba(0,0,0,.6)] md:focus-within:w-56",
      )}
    >
      <Link
        href="/dashboard"
        aria-label="All businesses"
        className="hidden items-center gap-3 border-b border-[var(--nv-line)] px-1 pb-3 md:mb-1.5 md:flex"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#EAD7FA,#C69CE9)] font-heading text-sm font-semibold text-primary-foreground">N</span>
        <span className="nv-title whitespace-nowrap text-sm opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">Brand Portal</span>
      </Link>
      {ITEMS.filter((i) => visible.includes(i.key)).map(({ key, label, icon: Icon }) => {
        const href = `/b/${businessId}/${key}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            className={cn(
              "relative flex h-11 shrink-0 items-center gap-3.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors md:h-[46px] md:rounded-[15px]",
              active ? "bg-[rgba(217,184,244,.12)] text-primary" : "text-muted-foreground hover:bg-[rgba(217,184,244,.09)] hover:text-foreground",
              // active indicator: bar on the left (desktop) / underline (phones)
              "after:absolute after:rounded-full after:bg-primary after:opacity-0 after:content-[''] after:shadow-[0_0_14px_var(--nv-accent)] aria-[current=page]:after:opacity-100",
              "after:inset-x-3 after:-bottom-1.5 after:h-[3px] md:after:inset-x-auto md:after:-left-2.5 md:after:bottom-3 md:after:top-3 md:after:h-auto md:after:w-[3px]",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <span className="hidden opacity-0 transition-opacity duration-200 md:inline group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">{label}</span>
          </Link>
        );
      })}
      {storeSlug && (
        <Link
          href={`/s/${storeSlug}`}
          target="_blank"
          aria-label="Preview store"
          className="hidden h-[46px] items-center gap-3.5 rounded-[15px] px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:bg-[rgba(217,184,244,.09)] hover:text-foreground md:mt-auto md:flex"
        >
          <Eye className="size-5 shrink-0" aria-hidden />
          <span className="opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">Preview store</span>
        </Link>
      )}
    </nav>
  );
}
