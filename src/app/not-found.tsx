import Link from "next/link";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <EmptyState
        title="That page does not exist"
        action={
          <div className="flex flex-wrap gap-3">
            <Link href="/marketplace">Browse equipment</Link>
            <Link href="/">Return to the start</Link>
          </div>
        }
      >
        The item, request or transfer you asked for was not found. An item ID looks like{" "}
        <code className="lp-mono">LP-MON-K4T2PQ</code> and a passport lives at{" "}
        <code className="lp-mono">/passport/&lt;item id&gt;</code>.
      </EmptyState>
    </div>
  );
}
