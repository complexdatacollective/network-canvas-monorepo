// What must never leave the process, and the one check that enforces it today
// (#1900, for #1897).
//
// The rule, from the 2026-09-14 ruling on #1897 — three kinds of value that
// may not be sent to any sink outside this process (a log line, a span
// attribute, a metric label, an error report, an analytics event):
//
//  1. **Participant information** — `participants.email` / `phone` / `name` /
//     `attributes`, `message_deliveries.recipient_address`,
//     `participant_contact_optouts.recipient_address`, and anything assembled
//     from them. Contact details are stored in plain columns (#1900, ruled
//     2026-09-14), so the only thing keeping them inside the deployment is
//     that nothing sends them out; a log line carrying an address puts it
//     somewhere the encrypted volume is not.
//  2. **Asset keys** — the `value` of an `apikey` entry in a protocol's asset
//     manifest, at rest only in `protocol_asset_keys` and opened only to
//     assemble a protocol for a participant session or a researcher preview.
//     It is a researcher's own credential with a third party (a Mapbox token
//     bills their account), and the one secret that passes through a document
//     Studio otherwise hands around freely.
//  3. **Secrets** — webhook signing secrets, OAuth access, refresh and id
//     tokens, the keyring itself, and any envelope or key id read back out of
//     a column. These let someone act as Studio or as a researcher; the
//     keyring and the envelope refuse to print themselves for this reason,
//     and a sink that serialised a caught error, or an adapter row, would
//     undo that.

export const TELEMETRY_EXCLUSIONS = [
  'participant-information',
  'participant-responses',
  'asset-keys',
  'secrets',
  'researcher-identity',
  'team-study-and-protocol-names',
  'protocol-content',
  'ip-addresses',
  'request-urls-and-headers',
  'free-text-error-messages',
] as const;

export type TelemetryExclusion = (typeof TELEMETRY_EXCLUSIONS)[number];

/** Thrown when an assembled protocol document still carries an API key. */
export class AssetKeyLeakError extends Error {
  constructor(assetIds: readonly string[]) {
    super(
      `Protocol document carries API key values for asset(s) ${assetIds.join(', ')}. ` +
        'A key must stay sealed in protocol_asset_keys until a participant session or ' +
        'a researcher preview assembles the protocol.',
    );
    this.name = 'AssetKeyLeakError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Refuses an assembled protocol document that carries an `apikey` asset's
 * `value`.
 *
 * Asserted on the way OUT of the store rather than trusted from the way in:
 * the write boundary strips keys and a database trigger backs it up, so this
 * can only fire if some future path assembles a document from somewhere other
 * than `sections` — which is exactly the change that would quietly reopen the
 * hole, and the one a test of the write boundary would not catch.
 *
 * The check is "carries a `value` key at all", not "carries a plausible key":
 * a redacted entry has no such property, and `withPlaceholderAssetKeys` — the
 * one thing that puts a value back for validation — produces a document that
 * is never returned to a caller. So anything with a `value` on it here is a
 * document that went somewhere it should not have.
 */
export function assertNoAssetKeyValues(
  document: Record<string, unknown>,
): void {
  const manifest = document.assetManifest;
  if (!isRecord(manifest)) return;
  const leaking: string[] = [];
  for (const [assetId, entry] of Object.entries(manifest)) {
    if (isRecord(entry) && entry.type === 'apikey' && 'value' in entry) {
      leaking.push(assetId);
    }
  }
  if (leaking.length > 0) throw new AssetKeyLeakError(leaking);
}
