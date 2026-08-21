import { useEffect, useRef, useState } from 'react';

import {
  analyseSyntheticFeasibility,
  type ConstraintConflict,
} from '@codaco/protocol-utilities';
import {
  CURRENT_SCHEMA_VERSION,
  validateProtocol,
  type VersionedProtocolDocument,
} from '@codaco/protocol-validation';
import { collectSyntheticAssetData } from '~/utils/syntheticAssetData';

/**
 * Live pre-seed feasibility for the protocol being edited (spec, "Live
 * feasibility"): the engine's own analysis, run against the current draft as
 * the author types, debounced so it never blocks a keystroke.
 *
 * The pipeline is exactly the generation path's: schema-parse the draft
 * (`validateProtocol` — the parse is what supplies every resolved `synthetic`
 * descriptor), resolve roster and Geospatial pools through the editor's own
 * asset store under the engine's host contract, then ask
 * `analyseSyntheticFeasibility` — the same function `generateInterviews`
 * refuses with, so the conflicts returned here are, verbatim, the refusal a
 * generation run would throw.
 *
 * Four statuses:
 *  - `checking`   an edit has superseded the last verdict and the next one is
 *                 still debouncing or in flight;
 *  - `invalid`    the draft does not currently parse (or is not a
 *                 current-schema protocol). Parse errors belong to the
 *                 commit-validation flow, so this carries nothing;
 *  - `feasible`   the parse succeeded and the analysis found no conflict;
 *  - `conflicts`  the analysis refused, with the engine's structured
 *                 conflicts for the owning surfaces to render unparaphrased.
 *
 * A result is discarded when a newer edit supersedes it (monotonic token), so
 * a slow analysis can never overwrite a newer verdict — or resurrect one
 * after the caller moved on.
 */

const SYNTHETIC_FEASIBILITY_DEBOUNCE_MS = 500;

export type SyntheticFeasibilityStatus =
  | 'checking'
  | 'invalid'
  | 'feasible'
  | 'conflicts';

export type SyntheticFeasibility = {
  status: SyntheticFeasibilityStatus;
  /** Empty except when `status` is `conflicts`. */
  conflicts: readonly ConstraintConflict[];
};

// Stable objects so repeated transitions into the same status bail out of
// re-rendering (React skips state updates whose value is identical).
const CHECKING: SyntheticFeasibility = { status: 'checking', conflicts: [] };
const INVALID: SyntheticFeasibility = { status: 'invalid', conflicts: [] };
const FEASIBLE: SyntheticFeasibility = { status: 'feasible', conflicts: [] };

export type UseSyntheticFeasibilityArgs = {
  /**
   * The current draft protocol DOCUMENT — the working copy merged over the
   * saved protocol (e.g. the stage editor's wip protocol), unparsed. `null`
   * when there is nothing to analyse, which reports `invalid`.
   */
  document: VersionedProtocolDocument | null;
  /**
   * The asset-store scope roster and Geospatial pools resolve under — the
   * active protocol's id, as the preview uses it. `null` skips resolution
   * entirely (the engine then treats rosters as never looked for, and roster
   * floors go unmeasured), so pass the real id wherever one exists.
   */
  protocolId: string | null;
  /** Override for tests; edits within this window coalesce into one run. */
  debounceMs?: number;
};

export function useSyntheticFeasibility({
  document,
  protocolId,
  debounceMs = SYNTHETIC_FEASIBILITY_DEBOUNCE_MS,
}: UseSyntheticFeasibilityArgs): SyntheticFeasibility {
  const [result, setResult] = useState<SyntheticFeasibility>(CHECKING);
  // Monotonic supersession token: each effect run claims the next value, and
  // an async continuation may only publish while it still holds the newest.
  const tokenRef = useRef(0);

  useEffect(() => {
    tokenRef.current += 1;
    const token = tokenRef.current;

    if (document === null) {
      setResult(INVALID);
      return;
    }

    setResult(CHECKING);
    const timer = setTimeout(() => {
      void (async () => {
        let next: SyntheticFeasibility;
        try {
          const validation = await validateProtocol(document);
          if (
            !validation.success ||
            validation.data.schemaVersion !== CURRENT_SCHEMA_VERSION
          ) {
            // Mid-edit drafts legitimately fail to parse; the commit
            // validation flow owns saying why.
            next = INVALID;
          } else {
            const parsed = validation.data;
            const assetData =
              protocolId === null
                ? {}
                : await collectSyntheticAssetData(parsed, protocolId);
            if (tokenRef.current !== token) return;
            const conflicts = analyseSyntheticFeasibility(parsed, assetData);
            next =
              conflicts.length > 0
                ? { status: 'conflicts', conflicts }
                : FEASIBLE;
          }
        } catch (error) {
          // A throw past a successful parse would be an engine defect; the
          // editing surface must stay usable either way, so report the draft
          // as unanalysable rather than surfacing a broken verdict.
          // eslint-disable-next-line no-console
          console.error('Synthetic feasibility analysis failed', error);
          next = INVALID;
        }
        // The one publication point: nothing lands unless this continuation
        // still holds the newest claim. (The mid-flight check above is an
        // early-out that saves analysing a stale draft; this is the guard.)
        if (tokenRef.current === token) {
          setResult(next);
        }
      })();
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      // Also invalidates any continuation still in flight on unmount.
      tokenRef.current += 1;
    };
  }, [document, protocolId, debounceMs]);

  return result;
}
