"use client";

import Link from "next/link";

const TABS = [
  { key: "all", label: "Everything", hint: "Seeded examples and real activity together" },
  { key: "real", label: "Created in this app", hint: "Excludes every seeded demonstration record" },
  { key: "demo", label: "Seeded examples only", hint: "The demonstration data shipped with the prototype" },
];

export function ImpactScopeTabs({ active }: { active: string }) {
  return (
    <div role="group" aria-label="Filter which records are counted" className="flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={`/impact?scope=${tab.key}`}
            aria-current={isActive ? "true" : undefined}
            title={tab.hint}
            className={`rounded-lg border px-3.5 py-2 text-sm font-semibold no-underline hover:no-underline ${
              isActive
                ? "border-forest-700 bg-forest-600 text-white"
                : "border-line-strong bg-paper-raised text-ink hover:bg-paper-sunken"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
