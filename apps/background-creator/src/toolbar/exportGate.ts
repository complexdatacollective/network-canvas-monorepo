import { validateZoneLabels, zonesOf } from '~/geometry/zones';
import type { BackgroundDocument } from '~/model/types';

// The result of checking whether a document is ready for zone-assignment script
// export. Extracted as a pure function so the gate is testable without dialogs.
type ScriptExportGate =
  | { ok: true }
  | { ok: false; reason: 'no-zones' }
  | { ok: false; reason: 'invalid-labels'; problems: string[] };

// Script export requires at least one zone (the script assigns each node the
// label of its containing zone) and every label to be present and unique (labels
// become the assigned variable's values). Mirrors §5 of the design spec.
export function evaluateScriptExport(
  doc: BackgroundDocument,
): ScriptExportGate {
  const zones = zonesOf(doc);
  if (zones.length === 0) {
    return { ok: false, reason: 'no-zones' };
  }
  const labels = validateZoneLabels(zones);
  if (!labels.ok) {
    return { ok: false, reason: 'invalid-labels', problems: labels.problems };
  }
  return { ok: true };
}
