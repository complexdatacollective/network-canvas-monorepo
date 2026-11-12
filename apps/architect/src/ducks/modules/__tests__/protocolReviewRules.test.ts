// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Finding,
  ReviewResult,
} from '@codaco/protocol-review-worker/contract';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { timelineActions } from '~/ducks/middleware/timeline';
import {
  actionCreators,
  setActiveProtocol,
  setProtocolTranslation,
} from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId, setProtocolLockState } from '~/ducks/modules/app';
import {
  cancelReview,
  checkFixAvailability,
  decideFinding,
  getProtocolReviewFindings,
  getShareReviewsChoice,
  setShareReviews,
  startReview,
  undoFix,
} from '~/ducks/modules/protocolReview';
import { rootReducer } from '~/ducks/modules/root';
import {
  makeFinding,
  makeProtocol,
  op,
} from '~/protocolReview/__tests__/fixtures';
import type { ReviewOutcome } from '~/protocolReview/reviewClient';
import { keepProtocolReviewOnActiveProtocol } from '~/protocolReview/reviewListener';

/**
 * The slice's halves of the review engine's rules (the engine's own are in
 * `protocolReview/__tests__/reviewRules.test.ts`).
 */

vi.mock('~/analytics', () => ({ posthog: { capture: vi.fn() } }));

const client = vi.hoisted(() => ({ requestReview: vi.fn() }));
vi.mock('~/protocolReview/reviewClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/protocolReview/reviewClient')>()),
  requestReview: client.requestReview,
}));

const makeStore = () => {
  const created = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  keepProtocolReviewOnActiveProtocol(created);
  return created;
};

type Store = ReturnType<typeof makeStore>;

const DEEP = `${'['.repeat(100_000)}${']'.repeat(100_000)}`;

const resultOf = (findings: Finding[]): ReviewResult => ({
  reviewId: crypto.randomUUID(),
  findings,
  quota: { limit: 5, remaining: 4, resetsAt: '2099-01-01T00:00:00.000Z' },
});

let protocolCounter = 0;

/** Opens `protocol` as library row `id` (a fresh one by default), owned here. */
const open = async (
  target: Store,
  protocol: CurrentProtocol = makeProtocol(),
  id = `rules-${(protocolCounter += 1)}`,
) => {
  target.dispatch(setProtocolLockState('owned'));
  target.dispatch(setActiveProtocolId(id));
  target.dispatch(setActiveProtocol(protocol));
  await vi.waitFor(() => {
    expect(target.getState().protocolReview.record?.protocolId).toBe(id);
  });
  return id;
};

/** Opens `protocol` and completes a review that found `findings`. */
const reviewed = async (
  target: Store,
  findings: Finding[],
  protocol: CurrentProtocol = makeProtocol(),
) => {
  const id = await open(target, protocol);
  client.requestReview.mockResolvedValueOnce({
    kind: 'result',
    result: resultOf(findings),
  } satisfies ReviewOutcome);
  expect(await target.dispatch(startReview())).toMatchObject({
    status: 'completed',
  });
  return id;
};

const protocolOf = (target: Store) => {
  const protocol = target.getState().activeProtocol.present;
  if (!protocol) throw new Error('No protocol open');
  return protocol;
};

const findingOf = (target: Store, id: string) => {
  const finding = getProtocolReviewFindings(target.getState()).find(
    (candidate) => candidate.id === id,
  );
  if (!finding) throw new Error(`No finding ${id}`);
  return finding;
};

/** A new store that opens the same library row: what a reload does. */
const reload = async (id: string, protocol: CurrentProtocol) => {
  const reloaded = makeStore();
  await open(reloaded, protocol, id);
  return reloaded;
};

const TITLE = makeFinding('title', [
  op('set', '/stages/welcome/title/en', 'Welcome to our study'),
]);

let store: Store;

beforeEach(() => {
  store = makeStore();
  client.requestReview.mockReset();
});

afterEach(() => {
  store.dispatch(cancelReview());
  vi.restoreAllMocks();
});

