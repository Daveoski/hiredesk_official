"use client";

import { Briefcase, CalendarClock, KeyRound, LayoutDashboard, LogOut, Menu, Users, UserCog } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/layout/logo";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useCompany } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { isManager, useAuthStore } from "@/stores/auth-store";

function useNavItems() {
  const user = useAuthStore((state) => state.user);
  const items = [{ href: "/overview", label: "Dashboard", icon: LayoutDashboard }];
  if (user?.role === "hiring_manager") {
    items.push({ href: "/jobs", label: "Jobs", icon: Briefcase });
    items.push({ href: "/candidates", label: "Candidates", icon: Users });
    items.push({ href: "/interviews", label: "Interviews", icon: CalendarClock });
  }
  if (user?.role === "interviewer") {
    items.push({ href: "/candidates", label: "Assigned candidates", icon: Users });
    items.push({ href: "/interviews", label: "Interviews", icon: CalendarClock });
  }
  if (user?.role === "company_admin") items.push({ href: "/team", label: "Team", icon: UserCog });
  items.push({ href: "/account", label: "Account", icon: KeyRound });
  return items;
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = useNavItems();
  const { user, logout } = useAuthStore();
  const company = useCompany();

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1">
        <Logo />
        {company.data && <p className="mt-1 truncate text-sm text-muted-foreground">{company.data.name}</p>}
      </div>
      <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      {user && (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <Avatar name={user.full_name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Log out"
            onClick={() => {
              logout();
              router.push("/login");
            }}
          >
            <LogOut />
          </Button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-background lg:block">
        <Sidebar />
      </aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <Button variant="outline" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu />
        </Button>
      </header>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="left-0 top-0 h-full max-h-none w-72 max-w-none translate-x-0 translate-y-0 rounded-none p-0">
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <Sidebar onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
