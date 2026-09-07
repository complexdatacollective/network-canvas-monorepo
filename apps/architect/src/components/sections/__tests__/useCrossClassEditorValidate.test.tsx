import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import type { CrossClassPick } from '~/components/Validations/crossClassPicks';
import { messageFields } from '~/test/messageText';

import {
  useCrossClassEditorValidate,
  type CrossClassEditorValidateConfig,
} from '../useCrossClassEditorValidate';

const VALIDATED_MESSAGE =
  '"Cat" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)';
const UNVALIDATED_MESSAGE =
  '"Other" is written without validation by another stage, so it cannot be used as a form field';

// `cat` is collected by a form (a VALIDATED use) AND written by a bin
// (UNVALIDATED); `other` is written without validation by a Family Pedigree
// slot. Two variables, opposite claims, so a gate that checks the wrong
// direction is visible rather than merely silent.
const PROTOCOL = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          cat: {
            name: 'Cat',
            type: 'categorical',
            options: [
              { label: 'A', value: 'a' },
              { label: 'B', value: 'b' },
            ],
          },
          other: { name: 'Other', type: 'text' },
        },
      },
      // A DIFFERENT node type carrying an identically named variable. The
      // role map is subject-scoped, so nothing here may leak into `person`'s
      // answers.
      place: {
        name: 'Place',
        color: 'c',
        variables: {
          cat: { name: 'Place Cat', type: 'categorical' },
        },
      },
    },
    edge: {
      friend: {
        name: 'Friend',
        color: 'c',
        variables: { strength: { name: 'Strength', type: 'ordinal' } },
      },
      rival: {
        name: 'Rival',
        color: 'c',
        variables: { strength: { name: 'Rival Strength', type: 'ordinal' } },
      },
    },
  },
  stages: [
    {
      id: 's1',
      type: 'AlterForm',
      label: 'F',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'T', text: 'X' },
      form: { fields: [{ variable: 'cat', prompt: 'P' }] },
    },
    {
      id: 's2',
      type: 'CategoricalBin',
      label: 'B',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'T', variable: 'cat' }],
    },
    {
      id: 's3',
      type: 'FamilyPedigree',
      label: 'P',
      nodeConfig: { type: 'person', relationshipVariable: 'other' },
    },
    {
      id: 's4',
      type: 'AlterEdgeForm',
      label: 'EF',
      subject: { entity: 'edge', type: 'friend' },
      introductionPanel: { title: 'T', text: 'X' },
      form: { fields: [{ variable: 'strength', prompt: 'P' }] },
    },
  ],
};

