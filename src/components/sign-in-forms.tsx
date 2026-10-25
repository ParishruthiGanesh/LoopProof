"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, TextInput } from "./controls";
import { Badge, Callout } from "./ui";

type Account = {
  userId: string;
  userName: string;
  email: string;
  orgName: string;
  orgKind: string;
  orgDescription: string;
  orgRegion: string;
};

const ROLE_LABEL: Record<string, string> = {
  donor: "Donor",
  recipient: "Recipient",
  both: "Donor and recipient",
};

export function SignInForms({ accounts, demoPassword }: { accounts: Account[]; demoPassword: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const enterDemo = async (userId: string) => {
    setBusyId(userId);
    setError(null);
    const response = await fetch("/api/auth/demo-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setBusyId(null);
    if (!response.ok || data.error) {
      setError(data.error ?? "Could not sign in.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyId("password");
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setBusyId(null);
    if (!response.ok || data.error) {
      setError(data.error ?? "Could not sign in.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-base">Demonstration accounts</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Each button signs in as that organization&rsquo;s staff member.
        </p>
        <ul className="mt-3 space-y-3">
          {accounts.map((account) => (
            <li
              key={account.userId}
              className="flex flex-col gap-3 rounded-card border border-line bg-paper-sunken/40 p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink">{account.orgName}</p>
                  <Badge tone="outline">{ROLE_LABEL[account.orgKind] ?? account.orgKind}</Badge>
                  <Badge tone="amber" glyph="◆">
                    Fictional
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{account.orgDescription}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {account.userName} · {account.orgRegion}
                </p>
              </div>
              <Button
                onClick={() => enterDemo(account.userId)}
                loading={busyId === account.userId}
                className="shrink-0"
              >
                Enter as {ROLE_LABEL[account.orgKind]?.split(" ")[0] ?? "this org"}
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={signIn} className="space-y-4 border-t border-line pt-6">
        <h2 className="text-base">Or sign in with a password</h2>
        <p className="text-sm text-ink-soft">
          The seeded accounts all use the password <code className="lp-mono">{demoPassword}</code>. Their email
          addresses are listed above each account.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email address" required htmlFor="signin-email">
            <TextInput
              id="signin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={accounts[0]?.email ?? "you@example.org"}
            />
          </Field>
          <Field label="Password" required htmlFor="signin-password">
            <TextInput
              id="signin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>
        <Button type="submit" variant="secondary" loading={busyId === "password"}>
          Sign in
        </Button>
      </form>

      {error ? <Callout tone="problem">{error}</Callout> : null}
    </div>
  );
}
