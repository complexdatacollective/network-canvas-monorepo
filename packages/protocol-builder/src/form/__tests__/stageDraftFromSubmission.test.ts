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
      mountedPaths: [],
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
      mountedPaths: [],
      dormantFields: [{ name: 'title', path: ['title'], value: 'New title' }],
    });

    expect(draft.title).toBe('New title');
  });

  it('removes a discarded field rather than blanking it', () => {
    const draft = stageDraftFromSubmission({
      currentFields: { label: 'Friends', interviewScript: 'Read this aloud' },
      submittedValues: { label: 'Friends' },
      mountedPaths: [],
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
      mountedPaths: [],
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
      mountedPaths: [],
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
      mountedPaths: [],
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
      mountedPaths: [],
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
      mountedPaths: [],
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
      mountedPaths: [],
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

  it('lets a field still on screen outrank the container hiding around it', () => {
    const draft = stageDraftFromSubmission({
      currentFields: { parameters: { bounds: { min: 1 }, style: 'plain' } },
      // The mounted leaf's current edit, as the form assembled it.
      submittedValues: { parameters: { bounds: { min: 9 } } },
      mountedPaths: [['parameters', 'bounds', 'min']],
      dormantFields: [
        {
          name: 'parameters',
          path: ['parameters'],
          value: { bounds: { min: 1 }, style: 'plain' },
        },
      ],
    });

    // Replaying the container the researcher last saw would put the stale
    // reading of a field they can still see back over what it now holds.
    expect(draft.parameters).toEqual({ bounds: { min: 9 } });
  });

  it('leaves an emptied row in place rather than punching a hole in the list', () => {
    const draft = stageDraftFromSubmission({
      currentFields: { items: [{ optionalSetting: 'on' }, { id: 'second' }] },
      submittedValues: {},
      mountedPaths: [],
      dormantFields: [
        {
          name: 'items[0].optionalSetting',
          path: ['items', 0, 'optionalSetting'],
          value: undefined,
        },
      ],
    });

    // Removing an array index leaves an `undefined` hole rather than closing
    // the gap, so an emptied row must survive as an empty row. Taking a row
    // out is a deliberate array operation, not a side effect of clearing one
    // of its settings.
    expect(draft.items).toEqual([{}, { id: 'second' }]);
  });

  it('does not write through into the draft it was given', () => {
    const currentFields = Object.freeze({
      label: 'Friends',
      mapOptions: Object.freeze({ center: [0, 0] }),
    });

    const draft = stageDraftFromSubmission({
      currentFields,
      submittedValues: {},
      mountedPaths: [],
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
      mountedPaths: [],
      dormantFields: [{ name: '__proto__.polluted', value: 'yes' }],
    });

    expect(draft).toEqual({ label: 'Friends' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
