import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getSessionUser } from "@/lib/auth";
import { AccountMenu } from "@/components/account-menu";
import { EnvironmentBanner } from "@/components/environment-banner";
import { aiStatus } from "@/lib/ai";
import { rpcHealth } from "@/lib/chain";

export const metadata: Metadata = {
  title: {
    default: "LoopProof — give equipment a second life, keep the proof",
    template: "%s · LoopProof",
  },
  description:
    "LoopProof helps universities, businesses and nonprofits find a second use for surplus equipment and document completed transfers.",
};

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/marketplace", label: "Equipment" },
  { href: "/requests", label: "Requests" },
  { href: "/transfers", label: "Transfers" },
  { href: "/impact", label: "Impact" },
  { href: "/about", label: "How it works" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, ai, chain] = await Promise.all([getSessionUser(), Promise.resolve(aiStatus()), rpcHealth()]);

  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a className="skip-link" href="#main">
          Skip to main content
        </a>

        <EnvironmentBanner
          aiLive={ai.liveEnabled}
          chain={{
            configured: chain.configured,
            reachable: chain.reachable,
            contractDeployed: chain.contractDeployed,
            chainLabel: chain.chainLabel,
            simulationMode: chain.simulationMode,
          }}
        />

        <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5 no-underline hover:no-underline">
              <LoopMark />
              <span className="text-base font-bold tracking-tight text-forest-700">LoopProof</span>
            </Link>

            <nav aria-label="Main" className="order-3 w-full sm:order-none sm:w-auto">
              <ul className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="rounded-lg px-2.5 py-1.5 font-medium text-ink-soft no-underline hover:bg-mint-soft hover:text-forest-700 hover:no-underline"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="ml-auto">
              <AccountMenu
                user={
                  user
                    ? { name: user.name, orgName: user.orgName, orgKind: user.orgKind, isDemo: user.isDemo }
                    : null
                }
              />
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
          {children}
        </main>

        <footer className="mt-10 border-t border-line bg-paper-sunken/60">
          <div className="mx-auto max-w-7xl space-y-3 px-4 py-8 text-sm text-ink-muted sm:px-6">
            <p className="max-w-3xl">
              <strong className="text-ink-soft">What LoopProof does and does not prove.</strong> LoopProof records
              acknowledgments and detects changes to anchored evidence. It does not independently prove that an item
              works, that a physical handoff occurred, or that the same object was not registered under a different
              identity.
            </p>
            <p className="max-w-3xl">
              All organizations and listings shipped with this prototype are fictional demonstration data. LoopProof
              does not issue carbon credits, tradable tokens or environmental certificates.
            </p>
            <p>
              <Link href="/about">Architecture, trust boundaries and feature status</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

function LoopMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="12" fill="var(--color-forest-600)" />
      <path
        d="M8 13.5a5 5 0 0 1 9-3M18 12.5a5 5 0 0 1-9 3"
        stroke="var(--color-mint)"
        strokeWidth="1.9"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M17 7.2v3.4h-3.4" stroke="var(--color-lime)" strokeWidth="1.9" fill="none" strokeLinecap="round" />
      <path d="M9 18.8v-3.4h3.4" stroke="var(--color-lime)" strokeWidth="1.9" fill="none" strokeLinecap="round" />
    </svg>
  );
}
