"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Database,
  LayoutDashboard,
  Layers,
  Plus,
  Sparkles,
  Table2,
} from "lucide-react";
import { appConfig, entities, pages, workflows } from "@/config/app";

function workflowPage(slug: string): string {
  return (
    pages.find((p) => p.workflows.includes(slug))?.href ??
    pages[0]?.href ??
    "/dashboard"
  );
}

function SidebarInner() {
  const [legacy, setLegacy] = useState(false);
  useEffect(() => {
    void fetch("/api/grants/organizations")
      .then((r) => r.json())
      .then((d) =>
        setLegacy(
          Array.isArray(d.organizations) &&
            d.organizations.some(
              (m: { organizationId: string }) => m.organizationId === "legacy",
            ),
        ),
      )
      .catch(() => setLegacy(false));
  }, []);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeEntity = searchParams.get("entity");
  const activeWorkflow = searchParams.get("workflow");
  const activeMode = searchParams.get("mode");

  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
        <Layers className="h-5 w-5 text-slate-700" />
        <span className="truncate text-lg font-bold text-slate-900">
          {appConfig.title}
        </span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {legacy && (
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
              pathname === "/dashboard"
                ? "bg-slate-100 text-slate-900"
                : "text-slate-600 hover:bg-slate-50",
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            Original record dashboard
          </Link>
        )}
        <Link
          href="/projects"
          className="block rounded-md px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
        >
          Grant projects
        </Link>
        <Link
          href="/organizations"
          className="block rounded-md px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
        >
          Organizations & reviewers
        </Link>
        <Link
          href="/grant-notifications"
          className="block rounded-md px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
        >
          Project notifications
        </Link>
        {legacy &&
          pages.map((page) => {
            const isActivePage = pathname === page.href;
            return (
              <div key={page.href} className="pt-1">
                <Link
                  href={page.href}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm font-semibold",
                    isActivePage
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {page.label}
                </Link>
                <div className="ml-2 space-y-0.5 border-l border-slate-100 pl-2">
                  {page.entities.map((name) => {
                    const label = entities[name]?.label ?? name;
                    const href = `${page.href}?entity=${encodeURIComponent(name)}&mode=records`;
                    const isActiveEntity =
                      isActivePage && activeEntity === name;
                    return (
                      <Link
                        key={name}
                        href={href}
                        title={`Show ${label} table`}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]",
                          isActiveEntity
                            ? "bg-slate-900 text-white"
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                        )}
                      >
                        <Table2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <span className="truncate">{label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        {legacy && (
          <div className="pt-2">
            <p className="flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <Sparkles className="h-3 w-3" /> AI actions
            </p>
            <div className="mt-1 space-y-0.5">
              {workflows.map((w) => {
                const href = `${workflowPage(w.slug)}?mode=analysis&workflow=${encodeURIComponent(w.slug)}`;
                const isActive =
                  activeWorkflow === w.slug && activeMode !== "records";
                return (
                  <Link
                    key={w.slug}
                    href={href}
                    title={w.description}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium",
                      isActive
                        ? "bg-violet-100 text-violet-900"
                        : "text-slate-600 hover:bg-violet-50 hover:text-violet-900",
                    )}
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{w.title}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        {legacy && (
          <div className="pt-2">
            <p className="flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <Plus className="h-3 w-3" /> Quick add
            </p>
            <div className="mt-1 space-y-0.5">
              {pages.flatMap((page) =>
                page.entities.slice(0, 2).map((name) => (
                  <Link
                    key={`${page.href}-${name}`}
                    href={`${page.href}?entity=${encodeURIComponent(name)}&mode=records&new=1`}
                    title={`New ${entities[name]?.label ?? name}`}
                    className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate">
                      New {entities[name]?.label ?? name}
                    </span>
                  </Link>
                )),
              )}
            </div>
          </div>
        )}
        {legacy && (
          <div className="pt-2">
            <p className="flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <Database className="h-3 w-3" /> All tables
            </p>
          </div>
        )}
      </nav>
      <div className="border-t border-slate-200 p-4 text-xs text-slate-400">
        {appConfig.tagline}
      </div>
    </div>
  );
}

export default function Sidebar() {
  return (
    <Suspense
      fallback={<div className="w-64 border-r border-slate-200 bg-white" />}
    >
      <SidebarInner />
    </Suspense>
  );
}
