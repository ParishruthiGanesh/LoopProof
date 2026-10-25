"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Select, TextInput } from "./controls";

type Option = { value: string; label: string };

export function MarketplaceFilters({
  categories,
  conditions,
  regions,
  initial,
}: {
  categories: Option[];
  conditions: Option[];
  regions: string[];
  initial: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q ?? "");

  const apply = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    startTransition(() => router.push(`/marketplace?${next.toString()}`));
  };

  return (
    <form
      className="rounded-card border border-line bg-paper-raised p-4"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ q });
      }}
      role="search"
      aria-label="Filter equipment listings"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label htmlFor="filter-q" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Search
          </label>
          <TextInput
            id="filter-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Title, brand, model or item ID"
          />
        </div>

        <FilterSelect
          id="filter-category"
          label="Category"
          value={initial.category ?? ""}
          onChange={(value) => apply({ category: value })}
          options={[{ value: "", label: "Any category" }, ...categories]}
        />
        <FilterSelect
          id="filter-condition"
          label="Minimum condition"
          value={initial.condition ?? ""}
          onChange={(value) => apply({ condition: value })}
          options={[{ value: "", label: "Any condition" }, ...conditions]}
        />
        <FilterSelect
          id="filter-availability"
          label="Availability"
          value={initial.availability ?? "available"}
          onChange={(value) => apply({ availability: value })}
          options={[
            { value: "available", label: "Available now" },
            { value: "reserved", label: "Reserved" },
            { value: "transferred", label: "Already transferred" },
            { value: "all", label: "Any status" },
          ]}
        />
        <FilterSelect
          id="filter-region"
          label="Area"
          value={initial.region ?? ""}
          onChange={(value) => apply({ region: value })}
          options={[{ value: "", label: "Any area" }, ...regions.map((r) => ({ value: r, label: r }))]}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <FilterSelect
          id="filter-origin"
          label="Record source"
          inline
          value={initial.origin ?? "all"}
          onChange={(value) => apply({ origin: value })}
          options={[
            { value: "all", label: "Seeded examples and real activity" },
            { value: "demo", label: "Seeded examples only" },
            { value: "real", label: "Created in this app only" },
          ]}
        />
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          Apply search
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setQ("");
            startTransition(() => router.push("/marketplace"));
          }}
        >
          Clear all
        </Button>
      </div>
    </form>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  inline = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  inline?: boolean;
}) {
  return (
    <div className={inline ? "flex items-center gap-2" : ""}>
      <label
        htmlFor={id}
        className={
          inline
            ? "text-xs font-semibold uppercase tracking-wide text-ink-muted"
            : "mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted"
        }
      >
        {label}
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
