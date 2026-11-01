"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderTree, Image as ImageIcon, LayoutDashboard, Package, Palette, Settings, Users } from "lucide-react";
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

/** Links are a convenience only; each target page re-authorises on the server. */
export function WorkspaceNav({ businessId, visible }: { businessId: string; visible: NavKey[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.filter((i) => visible.includes(i.key)).map(({ key, label, icon: Icon }) => {
        const href = `/b/${businessId}/${key}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
