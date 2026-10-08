"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Vote, Users, Truck, Award, History, ScrollText, ShieldCheck, Settings, Medal,
} from "lucide-react";

const ICONS = { dashboard: LayoutDashboard, vote: Vote, users: Users, units: Truck, offices: Award, history: History,
  audit: ScrollText, roles: ShieldCheck, settings: Settings, ranks: Medal };

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <>
      {items.map((i) => {
        const Icon = ICONS[i.icon];
        const active = path === i.href || path.startsWith(i.href + "/");
        return (
          <Link key={i.href} href={i.href} className="nav-link" data-active={active}>
            <Icon className="h-[18px] w-[18px]" />
            {i.label}
          </Link>
        );
      })}
    </>
  );
}
