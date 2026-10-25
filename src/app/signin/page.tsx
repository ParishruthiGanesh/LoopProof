import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { Card, SectionHeading, Callout, Badge } from "@/components/ui";
import { SignInForms } from "@/components/sign-in-forms";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getSessionUser()) redirect("/dashboard");

  const db = getDb();
  const rows = await db
    .select({
      userId: schema.users.id,
      userName: schema.users.name,
      email: schema.users.email,
      orgName: schema.organizations.name,
      orgKind: schema.organizations.kind,
      orgDescription: schema.organizations.description,
      orgRegion: schema.organizations.locationRegion,
    })
    .from(schema.users)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.users.orgId))
    .where(eq(schema.users.isDemo, true));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionHeading
        level={1}
        title="Sign in"
        description="Pick a demonstration account, or sign in with an email address and password."
      />

      <Callout tone="info" title="These accounts are fictional">
        The three organizations below are made up for this prototype. They are not real institutions and no
        partnership with any named institution is implied. Entering one creates a real server-side session for
        that account: the backend then enforces that organization&rsquo;s permissions, so you cannot act as a
        donor while signed in as a recipient.
      </Callout>

      <Card className="p-5 sm:p-6">
        <SignInForms
          accounts={rows.map((r) => ({
            userId: r.userId,
            userName: r.userName,
            email: r.email,
            orgName: r.orgName,
            orgKind: r.orgKind,
            orgDescription: r.orgDescription,
            orgRegion: r.orgRegion,
          }))}
          demoPassword="loopproof-demo"
        />
      </Card>

      <p className="text-sm text-ink-muted">
        Public visitors do not need an account: <a href="/marketplace">browse approved listings</a> and view any{" "}
        <Badge tone="outline">public passport</Badge> without signing in. Contact details and private evidence
        require authorisation.
      </p>
    </div>
  );
}
