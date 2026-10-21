import { describe, expect, it } from 'vitest';

import { withoutUnusedBindings } from '../useDynamicValueSite';

const CLOSENESS = {
  path: 'dyad.source.closeness',
  cases: { veryClose: 1, notClose: 'not close' },
};

describe('withoutUnusedBindings', () => {
  it('drops a binding no text uses', () => {
    expect(
      withoutUnusedBindings(
        { label: 'Hi', dynamicValues: { close: CLOSENESS } },
        {},
      ),
    ).toEqual({ label: 'Hi' });
  });

  it('keeps the cases text still shows a version for', () => {
    const stage = {
      prompts: [
        {
          text: {
            'en-US': '{close, select, veryClose {Close} other {Not}}',
            'es': '{close, select, veryClose {Cerca} other {No}}',
          },
        },
      ],
      dynamicValues: { close: CLOSENESS },
    };
    expect(withoutUnusedBindings(stage, {}).dynamicValues).toEqual({
      close: { path: CLOSENESS.path, cases: { veryClose: 1 } },
    });
  });

  it('drops the cases once only the value itself is shown', () => {
    const stage = {
      title: { 'en-US': 'You are {close}' },
      body: {
        'en-US': '{close, select, missing {Unknown} other {Known}}',
      },
      dynamicValues: { close: CLOSENESS },
    };
    expect(withoutUnusedBindings(stage, {}).dynamicValues).toEqual({
      close: { path: CLOSENESS.path },
    });
  });

  it('keeps every case of a value named in text it cannot read', () => {
    const stage = {
      title: { 'en-US': '{close, selectordinal, other {#}}' },
      dynamicValues: { close: CLOSENESS },
    };
    expect(withoutUnusedBindings(stage, {})).toBe(stage);
  });

  it('leaves a stage whose bindings are all in use as it is', () => {
    const stage = {
      title: {
        'en-US': '{close, select, veryClose {A} notClose {B} other {C}}',
      },
      dynamicValues: { close: CLOSENESS },
    };
    expect(withoutUnusedBindings(stage, {})).toBe(stage);
  });
});