describe('A: one finding’s failure never stops the others', () => {
  it('checks every fix even when one breaks what normalisation reads', async () => {
    await reviewed(store, [
      makeFinding('broken', [op('set', '/stages', {})]),
      TITLE,
    ]);
    await expect(store.dispatch(checkFixAvailability())).resolves.toBe(
      undefined,
    );
    expect(findingOf(store, 'broken').availability).toBe('invalid');
    expect(findingOf(store, 'title').availability).toBe('available');
  });

  it('refuses such a fix as invalid rather than throwing', async () => {
    await reviewed(store, [makeFinding('broken', [op('set', '/stages', {})])]);
    await expect(
      store.dispatch(decideFinding('broken', 'fix')),
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
  });

  it('saves a review whose fixes cannot even be recorded', async () => {
    await reviewed(store, [
      makeFinding('deep', [
        { op: 'set', path: '/description', value: DEEP },
        op('set', '/description', 'plain'),
      ]),
      TITLE,
    ]);
    await store.dispatch(checkFixAvailability());
    expect(findingOf(store, 'deep').availability).toBe('invalid');
    expect(findingOf(store, 'title').availability).toBe('available');
  });
});

describe('B: Undo restores exactly what applying the fix changed, or is refused', () => {
  it('restores the wording that normalisation took with a removed stage', async () => {
    const original = makeProtocol();
    const customised: CurrentProtocol = {
      ...original,
      interfaceText: {
        ...original.interfaceText,
        quickAdd: {
          quickAddHint: { en: 'Press Enter to add', fr: 'Entrée pour ajouter' },
        },
      },
    };
    await reviewed(
      store,
      [makeFinding('drop', [op('remove', '/stages/names')])],
      customised,
    );
    await store.dispatch(checkFixAvailability());
    const before = protocolOf(store);
    expect(await store.dispatch(decideFinding('drop', 'fix'))).toEqual({
      ok: true,
    });
    expect(protocolOf(store).interfaceText?.quickAdd).toBeUndefined();
    expect(await store.dispatch(undoFix('drop'))).toEqual({ ok: true });
    expect(protocolOf(store)).toEqual(before);
  });

  it('withdraws Undo once the researcher edits a member the fix inserted', async () => {
    const stage = {
      id: 'added',
      type: 'Information',
      label: { en: 'Added', fr: 'Ajouté' },
      title: { en: 'Added', fr: 'Ajouté' },
      items: [],
    };
    await reviewed(store, [
      makeFinding('add', [op('insert', '/stages/finish', stage)]),
    ]);
    await store.dispatch(checkFixAvailability());
    expect(await store.dispatch(decideFinding('add', 'fix'))).toEqual({
      ok: true,
    });
    expect(findingOf(store, 'add').status).toBe('fixed');

    store.dispatch(
      setProtocolTranslation({
        path: ['stages', 2, 'title'],
        locale: 'en',
        text: 'My own title',
      }),
    );
    expect(findingOf(store, 'add')).toMatchObject({
      status: 'undecided',
      canUndo: false,
    });
    expect(await store.dispatch(undoFix('add'))).toEqual({
      ok: false,
      reason: 'not_fixed',
    });
    expect(protocolOf(store).stages.map((s) => s.id)).toContain('added');
  });

  it('withdraws Undo once the researcher re-creates what the fix removed', async () => {
    await reviewed(store, [
      makeFinding('drop', [
        op('remove', '/codebook/node/person/variables/freq'),
      ]),
    ]);
    await store.dispatch(checkFixAvailability());
    await store.dispatch(decideFinding('drop', 'fix'));
    const person = protocolOf(store).codebook.node?.person;
    if (!person) throw new Error('fixture changed');
    store.dispatch(
      actionCreators.updateProtocol({
        codebook: {
          ...protocolOf(store).codebook,
          node: {
            person: {
              ...person,
              variables: {
                ...person.variables,
                freq: { name: 'freq', type: 'text' },
              },
            },
          },
        },
      }),
    );
    expect(findingOf(store, 'drop').canUndo).toBe(false);
    expect(await store.dispatch(undoFix('drop'))).toEqual({
      ok: false,
      reason: 'not_fixed',
    });
  });

  it('is offered again after the app’s Undo and Redo bring the fix back', async () => {
    await reviewed(store, [TITLE]);
    await store.dispatch(checkFixAvailability());
    await store.dispatch(decideFinding('title', 'fix'));
    store.dispatch(timelineActions.undo());
    expect(findingOf(store, 'title').status).toBe('undecided');
    store.dispatch(timelineActions.redo());
    expect(findingOf(store, 'title').status).toBe('fixed');
  });
});

describe('C: an id-aware path reaches the member with that id, or nothing', () => {
  it('does not fix the stage that took the place of a deleted stage with id 0', async () => {
    const base = makeProtocol();
    const [welcome, ...rest] = base.stages;
    if (!welcome) throw new Error('fixture changed');
    const protocol: CurrentProtocol = {
      ...base,
      stages: [{ ...welcome, id: '0' }, { ...welcome, id: 'second' }, ...rest],
    };
    await reviewed(
      store,
      [makeFinding('zero', [op('set', '/stages/0/title/en', 'Better')])],
      protocol,
    );
    store.dispatch(
      actionCreators.updateProtocol({
        stages: protocolOf(store).stages.filter((stage) => stage.id !== '0'),
      }),
    );
    await store.dispatch(checkFixAvailability());
    expect(findingOf(store, 'zero').availability).toBe('changed');
    expect(await store.dispatch(decideFinding('zero', 'fix'))).toEqual({
      ok: false,
      reason: 'changed',
    });
    expect(protocolOf(store).stages[0]).toMatchObject({
      id: 'second',
      title: { en: 'Hello' },
    });
  });
});

describe('D: the session’s newest record wins until it has been saved', () => {
  const failWrites = () =>
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The disk is full', 'QuotaExceededError');
    });

  it('keeps an opt-out from sharing that could not be saved, and does not share', async () => {
    const id = await reviewed(store, [TITLE]);
    await store.dispatch(setShareReviews(true));
    await store.dispatch(decideFinding('title', 'mine'));

    const writes = failWrites();
    await store.dispatch(setShareReviews(false));
    await store.dispatch(decideFinding('title', 'dismissed'));
    writes.mockRestore();

    const reopened = await reload(id, protocolOf(store));
    expect(getShareReviewsChoice(reopened.getState())).toBe(false);
    expect(findingOf(reopened, 'title').status).toBe('dismissed');

    reopened.dispatch(
      setProtocolTranslation({
        path: ['stages', 0, 'label'],
        locale: 'en',
        text: 'Changed, so a new review may start',
      }),
    );
    client.requestReview.mockResolvedValueOnce({
      kind: 'result',
      result: resultOf([]),
    } satisfies ReviewOutcome);
    await reopened.dispatch(startReview());
    expect(client.requestReview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ share: false }),
      }),
    );
  });
});

