import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi } from 'vitest';

import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import * as issues from '~/selectors/issues';
import { BUNDLED_TEMPLATES } from '~/templates';

import {
  fieldProblemsInTable,
  translationFieldName,
} from '../translationDrafts';

vi.mock('~/selectors/issues', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/selectors/issues')>();
  return {
    ...actual,
    getTranslationGroups: vi.fn(actual.getTranslationGroups),
  };
});

const template = BUNDLED_TEMPLATES[0]?.protocol;

describe('the field rules a translation table is checked against', () => {
  // A change rechecks every cell already left, each against the same values:
  // only the first check may read the table's texts.
  it('are worked out once for the values every rechecked cell shares', () => {
    if (!template) throw new Error('No bundled template');
    const store = configureStore({
      reducer: rootReducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });
    store.dispatch(setActiveProtocol(template));
    const state = store.getState();
    const groups = vi.mocked(issues.getTranslationGroups);
    const rows = issues
      .getTranslationGroups(state)
      .flatMap((group) => group.rows);
    expect(rows.length).toBeGreaterThan(2);
    const values = Object.fromEntries(
      rows
        .slice(0, 3)
        .map(({ path }) => [translationFieldName(path, 'en'), 'Changed']),
    );
    groups.mockClear();

    const first = fieldProblemsInTable(state, values);
    const reads = groups.mock.calls.length;
    const again = Array.from({ length: 5 }, () =>
      fieldProblemsInTable(state, values),
    );

    expect(groups.mock.calls.length).toBe(reads);
    for (const problems of again) expect(problems).toBe(first);
  });
});
