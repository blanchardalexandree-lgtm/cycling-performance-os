"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Dashboard", icon: "M3 12h4l3-8 4 16 3-8h4" },
  { href: "/calendar", label: "Calendrier", icon: "M4 6h16M4 6v14h16V6M8 3v5m8-5v5M4 11h16" },
  { href: "/coach", label: "Coach", icon: "M4 5h16v11H8l-4 4z" },
  { href: "/performance", label: "Performance", icon: "M4 20V10m6 10V4m6 16v-7m4 7H2" },
  { href: "/activities", label: "Activités", icon: "M5 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm14 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 16l4-8h5l3 8M9 8l3 8" },
  { href: "/goals", label: "Objectifs", icon: "M5 21V4m0 0h11l-2 4 2 4H5" },
  { href: "/workouts", label: "Séances", icon: "M4 17l5-5 4 4 7-8" },
  { href: "/recovery", label: "Récupération", icon: "M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" },
  { href: "/integrations", label: "Intégrations", icon: "M9 7V3m6 4V3M7 7h10v4a5 5 0 0 1-10 0zm5 9v5" },
  { href: "/profile", label: "Profil", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0" },
];
const MOBILE = ["/", "/calendar", "/coach", "/performance", "/profile"];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Nav({ userName }: { userName: string }) {
  const path = usePathname();
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-bg px-3 py-4 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[13px] font-bold text-accent-ink">CP</span>
          <span className="text-sm font-semibold tracking-tight">Performance OS</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Navigation principale">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors ${active(i.href) ? "bg-surface-2 text-ink" : "text-ink-3 hover:bg-surface hover:text-ink-2"}`}>
              <Icon d={i.icon} />
              {i.label}
              {active(i.href) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line px-2 pt-3 text-xs text-ink-3">
          <div className="truncate text-ink-2">{userName}</div>
          <form action="/api/auth/logout" method="post"><button className="mt-1 hover:text-ink">Se déconnecter</button></form>
        </div>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Navigation mobile">
        {ITEMS.filter((i) => MOBILE.includes(i.href)).map((i) => (
          <Link key={i.href} href={i.href} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${active(i.href) ? "text-accent" : "text-ink-3"}`}>
            <Icon d={i.icon} />
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

export function MobileMore() {
  return (
    <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
      {ITEMS.filter((i) => !MOBILE.includes(i.href)).map((i) => (
        <Link key={i.href} href={i.href} className="chip shrink-0 py-1">{i.label}</Link>
      ))}
    </div>
  );
}