describe('E: a finding’s availability is checked whenever it needs it', () => {
  it('after a reload, with nothing on screen to ask', async () => {
    const id = await reviewed(store, [TITLE]);
    const reopened = await reload(id, protocolOf(store));
    await vi.waitFor(() =>
      expect(findingOf(reopened, 'title').availability).toBe('available'),
    );
  });

  it('after a dismissed finding is restored, following a reload', async () => {
    const id = await reviewed(store, [TITLE]);
    await store.dispatch(decideFinding('title', 'dismissed'));
    const reopened = await reload(id, protocolOf(store));
    await reopened.dispatch(decideFinding('title', 'undecided'));
    await vi.waitFor(() =>
      expect(findingOf(reopened, 'title').availability).toBe('available'),
    );
  });

  it('after the protocol changes, with nothing on screen to ask', async () => {
    await reviewed(store, [TITLE]);
    await store.dispatch(checkFixAvailability());
    store.dispatch(
      setProtocolTranslation({
        path: ['stages', 0, 'label'],
        locale: 'en',
        text: 'Another label',
      }),
    );
    expect(findingOf(store, 'title').availability).toBe('checking');
    await vi.waitFor(() =>
      expect(findingOf(store, 'title').availability).toBe('available'),
    );
  });

  it('after a fix the app’s Undo took back', async () => {
    await reviewed(store, [TITLE]);
    await store.dispatch(checkFixAvailability());
    await store.dispatch(decideFinding('title', 'fix'));
    store.dispatch(timelineActions.undo());
    await vi.waitFor(() =>
      expect(findingOf(store, 'title').availability).toBe('available'),
    );
  });
});

describe('F: the preview shows every text change a fix makes', () => {
  it('shows a replaced localized object as its changed translation', async () => {
    await reviewed(store, [
      makeFinding('prompt', [
        op('set', '/stages/names/prompts/p1/text', { en: 'New wording' }),
      ]),
    ]);
    expect(findingOf(store, 'prompt').textEdits).toEqual([
      {
        path: '/stages/names/prompts/p1/text/en',
        now: 'Name people',
        after: 'New wording',
        locale: 'en',
        otherTranslations: ['fr'],
      },
    ]);
  });
});
