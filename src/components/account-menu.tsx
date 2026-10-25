"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "./controls";
import { Badge } from "./ui";

export function AccountMenu({
  user,
}: {
  user: { name: string; orgName: string; orgKind: string; isDemo: boolean } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <Link href="/signin" className="no-underline hover:no-underline">
        <Button size="sm">Sign in</Button>
      </Link>
    );
  }

  const signOut = async () => {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    setBusy(false);
    startTransition(() => {
      router.push("/");
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right leading-tight sm:block">
        <p className="text-sm font-semibold text-ink">{user.name}</p>
        <p className="text-xs text-ink-muted">{user.orgName}</p>
      </div>
      {user.isDemo ? (
        <Badge tone="amber" glyph="◆">
          Demo account
        </Badge>
      ) : null}
      <Button size="sm" variant="secondary" onClick={signOut} loading={busy || pending}>
        Sign out
      </Button>
    </div>
  );
}
