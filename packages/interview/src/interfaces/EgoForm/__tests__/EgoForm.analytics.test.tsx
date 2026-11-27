import { act, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { fieldBlockMarkdown } from '@codaco/protocol-validation';
import { formOf } from '@codaco/protocol-validation/testing';

import { testVariableId } from '../../../__tests__/testIds';
import type { Tracker } from '../../../analytics/tracker';
import type { StageProps } from '../../../types';
import { renderEgoForm } from './renderEgoForm';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class ImmediateIntersectionObserver {
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }

  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
  // jsdom implements no scrolling, and the validation-failure path scrolls the
  // first error into view once the event has been tracked.
  Element.prototype.scrollTo = () => {};
});

const NICKNAME_VARIABLE = testVariableId('nickname');
const BORN_ON_VARIABLE = testVariableId('born_on');

const NOTES_VARIABLE = testVariableId('notes');

const englishForm = formOf(
  [
    {
      id: 'field-1',
      variable: NICKNAME_VARIABLE,
      prompt: { en: 'Your nickname' },
    },
    {
      id: 'field-2',
      variable: BORN_ON_VARIABLE,
      prompt: { en: 'Your date of birth' },
    },
  ],
  { before: '# About you' },
);
// The Spanish document also asks for notes, which the English one does not.
const notesField = {
  id: 'field-3',
  variable: NOTES_VARIABLE,
  prompt: { es: 'Notas' },
};

const stage = {
  id: 'ego-form',
  type: 'EgoForm',
  label: { en: 'About you' },
  form: {
    fields: [...englishForm.fields, notesField],
    content: {
      ...englishForm.content,
      es: `${englishForm.content.en}\n\n${fieldBlockMarkdown(notesField.id)}`,
    },
  },
} as unknown as StageProps<'EgoForm'>['stage'];

const egoVariables = {
  [NICKNAME_VARIABLE]: { name: 'Nickname', type: 'text', component: 'Text' },
  [BORN_ON_VARIABLE]: {
    name: 'Born on',
    type: 'datetime',
    component: 'DatePicker',
    parameters: { type: 'full' },
  },
  [NOTES_VARIABLE]: { name: 'Notes', type: 'text', component: 'TextArea' },
};

const requiredNicknameVariables = {
  ...egoVariables,
  [NICKNAME_VARIABLE]: {
    name: 'Nickname',
    type: 'text',
    component: 'Text',
    validation: { required: true },
  },
};

/** Renders the form, returning the tracker's record of events. */
const renderTrackedEgoForm = (variables = egoVariables) => {
  const track = vi.fn();
  const tracker: Tracker = { track, captureException: vi.fn() };
  const rendered = renderEgoForm({ stage, egoVariables: variables, tracker });
  return { track, ...rendered };
};

// Audit sweep: the shared FormFieldSchema (protocol-validation's
// common/forms.ts) is a strictObject with no `component` key — only
// NetworkComposer fields carry their own control. Testing `'component' in f`
// against a stage field therefore recorded 'unknown' for every field of every
// EgoForm, always. The control comes from the codebook entry, exactly as the
// rendered Field resolves it.
describe('EgoForm analytics', () => {
  it('records the input control of each field that the form asks in the language shown, and no others', async () => {
    const { track } = renderTrackedEgoForm();

    expect(await screen.findByLabelText(/Your nickname/)).toBeInTheDocument();

    const opened = track.mock.calls.find(([name]) => name === 'form_opened');
    expect(opened).toBeDefined();
    expect(opened?.[1]).toMatchObject({
      form_kind: 'ego',
      field_details: ['Text', 'DatePicker'],
    });
  });

  it('records the real input control on form_validation_failed', async () => {
    const { track, moveForward } = renderTrackedEgoForm(
      requiredNicknameVariables,
    );

    expect(await screen.findByLabelText(/Your nickname/)).toHaveValue('');

    await act(async () => {
      await moveForward();
    });

    const failed = track.mock.calls.find(
      ([name]) => name === 'form_validation_failed',
    );
    expect(failed).toBeDefined();
    expect(failed?.[1]).toMatchObject({
      form_kind: 'ego',
      field_errors: [
        expect.objectContaining({ field_index: 0, component: 'Text' }),
      ],
    });
  });
});
