import { describe, expect, it, vi } from 'vitest';

import { CurrentProtocolSchema } from '@codaco/protocol-validation';

import { createInitialNetwork } from '../src/contract/network';
import type { InterviewPayload, SyncHandler } from '../src/contract/types';
import { addNode } from '../src/store/modules/session';
import { store } from '../src/store/store';

/**
 * The harness every replay-parity test hangs off: the package's real Redux
 * store, created and driven with no DOM at all. Proving it here — rather than
 * inside the first parity test — means a break in the harness reports as a
 * harness failure instead of as a parity mismatch.
 */

const NAME_VARIABLE = 'var-name';
const STAGE_ID = 'stage-people';
const PROMPT_ID = 'prompt-people';

// Parsed rather than written as a literal: the schema brands its attribute and
// entity-type references, so only its own output satisfies `ProtocolPayload`
// without a cast.
const protocol = CurrentProtocolSchema.parse({
  name: 'Store harness',
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          [NAME_VARIABLE]: { name: 'name', type: 'text', component: 'Text' },
        },
      },
    },
  },
  stages: [
    {
      id: STAGE_ID,
      type: 'NameGenerator',
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      form: {
        title: 'Add a person',
        fields: [{ variable: NAME_VARIABLE, prompt: 'Their name' }],
      },
      prompts: [{ id: PROMPT_ID, text: 'Who do you know?' }],
    },
  ],
});

const buildPayload = (): InterviewPayload => {
  const { assetManifest: _assetManifest, ...rest } = protocol;
  const now = new Date('2026-08-20T09:00:00.000Z').toISOString();

  return {
    protocol: {
      ...rest,
      id: 'protocol-1',
      hash: 'harness-hash',
      importedAt: now,
      assets: [],
    },
    session: {
      id: 'session-1',
      startTime: now,
      finishTime: null,
      exportTime: null,
      lastUpdated: now,
      network: createInitialNetwork(),
    },
  };
};

describe('the interview store runs headlessly', () => {
  it('adds a node, refuses an unknown attribute, and syncs', async () => {
    expect(typeof window).toBe('undefined');

    const onSync = vi.fn<SyncHandler>().mockResolvedValue(undefined);
    const interviewStore = store(buildPayload(), { onSync });

    await interviewStore.dispatch(
      addNode({
        type: 'person',
        attributeData: { [NAME_VARIABLE]: 'Alice' },
        currentStep: 0,
      }),
    );

    const [node] = interviewStore.getState().session.network.nodes;
    expect(node).toBeDefined();
    // The store stamps provenance from the step the caller named, which is the
    // whole reason a parity test must drive the real store rather than rebuild
    // its reducers.
    expect(node?.stageId).toBe(STAGE_ID);
    expect(node?.promptIDs).toEqual([PROMPT_ID]);

    const rejected = await interviewStore.dispatch(
      addNode({
        type: 'person',
        attributeData: { 'not-in-the-codebook': 'Bob' },
        currentStep: 0,
      }),
    );

    expect(addNode.rejected.match(rejected)).toBe(true);
    expect(interviewStore.getState().session.network.nodes).toHaveLength(1);
    // Pinned to the offending key: a rejection thrown for any other reason
    // would otherwise satisfy the match above and say nothing.
    if (!addNode.rejected.match(rejected)) return;
    expect(rejected.error.message).toContain('not-in-the-codebook');

    await interviewStore.flushSync();

    expect(onSync).toHaveBeenCalled();
    const lastCall = onSync.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe('session-1');
    expect(lastCall?.[1].network.nodes).toHaveLength(1);
  });
});
