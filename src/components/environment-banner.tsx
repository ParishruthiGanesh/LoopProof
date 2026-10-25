import { Badge } from "./ui";

/** Always-visible, plain statement of which integrations are live right now. */
export function EnvironmentBanner({
  aiLive,
  chain,
}: {
  aiLive: boolean;
  chain: {
    configured: boolean;
    reachable: boolean;
    contractDeployed: boolean;
    chainLabel: string;
    simulationMode: boolean;
  };
}) {
  return (
    <div className="border-b border-forest-700 bg-forest-800 text-forest-50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-1.5 text-xs sm:px-6">
        <span className="font-semibold uppercase tracking-wide text-mint">Prototype</span>
        <span className="text-forest-100">Seeded records are labelled demonstration data.</span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {aiLive ? (
            <Badge tone="lime" glyph="◉">
              AI analysis: live
            </Badge>
          ) : (
            <Badge tone="amber" glyph="○">
              AI analysis: example mode (no API key)
            </Badge>
          )}
          <ChainBadge chain={chain} />
        </span>
      </div>
    </div>
  );
}

/** These four states are genuinely different and the banner says which it is. */
function ChainBadge({
  chain,
}: {
  chain: {
    configured: boolean;
    reachable: boolean;
    contractDeployed: boolean;
    chainLabel: string;
    simulationMode: boolean;
  };
}) {
  if (chain.simulationMode) {
    return (
      <Badge tone="amber" glyph="◇">
        Chain: simulation mode
      </Badge>
    );
  }
  if (!chain.configured) {
    return (
      <Badge tone="amber" glyph="○">
        Chain: no contract configured
      </Badge>
    );
  }
  if (!chain.reachable) {
    return (
      <Badge tone="amber" glyph="○">
        Chain: not reachable
      </Badge>
    );
  }
  if (!chain.contractDeployed) {
    return (
      <Badge tone="amber" glyph="!">
        Chain: no contract at the configured address
      </Badge>
    );
  }
  return (
    <Badge tone="lime" glyph="⛓">
      Chain: {chain.chainLabel}
    </Badge>
  );
}
