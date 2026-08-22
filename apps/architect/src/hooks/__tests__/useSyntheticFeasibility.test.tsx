import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { analyseSyntheticFeasibility } from '@codaco/protocol-utilities';
import {
  CurrentProtocolSchema,
  type VersionedProtocolDocument,
} from '@codaco/protocol-validation';

import { useSyntheticFeasibility } from '../useSyntheticFeasibility';

/**
 * The live-feasibility hook, over the REAL schema and the REAL engine
 * analysis: a tiny protocol document per verdict, fake timers for the
 * debounce, and the supersession token held to its contract by a case the
 * guard alone decides.
 *
 * `protocolId` stays null throughout — these documents carry no roster or
 * Geospatial stages, so there are no pools to resolve and no asset store to
 * touch.
 */

const DEBOUNCE = 500;

const documentWithStages = (
  stages: Record<string, unknown>[],
): VersionedProtocolDocument =>
  // Through unknown: the fixture's stages are loose records, as a stored
  // document's are — exactly what the hook's parse step exists to decide on.
  ({
    name: 'Feasibility hook protocol',
    description: 'Live feasibility fixtures.',
    schemaVersion: 8,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            name: { name: 'name', type: 'text', component: 'Text' },
            close: {
              name: 'close',
              type: 'boolean',
              component: 'Toggle',
              validation: { unique: true },
            },
          },
        },
      },
    },
    stages,
  }) as unknown as VersionedProtocolDocument;

/** Parses clean and generates: a quick-add eliciting two people. */
const FEASIBLE_DOCUMENT = documentWithStages([
  {
    id: 'quick',
    type: 'NameGeneratorQuickAdd',
    label: 'Quick add',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    prompts: [{ id: 'quick-p1', text: 'Who do you know?' }],
  },
]);

/**
 * Parses clean but can never generate: four people must each hold a distinct
 * value of a two-valued unique boolean.
 */
const CONFLICTED_DOCUMENT = documentWithStages([
  {
    id: 'ng',
    type: 'NameGenerator',
    label: 'Name generator',
    subject: { entity: 'node', type: 'person' },
    form: {
      title: 'About them',
      fields: [{ variable: 'close', prompt: 'Close to you?' }],
    },
    synthetic: {
      generatesData: true,
      count: { distribution: 'constant', value: 4 },
    },
    prompts: [{ id: 'ng-p1', text: 'Who do you know?' }],
  },
]);

/** A mid-edit draft: does not parse at all. */
const INVALID_DOCUMENT = {
  schemaVersion: 8,
} as unknown as VersionedProtocolDocument;

const renderFeasibility = (document: VersionedProtocolDocument | null) =>
  renderHook(
    (props: { document: VersionedProtocolDocument | null }) =>
      useSyntheticFeasibility({
        document: props.document,
        protocolId: null,
        debounceMs: DEBOUNCE,
      }),
    { initialProps: { document } },
  );

const settle = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('statuses', () => {
  it('reports checking until the debounced analysis lands, then feasible', async () => {
    const { result } = renderFeasibility(FEASIBLE_DOCUMENT);

    expect(result.current).toEqual({ status: 'checking', conflicts: [] });

    // One tick short of the debounce: nothing has run.
    await settle(DEBOUNCE - 1);
    expect(result.current.status).toBe('checking');

    await settle(1);
    expect(result.current).toEqual({ status: 'feasible', conflicts: [] });
  });

  it('reports the engine conflicts verbatim for an infeasible draft', async () => {
    const { result } = renderFeasibility(CONFLICTED_DOCUMENT);
    await settle(DEBOUNCE);

    expect(result.current.status).toBe('conflicts');
    // Verbatim the engine's own analysis of the same parsed document — the
    // hook adds and rewords nothing.
    expect(result.current.conflicts).toEqual(
      analyseSyntheticFeasibility(
        CurrentProtocolSchema.parse(CONFLICTED_DOCUMENT),
      ),
    );
    expect(result.current.conflicts).toHaveLength(1);
    expect(result.current.conflicts[0]?.rules).toEqual(['unique']);
  });

  it('reports a draft that does not parse as invalid, carrying nothing', async () => {
    const { result } = renderFeasibility(INVALID_DOCUMENT);
    await settle(DEBOUNCE);

    expect(result.current).toEqual({ status: 'invalid', conflicts: [] });
  });

  it('reports invalid immediately when there is no document to analyse', () => {
    const { result } = renderFeasibility(null);

    expect(result.current).toEqual({ status: 'invalid', conflicts: [] });
  });
});

describe('debounce', () => {
  it('coalesces edits inside the window into one run of the newest draft', async () => {
    const { result, rerender } = renderFeasibility(CONFLICTED_DOCUMENT);

    // An edit lands before the first draft's debounce elapses: its timer is
    // cancelled, so the conflicted draft is never analysed at all.
    await settle(DEBOUNCE - 100);
    rerender({ document: FEASIBLE_DOCUMENT });

    // The clock restarts for the new draft.
    await settle(DEBOUNCE - 1);
    expect(result.current.status).toBe('checking');

    await settle(1);
    expect(result.current.status).toBe('feasible');
  });
});

describe('supersession', () => {
  it('discards an in-flight result once a newer edit has superseded it', async () => {
    const { result, rerender } = renderFeasibility(CONFLICTED_DOCUMENT);

    // Fire the debounce timer WITHOUT flushing microtasks: the conflicted
    // draft's analysis is now genuinely in flight.
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE);
    });

    // A newer edit supersedes it; the null draft resolves synchronously.
    rerender({ document: null });
    expect(result.current.status).toBe('invalid');

    // Let the in-flight analysis finish. Its verdict (conflicts) must be
    // discarded: without the supersession token this would overwrite the
    // newer state with the stale one.
    await settle(DEBOUNCE);
    expect(result.current).toEqual({ status: 'invalid', conflicts: [] });
  });

  it('never publishes a superseded verdict, even transiently', async () => {
    // The unparseable draft's continuation reaches the publication point
    // directly (no analysis to early-out of), so this pins the final guard
    // itself: while the newer draft is still debouncing, the stale verdict
    // must not flicker in underneath it.
    const { result, rerender } = renderFeasibility(INVALID_DOCUMENT);

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE);
    });

    // Superseded while in flight; the new draft is now debouncing.
    rerender({ document: FEASIBLE_DOCUMENT });
    expect(result.current.status).toBe('checking');

    // Flush only microtasks (no timer advance): the stale continuation
    // completes while the new draft's debounce is still pending. Publishing
    // it would show 'invalid' here.
    await settle(0);
    expect(result.current.status).toBe('checking');

    await settle(DEBOUNCE);
    expect(result.current.status).toBe('feasible');
  });
});
