"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { LayoutDashboard, Users, MessageCircle, Settings } from "lucide-react";
import { useResource, mutation } from "@/lib/client-api";
import { bindDraftActor } from "@/lib/client-drafts";
import { Avatar, ErrorPanel, Notice } from "./ui";
import { Brand } from "./landing";
import OceanBackground from "./ocean-background";
import type { Account, OwnProfile } from "@/shared/contracts";
const Context = createContext<{
  account: Account;
  profile: OwnProfile;
  refresh: () => void;
} | null>(null);
export function useMember() {
  return useContext(Context)!;
}
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useResource<{ account: Account; profile: OwnProfile }>("/api/me");
  useEffect(() => {
    if (me.data?.account.id) bindDraftActor(me.data.account.id);
  }, [me.data?.account.id]);
  const [expired, setExpired] = useState(false),
    [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    const end = () => setExpired(true);
    window.addEventListener("session-expired", end);
    return () => window.removeEventListener("session-expired", end);
  }, []);
  useEffect(() => {
    const title = document.querySelector<HTMLElement>("main h1");
    title?.focus();
    if (title) document.title = `${title.textContent} · Diverse DMV`;
  }, [pathname, me.loading]);
  async function logout() {
    try {
      await mutation("/api/session", undefined, "DELETE");
      window.dispatchEvent(new Event("clear-private-drafts"));
      router.replace("/");
      router.refresh();
    } catch {
      setLogoutError("We couldn’t log you out. Try again.");
    }
  }
  if (expired || me.error?.code === "UNAUTHENTICATED")
    return (
      <div className="auth-page">
        <header className="public-header">
          <Brand />
        </header>
        <main tabIndex={-1} id="main" className="public-section">
          <h1 tabIndex={-1}>Log in to continue</h1>
          <Notice title="Your session ended. Log in to continue.">
            <p>Unsent text may be lost when you log in again.</p>
            <Link
              className="button"
              href={`/login?returnTo=${encodeURIComponent(pathname)}`}
            >
              Log in
            </Link>
          </Notice>
        </main>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <Link
          href="/profile"
          className="identity-link"
          aria-label={`My profile: ${me.data?.profile.data.displayName || "Member"}`}
        >
          <Avatar name={me.data?.profile.data.displayName || "Member"} />
          <span>
            {me.data?.profile.data.displayName || "My profile"}
            <small>View my profile</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          {[
            ["/dashboard", "Dashboard", LayoutDashboard],
            ["/connections/discover", "Connections", Users],
            ["/messages", "Messages", MessageCircle],
          ].map(([href, label, Icon]: any) => (
            <Link
              key={href}
              href={href}
              aria-current={
                pathname.startsWith(
                  label === "Connections" ? "/connections" : href,
                )
                  ? "page"
                  : undefined
              }
            >
              <Icon size={19} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link
            href="/settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
          >
            <Settings size={18} aria-hidden="true" />
            Settings
          </Link>
          <button className="text-button" onClick={logout}>
            Log out
          </button>
          {logoutError && <Notice error title={logoutError} />}
        </div>
      </aside>
      <main
        tabIndex={-1}
        id="main"
        className="app-main ocean-scene ocean-scene-deep"
      >
        <OceanBackground />
        <div className="app-content">
          {me.loading && !me.data ? (
            <Notice title="Loading your information…" />
          ) : me.error ? (
            <ErrorPanel error={me.error} retry={me.reload} />
          ) : me.data ? (
            <Context.Provider
              value={{ ...me.data, refresh: () => void me.reload() }}
            >
              {children}
            </Context.Provider>
          ) : null}
        </div>
      </main>
    </div>
  );
}
export function ConnectionsNav() {
  const p = usePathname();
  return (
    <nav className="subnav" aria-label="Connections views">
      {[
        ["/connections/discover", "Discover"],
        ["/connections/requests", "Requests"],
        ["/connections/mine", "My connections"],
      ].map(([href, label]) => (
        <Link
          href={href}
          key={href}
          aria-current={p === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
