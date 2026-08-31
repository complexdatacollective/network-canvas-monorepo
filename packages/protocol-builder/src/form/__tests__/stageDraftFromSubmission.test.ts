import { describe, expect, it } from 'vitest';

import { stageDraftFromSubmission } from '../stageDraftFromSubmission.ts';

describe('stageDraftFromSubmission', () => {
  it('keeps values the editor never rendered', () => {
    const draft = stageDraftFromSubmission({
      currentFields: {
        label: 'Friends',
        skipLogic: { action: 'SKIP', filter: { rules: [], join: 'OR' } },
      },
      submittedValues: { label: 'Close friends' },
      dormantFields: [],
    });

    expect(draft).toEqual({
      label: 'Close friends',
      skipLogic: { action: 'SKIP', filter: { rules: [], join: 'OR' } },
    });
  });

  it('writes back a value hidden behind a collapsed group', () => {
    const draft = stageDraftFromSubmission({
      currentFields: { label: 'Friends', title: 'Old title' },
      submittedValues: { label: 'Friends' },
      dormantFields: [{ name: 'title', path: ['title'], value: 'New title' }],
    });

    expect(draft.title).toBe('New title');
  });

  it('removes a discarded field rather than blanking it', () => {
    const draft = stageDraftFromSubmission({
      currentFields: { label: 'Friends', interviewScript: 'Read this aloud' },
      submittedValues: { label: 'Friends' },
      dormantFields: [
        {
          name: 'interviewScript',
          path: ['interviewScript'],
          value: undefined,
        },
      ],
    });

    expect(Object.hasOwn(draft, 'interviewScript')).toBe(false);
    // The distinction the protocol schema cares about: absent, not empty and
    // not null.
    expect(draft).toEqual({ label: 'Friends' });
  });

  it('removes a container its last discarded member emptied', () => {
    const draft = stageDraftFromSubmission({
      currentFields: {
        label: 'Friends',
        skipLogic: {
          action: 'SKIP',
          filter: { rules: [], join: 'OR' },
          destination: { type: 'finish' },
        },
      },
      submittedValues: { label: 'Friends' },
      dormantFields: [
        {
          name: 'skipLogic.action',
          path: ['skipLogic', 'action'],
          value: undefined,
        },
        {
          name: 'skipLogic.filter',
          path: ['skipLogic', 'filter'],
          value: undefined,
        },
        {
          name: 'skipLogic.destination',
          path: ['skipLogic', 'destination'],
          value: undefined,
        },
      ],
    });

    // A `skipLogic: {}` left behind is not "no skip logic" to the schema, it
    // is a skip logic missing its required members.
    expect(Object.hasOwn(draft, 'skipLogic')).toBe(false);
  });

  it('keeps a container that still holds something', () => {
    const draft = stageDraftFromSubmission({
      currentFields: {
        skipLogic: { action: 'SKIP', filter: { rules: [], join: 'OR' } },
      },
      submittedValues: {},
      dormantFields: [
        {
          name: 'skipLogic.destination',
          path: ['skipLogic', 'destination'],
          value: undefined,
        },
      ],
    });

    expect(draft.skipLogic).toEqual({
      action: 'SKIP',
      filter: { rules: [], join: 'OR' },
    });
  });

  it('leaves an object the author left empty exactly as it was', () => {
    const draft = stageDraftFromSubmission({
      currentFields: { behaviours: {}, interviewScript: 'Notes' },
      submittedValues: {},
      dormantFields: [
        {
          name: 'interviewScript',
          path: ['interviewScript'],
          value: undefined,
        },
      ],
    });

    expect(Object.hasOwn(draft, 'behaviours')).toBe(true);
  });

  it('replaces a submitted key outright rather than merging into it', () => {
    const draft = stageDraftFromSubmission({
      currentFields: { prompts: [{ id: 'a' }, { id: 'b' }] },
      submittedValues: { prompts: [{ id: 'b' }] },
      dormantFields: [],
    });

    expect(draft.prompts).toEqual([{ id: 'b' }]);
  });

  it('lets a nested hidden field win over the container it sits in', () => {
    const draft = stageDraftFromSubmission({
      currentFields: { parameters: { bounds: { min: 1 }, style: 'plain' } },
      submittedValues: {},
      // Insertion order puts the descendant first, which is what unmount order
      // produces when the inner group collapses before the outer one.
      dormantFields: [
        {
          name: 'parameters.bounds.min',
          path: ['parameters', 'bounds', 'min'],
          value: 5,
        },
        {
          name: 'parameters',
          path: ['parameters'],
          value: { bounds: { min: 1 }, style: 'plain' },
        },
      ],
    });

    // The more specific field is the one the researcher actually edited, so
    // the container it lives in must not be replayed over the top of it.
    expect(draft.parameters).toEqual({ bounds: { min: 5 }, style: 'plain' });
  });

  it('removes a capability\u2019s paths even when a field inside was parked with a value', () => {
    const draft = stageDraftFromSubmission({
      currentFields: {
        skipLogic: { action: 'SKIP', filter: { rules: [], join: 'OR' } },
      },
      submittedValues: {},
      dormantFields: [
        {
          name: 'skipLogic.action',
          path: ['skipLogic', 'action'],
          value: 'SHOW',
        },
        { name: 'skipLogic', path: ['skipLogic'], value: undefined },
      ],
    });

    expect(Object.hasOwn(draft, 'skipLogic')).toBe(false);
  });

  it('does not write through into the draft it was given', () => {
    const currentFields = Object.freeze({
      label: 'Friends',
      mapOptions: Object.freeze({ center: [0, 0] }),
    });

    const draft = stageDraftFromSubmission({
      currentFields,
      submittedValues: {},
      dormantFields: [
        {
          name: 'mapOptions.style',
          path: ['mapOptions', 'style'],
          value: 'dark',
        },
      ],
    });

    expect(currentFields.mapOptions).toEqual({ center: [0, 0] });
    expect(draft.mapOptions).toEqual({ center: [0, 0], style: 'dark' });
  });

  it('ignores a dormant field whose name cannot address anything', () => {
    const draft = stageDraftFromSubmission({
      currentFields: { label: 'Friends' },
      submittedValues: {},
      dormantFields: [{ name: '__proto__.polluted', value: 'yes' }],
    });

    expect(draft).toEqual({ label: 'Friends' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
