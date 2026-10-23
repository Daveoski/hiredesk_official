"use client";

import { ArrowUpRight, LayoutDashboard, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/layout/logo";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { HOME, ROLE_LABEL } from "@/lib/constants";
import { cn, initials } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

const links = [
  { href: "#workflow", label: "Workflow" },
  { href: "#features", label: "Features" },
  { href: "#teams", label: "For your team" },
];

// The saved session only exists in the browser, so wait for it before choosing which buttons to show.
function useSession() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return { hydrated, user: token ? user : null };
}

function AuthActions({ onNavigate }: { onNavigate?: () => void }) {
  const { hydrated, user } = useSession();

  if (!hydrated) return <span aria-hidden className="h-10 w-44 rounded-full bg-white/10" />;

  if (user) {
    return (
      <div key="signed-in" className="auth-swap flex items-center gap-2 sm:gap-3">
        <span
          title={`${user.full_name} · ${ROLE_LABEL[user.role]}`}
          className="hidden size-10 items-center justify-center rounded-full bg-[#e6f18f] text-xs font-bold text-[#17201d] ring-2 ring-white/20 sm:inline-flex"
        >
          {initials(user.full_name)}
        </span>
        <Link
          href={HOME[user.role]}
          onClick={onNavigate}
          className="auth-pill group inline-flex h-10 items-center gap-2 rounded-full bg-[#e6f18f] px-4 text-sm font-semibold text-[#17201d] hover:bg-white"
        >
          <LayoutDashboard className="size-4" /> Dashboard
        </Link>
        <SignOutButton tone="dark" onSignedOut={onNavigate} />
      </div>
    );
  }

  return (
    <div key="signed-out" className="auth-swap flex items-center gap-2 sm:gap-3">
      <Link
        href="/login"
        onClick={onNavigate}
        className="auth-pill inline-flex h-10 items-center rounded-full border border-white/30 px-4 text-sm font-semibold text-white hover:border-white hover:bg-white/10"
      >
        Sign in
      </Link>
      <Link
        href="/register"
        onClick={onNavigate}
        className="auth-pill group inline-flex h-10 items-center gap-2 rounded-full bg-[#e6f18f] px-4 text-sm font-semibold text-[#17201d] hover:bg-white sm:px-5"
      >
        Get started
        <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-500",
        scrolled || menuOpen ? "bg-[rgba(23,32,29,0.88)] shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)] backdrop-blur-md" : "bg-transparent",
      )}
    >
      <nav
        className={cn(
          "mx-auto flex max-w-7xl items-center justify-between px-5 transition-[padding] duration-500 sm:px-8 lg:px-12",
          scrolled ? "py-3" : "py-5",
        )}
        aria-label="Main navigation"
      >
        <Link href="/" className="inline-flex items-center gap-2.5 font-display text-2xl font-semibold text-white sm:text-3xl">
          <LogoMark className="size-8 sm:size-9" />
          <span>
            HirePlume<span className="text-[#db7559]">.</span>
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {links.map(({ href, label }) => (
            <a key={href} href={href} className="nav-underline text-sm text-white/75 transition hover:text-white">
              {label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle tone="dark" />
          <AuthActions />
        </div>

        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-full border border-white/30 text-white md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      <div
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows,opacity] duration-500 md:hidden",
          menuOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0">
          <div className="flex flex-col gap-1 border-t border-white/15 px-5 pb-6 pt-3">
            {links.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-2 py-3 text-base text-white/85 hover:bg-white/10 hover:text-white"
              >
                {label}
              </a>
            ))}
            <div className="mt-3 flex items-center justify-between gap-3 px-2">
              <span className="text-sm text-white/70">Theme</span>
              <ThemeToggle tone="dark" />
            </div>
            <div className="mt-4">
              <AuthActions onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