const renderValidate = (
  config: CrossClassEditorValidateConfig,
  protocol: unknown = PROTOCOL,
) => {
  const store = configureStore({
    reducer: { activeProtocol: (state = { present: protocol }) => state },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const { result } = renderHook(() => useCrossClassEditorValidate(config), {
    wrapper,
  });
  return result.current;
};

const NODE_SUBJECT = { entity: 'node' as const, type: 'person' };

const BIN_PICKS = [
  { path: 'variable', writerClass: 'unvalidated' },
  { path: 'otherVariable', writerClass: 'validated' },
] as const satisfies readonly CrossClassPick[];

describe('useCrossClassEditorValidate', () => {
  it('refuses an UNVALIDATED writer’s pick that a form elsewhere collects', () => {
    const validate = renderValidate({
      picks: BIN_PICKS,
      subjectForRow: () => NODE_SUBJECT,
    });
    expect(messageFields(validate({ variable: 'cat' }))).toEqual({
      variable: VALIDATED_MESSAGE,
    });
  });

  // The escape the deleted `_originalVariable` marker fields used to carry:
  // re-saving a prompt whose pick this edit did not touch must not be
  // refused for a conflict the edit did not introduce.
  it('escapes when the pick equals the row the dialog opened on', () => {
    const validate = renderValidate({
      picks: BIN_PICKS,
      subjectForRow: () => NODE_SUBJECT,
    });
    expect(
      messageFields(
        validate({ variable: 'cat' }, { initialValues: { variable: 'cat' } }),
      ),
    ).toBeUndefined();
  });

  it('still refuses when the row opened on a DIFFERENT pick', () => {
    const validate = renderValidate({
      picks: BIN_PICKS,
      subjectForRow: () => NODE_SUBJECT,
    });
    expect(
      messageFields(
        validate({ variable: 'cat' }, { initialValues: { variable: 'other' } }),
      ),
    ).toEqual({ variable: VALIDATED_MESSAGE });
  });

  // The mirror direction, which no `hasValidatedUse`-only helper could
  // express: `other` has an UNVALIDATED use, and only the VALIDATED pick
  // rejects it.
  it('refuses a VALIDATED writer’s pick that a bin elsewhere writes, with the mirror message', () => {
    const validate = renderValidate({
      picks: BIN_PICKS,
      subjectForRow: () => NODE_SUBJECT,
    });
    expect(
      messageFields(validate({ variable: 'group', otherVariable: 'other' })),
    ).toEqual({
      otherVariable: UNVALIDATED_MESSAGE,
    });
  });

  it('does not apply the unvalidated gate to a validated pick, or the reverse', () => {
    const validate = renderValidate({
      picks: BIN_PICKS,
      subjectForRow: () => NODE_SUBJECT,
    });
    // `other` in the UNVALIDATED slot has no VALIDATED use; `cat` in the
    // VALIDATED slot has an UNVALIDATED one — so swapping the classes would
    // report the opposite pair of errors.
    expect(
      messageFields(validate({ variable: 'other', otherVariable: 'cat' })),
    ).toEqual({
      otherVariable:
        '"Cat" is written without validation by another stage, so it cannot be used as a form field',
    });
  });

  it('reports every offending pick at once, keyed by its own field path', () => {
    const validate = renderValidate({
      picks: BIN_PICKS,
      subjectForRow: () => NODE_SUBJECT,
    });
    expect(
      messageFields(validate({ variable: 'cat', otherVariable: 'other' })),
    ).toEqual({
      variable: VALIDATED_MESSAGE,
      otherVariable: UNVALIDATED_MESSAGE,
    });
  });

  it('scopes the lookup to the row’s subject, so an identically named variable on another type is not a conflict', () => {
    const validate = renderValidate({
      picks: [{ path: 'variable', writerClass: 'unvalidated' }],
      subjectForRow: () => ({ entity: 'node', type: 'place' }),
    });
    expect(messageFields(validate({ variable: 'cat' }))).toBeUndefined();
  });

  it('reads the subject from the ROW, not from mount, for an editor that picks its own type', () => {
    const validate = renderValidate({
      picks: [{ path: 'edgeVariable', writerClass: 'unvalidated' }],
      subjectForRow: (row) => ({
        entity: 'edge',
        type: typeof row.createEdge === 'string' ? row.createEdge : '',
      }),
    });
    expect(
      messageFields(
        validate({ createEdge: 'friend', edgeVariable: 'strength' }),
      ),
    ).toEqual({
      edgeVariable:
        '"Strength" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
    });
    // Same variable id, different edge type: no form collects it there.
    expect(
      messageFields(
        validate({ createEdge: 'rival', edgeVariable: 'strength' }),
      ),
    ).toBeUndefined();
  });

  it('reads a nested pick at its dotted path and keys the refusal there', () => {
    const validate = renderValidate({
      picks: [{ path: 'highlight.variable', writerClass: 'unvalidated' }],
      subjectForRow: () => NODE_SUBJECT,
    });
    expect(messageFields(validate({ highlight: { variable: 'cat' } }))).toEqual(
      {
        'highlight.variable': VALIDATED_MESSAGE,
      },
    );
    expect(
      messageFields(
        validate(
          { highlight: { variable: 'cat' } },
          { initialValues: { highlight: { variable: 'cat' } } },
        ),
      ),
    ).toBeUndefined();
  });

  it('skips the gate entirely while the stage has no subject', () => {
    const validate = renderValidate({
      picks: BIN_PICKS,
      subjectForRow: () => null,
    });
    expect(messageFields(validate({ variable: 'cat' }))).toBeUndefined();
  });

  it('passes an absent pick, which the merged row either keeps unchanged or deletes', () => {
    const validate = renderValidate({
      picks: BIN_PICKS,
      subjectForRow: () => NODE_SUBJECT,
    });
    expect(messageFields(validate({}))).toBeUndefined();
  });

  it('reads the store at validate time, not at mount', () => {
    const store = configureStore({
      reducer: {
        activeProtocol: (
          state: { present: unknown } = { present: { schemaVersion: 8 } },
          action: { type: string; payload?: unknown },
        ) =>
          action.type === 'set'
            ? { present: action.payload }
            : (state as never),
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const { result } = renderHook(
      () =>
        useCrossClassEditorValidate({
          picks: BIN_PICKS,
          subjectForRow: () => NODE_SUBJECT,
        }),
      { wrapper },
    );
    // Nothing in the store yet: no conflict is knowable.
    expect(messageFields(result.current({ variable: 'cat' }))).toBeUndefined();
    store.dispatch({ type: 'set', payload: PROTOCOL });
    expect(messageFields(result.current({ variable: 'cat' }))).toEqual({
      variable: VALIDATED_MESSAGE,
    });
  });
});
