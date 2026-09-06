// The apply engine's addressing: which place in a section document a command
// reaches, and which it refuses to reach. The golden transcript next door
// guards what the operations DO; this guards where they do it.
import { describe, expect, it } from 'vitest';

import {
  ApplyError,
  applyCommand,
  applyCommands,
  commandTarget,
  type SectionDoc,
  targetRoot,
} from '../apply.ts';

/** A Family Pedigree, which keeps its family-member form off its node config. */
const PEDIGREE: SectionDoc = {
  type: 'FamilyPedigree',
  label: 'Your family',
  nodeConfig: {
    type: 'family_member',
    nodeLabelVariable: 'fm_name',
    form: [{ variable: 'fm_name', prompt: 'What is their name?' }],
  },
};

const FORM = ['nodeConfig', 'form'];

const NAME_FIELD = { variable: 'fm_name', prompt: 'What is their name?' };

/** The pedigree with its family-member form replaced, and nothing else moved. */
const pedigreeHolding = (form: readonly unknown[]): SectionDoc => ({
  type: 'FamilyPedigree',
  label: 'Your family',
  nodeConfig: {
    type: 'family_member',
    nodeLabelVariable: 'fm_name',
    form,
  },
});

describe('a command addressed at a nested path', () => {
  it('inserts into the list that path names, and leaves its neighbours', () => {
    const age = { variable: 'fm_age', prompt: 'How old are they?' };

    // Compared as a whole document on purpose: the failure this addresses is
    // a write that lands on `nodeConfig` and takes the type and label variable
    // with it, which an assertion about `form` alone would not see.
    expect(
      applyCommand(PEDIGREE, {
        op: 'insertItem',
        key: FORM,
        index: 1,
        item: age,
      }),
    ).toEqual(pedigreeHolding([NAME_FIELD, age]));
  });

  it('removes and moves the row at that path', () => {
    const age = { variable: 'fm_age' };
    const sex = { variable: 'fm_sex' };
    const three = applyCommands(PEDIGREE, [
      { op: 'insertItem', key: FORM, index: 1, item: age },
      { op: 'insertItem', key: FORM, index: 2, item: sex },
    ]);
    expect(three).toEqual(pedigreeHolding([NAME_FIELD, age, sex]));

    expect(
      applyCommand(three, { op: 'moveItem', key: FORM, from: 2, to: 0 }),
    ).toEqual(pedigreeHolding([sex, NAME_FIELD, age]));

    expect(
      applyCommand(three, { op: 'removeItem', key: FORM, index: 0 }),
    ).toEqual(pedigreeHolding([age, sex]));
  });

  it('sets a nested value without disturbing the ones beside it', () => {
    expect(
      applyCommand(PEDIGREE, {
        op: 'set',
        key: ['nodeConfig', 'nodeLabelVariable'],
        value: 'fm_nickname',
      }),
    ).toEqual({
      type: 'FamilyPedigree',
      label: 'Your family',
      nodeConfig: {
        type: 'family_member',
        nodeLabelVariable: 'fm_nickname',
        form: [NAME_FIELD],
      },
    });
  });

  it('unsets a nested value and leaves the container it emptied', () => {
    // What an empty object means is a question about the document's schema,
    // which this engine does not have. The editor that switched a capability
    // off says so by removing the container itself.
    expect(applyCommand(PEDIGREE, { op: 'unset', key: FORM })).toEqual({
      type: 'FamilyPedigree',
      label: 'Your family',
      nodeConfig: { type: 'family_member', nodeLabelVariable: 'fm_name' },
    });
  });

  it('creates the containers on the way to a value it is asked to write', () => {
    expect(
      applyCommand(
        { type: 'FamilyPedigree' },
        { op: 'insertItem', key: FORM, index: 0, item: NAME_FIELD },
      ),
    ).toEqual({
      type: 'FamilyPedigree',
      nodeConfig: { form: [NAME_FIELD] },
    });
  });

  it('creates nothing on the way to a removal', () => {
    const doc: SectionDoc = { type: 'FamilyPedigree' };
    expect(applyCommand(doc, { op: 'unset', key: FORM })).toEqual(doc);
  });

  it('never writes through into the document it was given', () => {
    const before = structuredClone(PEDIGREE);
    applyCommand(PEDIGREE, {
      op: 'insertItem',
      key: FORM,
      index: 0,
      item: { variable: 'fm_age' },
    });
    expect(PEDIGREE).toEqual(before);
  });
});

describe('a path the engine refuses to follow', () => {
  it('refuses to reach into a list, because a position is not a place', () => {
    // The whole reason segments are object keys: `prompts.0.tags` addresses
    // whichever row has moved into that slot, not the row the editor meant.
    expect(() =>
      applyCommand(
        { prompts: [{ id: 'a', tags: [] }] },
        {
          op: 'insertItem',
          key: ['prompts', '0', 'tags'],
          index: 0,
          item: 'x',
        },
      ),
    ).toThrow(ApplyError);
  });

  it('refuses to replace something that is not a container', () => {
    // Creating the object here would throw away the label the researcher
    // authored, and report nothing.
    expect(() =>
      applyCommand(
        { label: 'Your family' },
        { op: 'set', key: ['label', 'text'], value: 'Hello' },
      ),
    ).toThrow(ApplyError);
  });

  it('refuses a segment that names a prototype', () => {
    for (const segment of ['__proto__', 'constructor', 'prototype']) {
      expect(() =>
        applyCommand({}, { op: 'set', key: ['nodeConfig', segment], value: 1 }),
      ).toThrow(ApplyError);
    }
  });

  it('refuses a path that addresses nothing', () => {
    expect(() => applyCommand({}, { op: 'set', key: [], value: 1 })).toThrow(
      ApplyError,
    );
    expect(() =>
      applyCommand({}, { op: 'set', key: ['nodeConfig', ''], value: 1 }),
    ).toThrow(ApplyError);
  });

  it('still refuses a value that is not a list, and says which', () => {
    expect(() =>
      applyCommand(
        { nodeConfig: { form: 'not a list' } },
        { op: 'removeItem', key: FORM, index: 0 },
      ),
    ).toThrow(/nodeConfig\.form is not a list/);
  });
});

describe('the address a command carries', () => {
  it('spells a top-level list as the bare key it has always been', () => {
    // The compatibility guarantee, stated where it is decided: a consumer that
    // predates nested addressing goes on receiving exactly what it received
    // before, for every command the editors were already able to emit.
    expect(commandTarget(['prompts'])).toBe('prompts');
    expect(commandTarget(['nodeConfig', 'form'])).toEqual([
      'nodeConfig',
      'form',
    ]);
  });

  it('means the same thing in either form', () => {
    const doc: SectionDoc = { prompts: [{ id: 'a' }] };
    const item = { id: 'b' };
    expect(
      applyCommand(doc, { op: 'insertItem', key: 'prompts', index: 1, item }),
    ).toEqual(
      applyCommand(doc, {
        op: 'insertItem',
        key: ['prompts'],
        index: 1,
        item,
      }),
    );
  });

  it('answers the top-level key it touches, whichever form it is in', () => {
    // What the session asks, to decide whether a batch touches a staged
    // resource or the stage identity the session owns.
    expect(targetRoot('prompts')).toBe('prompts');
    expect(targetRoot(FORM)).toBe('nodeConfig');
  });
});
