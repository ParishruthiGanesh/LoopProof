import { redirect } from "next/navigation";
import { getSessionUser, canDonate } from "@/lib/auth";
import { aiStatus, EXAMPLE_ANALYSES } from "@/lib/ai";
import { SectionHeading, Callout, Card } from "@/components/ui";
import { CreateListingForm } from "@/components/create-listing-form";
import { MAX_PHOTOS, MAX_BYTES } from "@/lib/uploads";

export const metadata = { title: "Create a listing" };

export default async function NewListingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");

  const ai = aiStatus();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SectionHeading
        level={1}
        title="List surplus equipment"
        description="Upload photographs, review the draft, then confirm every field before publishing. Nothing is published until you confirm it."
      />

      {!canDonate(user) ? (
        <Callout tone="problem" title="This organization cannot create listings">
          {user.orgName} is registered as a receiving organization. The server rejects listing creation from this
          account, so the form below is not shown.
        </Callout>
      ) : (
        <>
          {ai.liveEnabled ? (
            <Callout tone="info" title="Live photograph analysis is enabled">
              Photographs are sent to <code className="lp-mono">{ai.model}</code> from the server. The API key
              never reaches your browser. Anything the model reads inside a photograph is treated as untrusted
              text, never as an instruction, and every suggestion needs your confirmation before it publishes.
            </Callout>
          ) : (
            <Callout tone="warn" title="Photograph analysis is not available in this environment">
              <p>
                No <code className="lp-mono">ANTHROPIC_API_KEY</code> is configured, so your uploads will{" "}
                <strong>not</strong> be analysed by any model. You can still create the listing manually — every
                field below is editable — or load one of {ai.exampleCount} labelled example analyses to see the
                shape of the output.
              </p>
              <p className="mt-2">{ai.enableInstructions}</p>
            </Callout>
          )}

          <Card className="p-5 sm:p-6">
            <CreateListingForm
              orgRegion={user.orgLocationRegion}
              aiLiveEnabled={ai.liveEnabled}
              aiModel={ai.model}
              maxPhotos={MAX_PHOTOS}
              maxBytes={MAX_BYTES}
              examples={EXAMPLE_ANALYSES.map((e) => ({ key: e.key, label: e.label, describes: e.describes }))}
            />
          </Card>
        </>
      )}
    </div>
  );
}
