"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { logoutAction } from "@/lib/server/actions";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/ui/brand";

export type ShellNavItem = {
  label: string;
  href: string;
  icon?: ReactNode;
  exact?: boolean;
};

export type ShellNavGroup = {
  title?: string;
  items: ShellNavItem[];
};

const SIDEBAR_STORAGE_KEY = "nci-lct-sidebar-collapsed";

/**
 * Estado del sidebar como store externo respaldado por localStorage:
 * persiste entre sesiones sin provocar renders en cascada ni errores de
 * hidratacion (el snapshot de servidor siempre es "expandido").
 */
const sidebarListeners = new Set<() => void>();
let sidebarCollapsed: boolean | null = null;

function readSidebarCollapsed() {
  if (sidebarCollapsed === null) {
    sidebarCollapsed = typeof window !== "undefined" && window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  }
  return sidebarCollapsed;
}

function subscribeSidebar(onChange: () => void) {
  sidebarListeners.add(onChange);
  return () => {
    sidebarListeners.delete(onChange);
  };
}

function toggleSidebarCollapsed() {
  sidebarCollapsed = !readSidebarCollapsed();
  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
  sidebarListeners.forEach((listener) => listener());
}

function isItemActive(pathname: string, item: ShellNavItem) {
  const [href, hash] = item.href.split("#");
  if (hash) return false;
  if (item.exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  groups,
  pathname,
  collapsed,
  onNavigate,
}: {
  groups: ShellNavGroup[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Navegacion principal" className="grid gap-4">
      {groups.map((group, groupIndex) => (
        <div className="grid gap-1" key={group.title ?? groupIndex}>
          {group.title && !collapsed ? (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-nav-muted">{group.title}</p>
          ) : null}
          {group.items.map((item) => {
            const active = isItemActive(pathname, item);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
                  active ? "bg-nav-surface text-white" : "text-nav-muted hover:bg-nav-surface/60 hover:text-nav-foreground",
                  collapsed && "justify-center px-0",
                )}
                href={item.href}
                key={item.href + item.label}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
              >
                {active ? <span aria-hidden className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-nav-active" /> : null}
                {item.icon ? <span aria-hidden className="shrink-0 [&>svg]:size-4.5">{item.icon}</span> : null}
                {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * Chrome de aplicación: sidebar colapsable en escritorio (persistente),
 * drawer de navegación en móvil y topbar con usuario y salida.
 * El contenido llega server-rendered vía children.
 */
export function ShellChrome({
  brandName,
  brandContext,
  navGroups,
  user,
  topExtra,
  children,
}: {
  brandName: string;
  brandContext: string;
  navGroups: ShellNavGroup[];
  user: { name: string; role: string };
  topExtra?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  const toggleCollapsed = useCallback(() => {
    toggleSidebarCollapsed();
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    drawerRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar escritorio */}
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 flex-col bg-nav text-nav-foreground transition-[width] duration-200 ease-in-out lg:flex",
          collapsed ? "w-[76px]" : "w-[264px]",
        )}
      >
        <div className={cn("flex items-center gap-3 px-4 pb-4 pt-5", collapsed && "justify-center px-2")}>
          <BrandMark name={brandName} />
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{brandName}</p>
              <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-nav-muted">{brandContext}</p>
            </div>
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <NavLinks collapsed={collapsed} groups={navGroups} pathname={pathname} />
        </div>
        <div className={cn("border-t border-nav-border px-3 py-3", collapsed && "px-2")}>
          <button
            aria-label={collapsed ? "Expandir menu lateral" : "Colapsar menu lateral"}
            className={cn(
              "flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-xs font-semibold text-nav-muted transition-colors hover:bg-nav-surface/60 hover:text-nav-foreground",
              collapsed && "justify-center px-0",
            )}
            onClick={toggleCollapsed}
            type="button"
          >
            {collapsed ? <PanelLeftOpen aria-hidden className="size-4" /> : <PanelLeftClose aria-hidden className="size-4" />}
            {!collapsed ? <span>Colapsar</span> : null}
          </button>
          {!collapsed ? <p className="mt-2 px-3 text-[10px] leading-4 text-nav-muted/80">Tecnologia de NCI Automation</p> : null}
        </div>
      </aside>

      {/* Drawer móvil */}
      {mobileOpen ? (
        <div aria-modal="true" className="fixed inset-0 z-50 lg:hidden" role="dialog">
          <button aria-label="Cerrar menu" className="absolute inset-0 bg-nav/60 backdrop-blur-sm" onClick={closeMobile} type="button" />
          <div
            className="anim-slide-in-left absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-nav text-nav-foreground shadow-lg outline-none"
            ref={drawerRef}
            tabIndex={-1}
          >
            <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-5">
              <div className="flex items-center gap-3">
                <BrandMark name={brandName} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{brandName}</p>
                  <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-nav-muted">{brandContext}</p>
                </div>
              </div>
              <button
                aria-label="Cerrar menu"
                className="grid size-9 place-items-center rounded-lg text-nav-muted transition-colors hover:bg-nav-surface hover:text-white"
                onClick={closeMobile}
                type="button"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-6">
              <NavLinks collapsed={false} groups={navGroups} onNavigate={closeMobile} pathname={pathname} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Columna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
          <div className="flex min-h-14 items-center gap-3 px-4 md:px-6">
            <button
              aria-label="Abrir menu de navegacion"
              className="grid size-10 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted lg:hidden"
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <Menu aria-hidden className="size-4.5" />
            </button>
            <p className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-faint-foreground sm:block">{brandContext}</p>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              {topExtra}
              <div className="hidden text-right sm:block">
                <p className="max-w-[180px] truncate text-sm font-semibold text-foreground">{user.name}</p>
                <p className="text-[11px] text-muted-foreground">{user.role}</p>
              </div>
              <form action={logoutAction}>
                <button
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-muted"
                  type="submit"
                >
                  <LogOut aria-hidden className="size-4" />
                  Salir
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6" id="contenido-principal">
          {children}
        </main>
      </div>
    </div>
  );
}
