import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { StudyContext } from '@codaco/shared-consts';
import { timelineActions } from '~/ducks/middleware/timeline';
import {
  disableProtocolReview,
  enableProtocolReview,
  setActiveProtocol,
  setProtocolReviewStudyContext,
} from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import {
  getIsProtocolReviewEnabled,
  getProtocol,
  getProtocolReviewStudyContext,
  getProtocolReviewStudyDetailsDraft,
} from '~/selectors/protocol';

const makeStore = () =>
  configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

const studyContext: StudyContext = {
  researchQuestions: ['How do students find support?'],
  population: 'First-year students',
  administration: 'self_administered',
};

const protocol = (): CurrentProtocol => ({
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [],
});

describe('the protocol review experiment', () => {
  let store: ReturnType<typeof makeStore>;

  const experiments = () => getProtocol(store.getState())?.experiments;

  beforeEach(() => {
    store = makeStore();
    store.dispatch(setActiveProtocol(protocol()));
  });

  it('is off, with no study details, in a protocol that does not mention it', () => {
    expect(getIsProtocolReviewEnabled(store.getState())).toBe(false);
    expect(getProtocolReviewStudyContext(store.getState())).toBeUndefined();
  });

  it('reads as off when no protocol is open', () => {
    const empty = makeStore();
    expect(getIsProtocolReviewEnabled(empty.getState())).toBe(false);
    expect(getProtocolReviewStudyContext(empty.getState())).toBeUndefined();
  });

  it('turns on by adding an empty protocolReview, and undo turns it off again', () => {
    store.dispatch(enableProtocolReview());

    expect(experiments()).toEqual({ protocolReview: {} });
    expect(getIsProtocolReviewEnabled(store.getState())).toBe(true);
    expect(getProtocolReviewStudyContext(store.getState())).toBeUndefined();

    store.dispatch(timelineActions.undo());

    expect(experiments()).toBeUndefined();
    expect(getIsProtocolReviewEnabled(store.getState())).toBe(false);
  });

  it('keeps the study details when turned on a second time', () => {
    store.dispatch(enableProtocolReview());
    store.dispatch(setProtocolReviewStudyContext(studyContext));
    store.dispatch(enableProtocolReview());

    expect(getProtocolReviewStudyContext(store.getState())).toBeDefined();
  });

  it('saves the study details and undo takes them back', () => {
    store.dispatch(enableProtocolReview());
    store.dispatch(setProtocolReviewStudyContext(studyContext));

    expect(getProtocolReviewStudyContext(store.getState())).toEqual(
      studyContext,
    );
    expect(getIsProtocolReviewEnabled(store.getState())).toBe(true);

    store.dispatch(timelineActions.undo());

    expect(experiments()).toEqual({ protocolReview: {} });
  });

  it('turns off by removing the key and the study details with it, leaving no experiments object', () => {
    store.dispatch(enableProtocolReview());
    store.dispatch(setProtocolReviewStudyContext(studyContext));
    store.dispatch(disableProtocolReview());

    expect(getIsProtocolReviewEnabled(store.getState())).toBe(false);
    expect(getProtocolReviewStudyContext(store.getState())).toBeUndefined();
    expect(getProtocol(store.getState())).not.toHaveProperty('experiments');

    store.dispatch(timelineActions.undo());

    expect(getProtocolReviewStudyContext(store.getState())).toEqual(
      studyContext,
    );
  });

  it('keeps other experiments when turning the review on and off', () => {
    store.dispatch(
      setActiveProtocol({
        ...protocol(),
        // An experiment this build does not know, as a newer one might add.
        experiments: { other: true } as CurrentProtocol['experiments'],
      }),
    );

    store.dispatch(enableProtocolReview());
    expect(experiments()).toEqual({ other: true, protocolReview: {} });

    store.dispatch(disableProtocolReview());
    expect(experiments()).toEqual({ other: true });
  });

  it('returns the same study context and draft until the protocol changes', () => {
    store.dispatch(enableProtocolReview());
    store.dispatch(setProtocolReviewStudyContext(studyContext));
    const first = getProtocolReviewStudyContext(store.getState());
    const firstDraft = getProtocolReviewStudyDetailsDraft(store.getState());

    expect(getProtocolReviewStudyContext(store.getState())).toBe(first);
    expect(getProtocolReviewStudyDetailsDraft(store.getState())).toBe(
      firstDraft,
    );
    expect(firstDraft.population).toBe('First-year students');
  });

  it('reads a protocol whose review holds a different shape as on, without study details, and lets it be overwritten', () => {
    store.dispatch(
      setActiveProtocol({
        ...protocol(),
        experiments: { protocolReview: { studyContext: { questions: 'x' } } },
      }),
    );

    expect(getIsProtocolReviewEnabled(store.getState())).toBe(true);
    expect(getProtocolReviewStudyContext(store.getState())).toBeUndefined();
    expect(getProtocolReviewStudyDetailsDraft(store.getState())).toEqual({
      researchQuestions: [],
      population: '',
      administration: null,
      synopsis: '',
    });

    store.dispatch(setProtocolReviewStudyContext(studyContext));

    expect(getProtocolReviewStudyContext(store.getState())).toEqual(
      studyContext,
    );
  });

  it('keeps content already under the key when the review is enabled again', () => {
    store.dispatch(
      setActiveProtocol({
        ...protocol(),
        experiments: { protocolReview: { somethingElse: [1] } },
      }),
    );
    store.dispatch(enableProtocolReview());

    expect(experiments()).toEqual({ protocolReview: { somethingElse: [1] } });
  });
});
