"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Layers } from "lucide-react";
import { appConfig, pages } from "@/config/app";

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
        <Layers className="h-5 w-5 text-slate-700" />
        <span className="text-lg font-bold text-slate-900">
          {appConfig.title}
        </span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
            pathname === "/dashboard"
              ? "bg-slate-100 text-slate-900"
              : "text-slate-600 hover:bg-slate-50"
          )}
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>
        {pages.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className={cn(
              "block rounded-md px-3 py-2 text-sm font-medium",
              pathname === page.href
                ? "bg-slate-100 text-slate-900"
                : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {page.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-4 text-xs text-slate-400">
        {appConfig.tagline}
      </div>
    </div>
  );
}
