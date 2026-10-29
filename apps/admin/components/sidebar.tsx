import Link from "next/link";
import { SignOutButton } from "./sign-out-button";
import { TenantIndicator } from "./tenant-indicator";
import { SidebarNav } from "./sidebar-nav";

export function Sidebar() {
  return (
    // Fills the shell's height and never moves with the page; scrolls on its own only if the window is very short.
    <aside className="scroll-slim flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-white/5 bg-ink-horizon px-3 py-5">
      <Link href="/" className="mb-5 flex items-center gap-2.5 px-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold text-sm font-bold text-ink-horizon" aria-hidden>
          N
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-white">NaviMus</span>
        <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-sand/80">Admin</span>
      </Link>
      <TenantIndicator />
      <SidebarNav />
      <div className="mt-auto border-t border-white/10 pt-3">
        <SignOutButton className="w-full rounded-lg px-3 py-2 text-left text-sm text-sand/70 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-60" />
      </div>
    </aside>
  );
}
