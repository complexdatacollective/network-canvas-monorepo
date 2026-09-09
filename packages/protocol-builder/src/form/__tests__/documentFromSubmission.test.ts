import { describe, expect, it } from 'vitest';

import { documentFromSubmission } from '../documentFromSubmission.ts';

describe('documentFromSubmission', () => {
  it('keeps values the editor never rendered', () => {
    const draft = documentFromSubmission({
      currentFields: {
        label: 'Friends',
        skipLogic: { action: 'SKIP', filter: { rules: [], join: 'OR' } },
      },
      submittedValues: { label: 'Close friends' },
      mountedPaths: [['label']],
      dormantFields: [],
    });

    expect(draft).toEqual({
      label: 'Close friends',
      skipLogic: { action: 'SKIP', filter: { rules: [], join: 'OR' } },
    });
  });

  it('writes back a value hidden behind a collapsed group', () => {
    const draft = documentFromSubmission({
      currentFields: { label: 'Friends', title: 'Old title' },
      submittedValues: { label: 'Friends' },
      mountedPaths: [],
      dormantFields: [{ name: 'title', path: ['title'], value: 'New title' }],
    });

    expect(draft.title).toBe('New title');
  });

  it('removes a discarded field rather than blanking it', () => {
    const draft = documentFromSubmission({
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

  it('removes a field emptied on screen rather than blanking it', () => {
    const draft = documentFromSubmission({
      currentFields: { label: 'Friends', interviewScript: 'Read this aloud' },
      // What a cleared fresco-ui text input submits.
      submittedValues: { label: 'Friends', interviewScript: '' },
      mountedPaths: [['label'], ['interviewScript']],
      dormantFields: [],
    });

    expect(draft).toEqual({ label: 'Friends' });
  });

  it('removes a field emptied and then hidden rather than replaying the blank', () => {
    const draft = documentFromSubmission({
      currentFields: { label: 'Friends', interviewScript: 'Read this aloud' },
      submittedValues: { label: 'Friends' },
      mountedPaths: [['label']],
      // Emptied on screen and then hidden when its group collapsed. The store
      // parks what the control held, which is the empty string rather than
      // the `undefined` a discard leaves.
      dormantFields: [
        { name: 'interviewScript', path: ['interviewScript'], value: '' },
      ],
    });

    expect(draft).toEqual({ label: 'Friends' });
  });

  it('drops the parts of a compound value that hold nothing', () => {
    const draft = documentFromSubmission({
      currentFields: { edges: { create: 'knows', display: ['knows'] } },
      // One control registered at `edges` carries the whole pair, and the
      // researcher has cleared the half of it that picks what to display.
      submittedValues: { edges: { create: 'knows', display: null } },
      mountedPaths: [['edges']],
      dormantFields: [],
    });

    expect(draft.edges).toEqual({ create: 'knows' });
  });

  it('keeps a row whose every setting was cleared', () => {
    const draft = documentFromSubmission({
      currentFields: { items: [{ optionalSetting: 'on' }, { id: 'second' }] },
      submittedValues: {},
      mountedPaths: [],
      // One control registered at the row itself, parked holding the object
      // the clear emptied.
      dormantFields: [{ name: 'items[0]', path: ['items', 0], value: {} }],
    });

    // A row is a position in a list rather than a value the stage may simply
    // not have: removing the index would punch a hole in the list, and taking
    // a row out is the list editor's operation to make.
    expect(draft.items).toEqual([{}, { id: 'second' }]);
  });

  it('keeps a list the researcher emptied', () => {
    const draft = documentFromSubmission({
      currentFields: { prompts: [{ id: 'a' }] },
      submittedValues: { prompts: [] },
      mountedPaths: [['prompts']],
      dormantFields: [],
    });

    // Whether an emptied list means "no list" belongs to the field that owns
    // it, which says so by handing back `undefined`. An empty array reaching
    // here is a list, and the schema rule about it is the owner's to state.
    expect(draft.prompts).toEqual([]);
  });

  it('removes a container its last discarded member emptied', () => {
    const draft = documentFromSubmission({
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
    const draft = documentFromSubmission({
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
    const draft = documentFromSubmission({
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

  it('replaces the value at a mounted path outright rather than merging into it', () => {
    const draft = documentFromSubmission({
      currentFields: { prompts: [{ id: 'a' }, { id: 'b' }] },
      submittedValues: { prompts: [{ id: 'b' }] },
      mountedPaths: [['prompts']],
      dormantFields: [],
    });

    // The field is registered at `prompts` itself, so what it holds is the
    // whole list. Merging into the old one would resurrect the deleted row.
    expect(draft.prompts).toEqual([{ id: 'b' }]);
  });

  it('leaves the rest of a key alone when a section owns one path inside it', () => {
    const draft = documentFromSubmission({
      currentFields: {
        nodeConfig: { type: 'family_member', form: [{ variable: 'fm_name' }] },
      },
      // What the form assembles when the only section pointed inside
      // `nodeConfig` is the one owning the form.
      submittedValues: { nodeConfig: { form: [{ variable: 'fm_age' }] } },
      mountedPaths: [['nodeConfig', 'form']],
      dormantFields: [],
    });

    // `nodeConfig.type` is nobody's field here, and a save that dropped it
    // would leave the pedigree with no node type — the same loss as deleting a
    // top-level key no section renders, one level down.
    expect(draft.nodeConfig).toEqual({
      type: 'family_member',
      form: [{ variable: 'fm_age' }],
    });
  });

  it('lets a nested hidden field win over the container it sits in', () => {
    const draft = documentFromSubmission({
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

  it('removes a switched-off capability along with everything inside it', () => {
    const draft = documentFromSubmission({
      currentFields: {
        skipLogic: { action: 'SKIP', filter: { rules: [], join: 'OR' } },
      },
      submittedValues: {},
      mountedPaths: [],
      // What clearing a capability leaves behind: the container and every
      // path beneath it, all emptied together.
      dormantFields: [
        {
          name: 'skipLogic.action',
          path: ['skipLogic', 'action'],
          value: undefined,
        },
        { name: 'skipLogic', path: ['skipLogic'], value: undefined },
      ],
    });

    expect(Object.hasOwn(draft, 'skipLogic')).toBe(false);
  });

  it('keeps what was entered inside a capability after it was switched off', () => {
    const draft = documentFromSubmission({
      currentFields: {},
      submittedValues: {},
      // Nothing is mounted: the controls were hidden again before saving.
      mountedPaths: [],
      dormantFields: [
        // The tombstone the switch-off left at the container…
        { name: 'skipLogic', path: ['skipLogic'], value: undefined },
        // …and what the researcher typed after switching it back on. Clearing
        // a capability empties everything beneath it, so a descendant still
        // holding a value can only have been written since.
        {
          name: 'skipLogic.action',
          path: ['skipLogic', 'action'],
          value: 'SHOW',
        },
      ],
    });

    expect(draft.skipLogic).toEqual({ action: 'SHOW' });
  });

  it('lets a field still on screen outrank the container hiding around it', () => {
    const draft = documentFromSubmission({
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
    // reading of a field they can still see back over what it now holds. What
    // nothing on screen edits stays as the draft has it: `style` is not part
    // of this submit, and the container's stale copy is not evidence about it.
    expect(draft.parameters).toEqual({ bounds: { min: 9 }, style: 'plain' });
  });

  it('leaves an emptied row in place rather than punching a hole in the list', () => {
    const draft = documentFromSubmission({
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

  it('leaves a row whose every setting cleaned down to nothing', () => {
    const draft = documentFromSubmission({
      currentFields: { items: [{ label: 'Old', size: 3 }, { id: 'second' }] },
      // The row's own control, holding every spelling of emptiness a form
      // produces: text the researcher blanked back to its spaces, and a number
      // input mid-entry.
      submittedValues: { items: [{ label: '  ', size: Number.NaN }] },
      mountedPaths: [['items', 0]],
      dormantFields: [],
    });

    // The settings go, because that is what the form says they hold. The ROW
    // stays: removing an array index punches a hole in the list, and taking a
    // row out is the list editor's own operation.
    expect(draft.items).toEqual([{}, { id: 'second' }]);
  });

  it('keeps a capability the researcher switched off and then reopened', () => {
    const draft = documentFromSubmission({
      currentFields: {},
      // Its controls are back on screen, holding what has been typed since.
      submittedValues: { skipLogic: { action: 'SHOW' } },
      mountedPaths: [['skipLogic', 'action']],
      // The tombstone the switch-off left behind, still parked at the
      // container because nothing remounted under that exact name.
      dormantFields: [
        { name: 'skipLogic', path: ['skipLogic'], value: undefined },
      ],
    });

    expect(draft.skipLogic).toEqual({ action: 'SHOW' });
  });

  it('keeps a capability re-entered through a control that owns its parent', () => {
    const draft = documentFromSubmission({
      currentFields: {},
      // One compound control registered at `settings` carries the value that
      // sits at `settings.enabled`; no field of its own is registered there.
      submittedValues: { settings: { enabled: true } },
      mountedPaths: [['settings']],
      // The tombstone left when the capability was switched off earlier.
      dormantFields: [
        {
          name: 'settings.enabled',
          path: ['settings', 'enabled'],
          value: undefined,
        },
      ],
    });

    expect(draft.settings).toEqual({ enabled: true });
  });

  it('still clears a capability its mounted parent no longer carries', () => {
    const draft = documentFromSubmission({
      currentFields: { settings: { enabled: true, other: 'kept' } },
      // The parent is mounted and no longer holds the cleared path.
      submittedValues: { settings: { other: 'kept' } },
      mountedPaths: [['settings']],
      dormantFields: [
        {
          name: 'settings.enabled',
          path: ['settings', 'enabled'],
          value: undefined,
        },
      ],
    });

    expect(draft.settings).toEqual({ other: 'kept' });
  });

  it('removes a container a clear emptied rather than saving it blank', () => {
    const draft = documentFromSubmission({
      currentFields: { settings: { enabled: true } },
      submittedValues: {},
      mountedPaths: [],
      // What clearing `settings.enabled` leaves when the only control holding
      // it was a parked compound field owning `settings`: the tombstone, and
      // the ancestor emptied along with it.
      dormantFields: [
        {
          name: 'settings.enabled',
          path: ['settings', 'enabled'],
          value: undefined,
        },
        { name: 'settings', path: ['settings'], value: undefined },
      ],
    });

    // Not `{ settings: {} }`, which is not "no capability" to the schema.
    expect(Object.hasOwn(draft, 'settings')).toBe(false);
  });

  it('lets a control on screen outrank a hidden field inside it', () => {
    const draft = documentFromSubmission({
      currentFields: { settings: { enabled: 'old' } },
      // The mounted compound control's current value.
      submittedValues: { settings: { enabled: 'shown' } },
      mountedPaths: [['settings']],
      // Parked earlier, from before the control above it was being edited.
      dormantFields: [
        {
          name: 'settings.enabled',
          path: ['settings', 'enabled'],
          value: 'hidden',
        },
      ],
    });

    expect(draft.settings).toEqual({ enabled: 'shown' });
  });

  it('does not write through into the draft it was given', () => {
    const currentFields = Object.freeze({
      label: 'Friends',
      mapOptions: Object.freeze({ center: [0, 0] }),
    });

    const draft = documentFromSubmission({
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
    const draft = documentFromSubmission({
      currentFields: { label: 'Friends' },
      submittedValues: {},
      mountedPaths: [],
      dormantFields: [{ name: '__proto__.polluted', value: 'yes' }],
    });

    expect(draft).toEqual({ label: 'Friends' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
