/**
 * The containers a stage document may only hold ONE shape of.
 *
 * A sociogram's background is an image or a number of concentric circles, and
 * a document holding both is one `imageOrCirclesBackgroundSchema` refuses. The
 * draft diff addresses a change at the deepest place the difference actually
 * is, which for every other container is exactly right: a sibling nobody
 * touched is left alone. For a container whose members are mutually exclusive
 * that granularity is what MAKES the hybrid — a `set` of `background.image`
 * leaves whatever the other variant wrote under `background` in place — so the
 * variant travels whole.
 *
 * Which containers those are is read off the protocol schemas themselves; see
 * `exclusive-variant-containers.ts` in `@codaco/protocol-validation`.
 */
import { describe, expect, it } from 'vitest';

import { imageOrCirclesBackgroundSchema } from '@codaco/protocol-validation';
import { applyCommands, type SectionDoc } from '@codaco/studio-sync/apply';

import { commandsFromDraftChange } from '../stageDocument.ts';

/** What the schema says about the background a batch produced. */
const backgroundIsValid = (fields: SectionDoc): boolean =>
  imageOrCirclesBackgroundSchema.safeParse(fields.background).success;

describe('an edit inside a container the schema allows one variant of', () => {
  it('writes the whole background rather than the leaf that changed', () => {
    const before: SectionDoc = {
      label: 'Where they live',
      background: { image: 'streets.png' },
    };
    const after: SectionDoc = {
      label: 'Where they live',
      background: { image: 'streets-2026.png' },
    };

    expect(commandsFromDraftChange(before, after)).toEqual([
      { op: 'set', key: 'background', value: { image: 'streets-2026.png' } },
    ]);
  });

  it('carries a switch between variants whole, leaving no hybrid behind', () => {
    const before: SectionDoc = {
      label: 'Where they live',
      background: { image: 'streets.png' },
    };
    const after: SectionDoc = {
      label: 'Where they live',
      background: { concentricCircles: 4 },
    };

    const commands = commandsFromDraftChange(before, after);
    expect(commands).toEqual([
      { op: 'set', key: 'background', value: { concentricCircles: 4 } },
    ]);
    // Said by the schema rather than by the shape above: a `set` of
    // `background.concentricCircles` would leave the image beside it, and a
    // background holding both is one the protocol refuses.
    const applied = applyCommands(before, commands);
    expect(applied.background).toEqual({ concentricCircles: 4 });
    expect(backgroundIsValid(applied)).toBe(true);
  });

  it('writes a variant the draft is creating whole', () => {
    const before: SectionDoc = { label: 'Where they live' };
    const after: SectionDoc = {
      label: 'Where they live',
      background: { image: 'streets.png' },
    };

    // A container the draft is CREATING is diffed against an empty one, so
    // that a sibling written under the same container survives — which is
    // right for every container but this one, where the members are rival
    // answers to the same question rather than siblings.
    expect(commandsFromDraftChange(before, after)).toEqual([
      { op: 'set', key: 'background', value: { image: 'streets.png' } },
    ]);
  });

  /**
   * The rule reaches the variant and stops there.
   *
   * `skipLogic` is an ordinary container — an action, a filter, and a
   * destination — and only the destination is a choice between shapes. An edit
   * to the destination writes the destination whole; an edit beside it is
   * addressed where it always was, so a member of the container the researcher
   * said nothing about is not written over.
   */
  it('leaves the container above the variant addressed leaf by leaf', () => {
    const filter = { join: 'AND', rules: [] };
    const before: SectionDoc = {
      label: 'Where they live',
      skipLogic: {
        action: 'SKIP',
        filter,
        destination: { type: 'stage', stageId: 'stage-4' },
      },
    };
    const after: SectionDoc = {
      label: 'Where they live',
      skipLogic: { action: 'SHOW', filter, destination: { type: 'finish' } },
    };

    expect(commandsFromDraftChange(before, after)).toEqual([
      { op: 'set', key: ['skipLogic', 'action'], value: 'SHOW' },
      {
        op: 'set',
        key: ['skipLogic', 'destination'],
        value: { type: 'finish' },
      },
    ]);
  });
});
