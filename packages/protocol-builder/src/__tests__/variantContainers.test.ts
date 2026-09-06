/**
 * The containers a stage document may only hold ONE shape of.
 *
 * A sociogram's background is an image or a number of concentric circles, and
 * a document holding both is one `imageOrCirclesBackgroundSchema` refuses —
 * so it is a document the researcher cannot save, and one neither of the two
 * people editing the stage asked for. The draft diff addresses a change at the
 * deepest place the difference actually is, which for every other container is
 * exactly right: a sibling nobody touched is left alone, and two researchers
 * configuring different parts of one capability both keep their work. For a
 * container whose members are mutually exclusive it is what MAKES the hybrid:
 * a `set` of `background.image`, replayed after a collaborator switched the
 * stage to concentric circles, leaves both members set.
 *
 * So the variant travels whole, and a collaborator's switch conflicts with it
 * at the container: the later write wins, entire. Which containers those are
 * is read off the protocol schemas themselves — see
 * `exclusive-variant-containers.ts` in `@codaco/protocol-validation`.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  imageOrCirclesBackgroundSchema,
  sociogramPromptSchema,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  commandsFromDraftChange,
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../session.ts';

const revision = (sequence: bigint) => ({
  sequence,
  hash: `revision-${String(sequence)}`,
});

function openSession(fields: SectionDoc) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Sociogram', () => 'stage-1'),
    fields,
    protocolSections: {},
    manifestRevision: revision(1n),
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'p',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
    onCommands: vi.fn(),
  });
}

/** One form submit: the diff between the draft and what the researcher left. */
function edit(session: ProtocolBuilderSessionStore, next: SectionDoc) {
  session.dispatch(
    commandsFromDraftChange(session.getSnapshot().editedSection.fields, next),
  );
}

const arrives = (session: ProtocolBuilderSessionStore, fields: SectionDoc) => {
  session.acknowledge({
    fields,
    throughBatchId: 0,
    manifestRevision: revision(2n),
  });
};

const backgroundOf = (session: ProtocolBuilderSessionStore): unknown =>
  session.getSnapshot().editedSection.fields.background;

/** What the schema itself says about the background a merge produced. */
const backgroundIsValid = (session: ProtocolBuilderSessionStore): boolean =>
  imageOrCirclesBackgroundSchema.safeParse(backgroundOf(session)).success;

const commandsOf = (session: ProtocolBuilderSessionStore) =>
  session.getSnapshot().pendingCommands.flatMap((batch) => batch.commands);

describe('an edit inside a container the schema allows one variant of', () => {
  it('writes the whole background, so a collaborator’s switch cannot leave a hybrid', () => {
    const session = openSession({
      label: 'Where they live',
      background: { image: 'streets.png' },
    });

    // The researcher points the background at a different image. The variant
    // is what they decided, so the variant is what the command carries.
    edit(session, {
      label: 'Where they live',
      background: { image: 'streets-2026.png' },
    });
    expect(commandsOf(session)).toEqual([
      { op: 'set', key: 'background', value: { image: 'streets-2026.png' } },
    ]);

    // Meanwhile a collaborator switched the stage to concentric circles.
    arrives(session, {
      label: 'Where they live',
      background: { concentricCircles: 4 },
    });

    expect(backgroundOf(session)).toEqual({ image: 'streets-2026.png' });
    expect(backgroundIsValid(session)).toBe(true);
  });

  it('carries a switch of its own whole, over a collaborator’s edit to the variant it replaces', () => {
    const session = openSession({
      label: 'Where they live',
      background: { image: 'streets.png' },
    });

    // The mirror of the case above: this session is the one switching.
    edit(session, {
      label: 'Where they live',
      background: { concentricCircles: 4 },
    });
    expect(commandsOf(session)).toEqual([
      { op: 'set', key: 'background', value: { concentricCircles: 4 } },
    ]);

    // And the collaborator is the one who edited a leaf of the old variant.
    arrives(session, {
      label: 'Where they live',
      background: { image: 'aerial.png' },
    });

    expect(backgroundOf(session)).toEqual({ concentricCircles: 4 });
    expect(backgroundIsValid(session)).toBe(true);
  });

  it('keeps a background one variant when both sides switch the capability on at once', () => {
    const session = openSession({ label: 'Where they live' });

    // A container the draft is CREATING is diffed against an empty one, so
    // that a sibling a collaborator wrote under the same container survives —
    // which is right for every container but this one, where the two sides
    // are not writing siblings but rival answers to the same question.
    edit(session, {
      label: 'Where they live',
      background: { image: 'streets.png' },
    });
    expect(commandsOf(session)).toEqual([
      { op: 'set', key: 'background', value: { image: 'streets.png' } },
    ]);

    arrives(session, {
      label: 'Where they live',
      background: { concentricCircles: 3 },
    });

    expect(backgroundOf(session)).toEqual({ image: 'streets.png' });
    expect(backgroundIsValid(session)).toBe(true);
  });

  /**
   * The rule reaches the variant and stops there.
   *
   * `skipLogic` is an ordinary container — an action, a filter, and a
   * destination — and only the destination is a choice between shapes. An edit
   * to the destination writes the destination whole; an edit beside it is
   * addressed where it always was, so a collaborator's work on another member
   * of the same container still stands.
   */
  it('leaves the container above the variant addressed leaf by leaf', () => {
    const session = openSession({
      label: 'Where they live',
      skipLogic: {
        action: 'SKIP',
        filter: { join: 'AND', rules: [] },
        destination: { type: 'stage', stageId: 'stage-4' },
      },
    });

    edit(session, {
      label: 'Where they live',
      skipLogic: {
        action: 'SHOW',
        filter: { join: 'AND', rules: [] },
        destination: { type: 'finish' },
      },
    });
    expect(commandsOf(session)).toEqual([
      { op: 'set', key: ['skipLogic', 'action'], value: 'SHOW' },
      {
        op: 'set',
        key: ['skipLogic', 'destination'],
        value: { type: 'finish' },
      },
    ]);

    // The collaborator narrowed the same rule's filter, which is a member of
    // the container this session did not touch.
    arrives(session, {
      label: 'Where they live',
      skipLogic: {
        action: 'SKIP',
        filter: { join: 'OR', rules: [] },
        destination: { type: 'stage', stageId: 'stage-4' },
      },
    });

    expect(session.getSnapshot().editedSection.fields.skipLogic).toEqual({
      action: 'SHOW',
      filter: { join: 'OR', rules: [] },
      destination: { type: 'finish' },
    });
  });
});

/**
 * The same rule, one level further in: a variant container inside a list ROW.
 *
 * A sociogram prompt's `highlight` is one — highlighting is on and names the
 * attribute tapping a node writes, or it is off — and a prompt is a row of a
 * list. The command vocabulary cannot reach inside a row, so a rewritten row
 * travels as a whole-list `set` and the merge re-seats it on the row the
 * session holds LEAF by leaf, which is what keeps a collaborator's edit to
 * another property of the same row. For a variant container that granularity
 * makes the same hybrid it makes at the top of the document: the researcher
 * turns highlighting on while a collaborator clears the attribute it names,
 * and the merge answers with highlighting on and nothing to write — a prompt
 * the schema refuses.
 *
 * So a variant inside a row travels whole too, and the researcher's whole
 * variant is what stands.
 */
describe('a variant container inside a list row', () => {
  const prompt = (highlight: SectionDoc): SectionDoc => ({
    id: 'p1',
    text: 'Who do you spend time with?',
    layout: { layoutVariable: 'position' },
    highlight,
  });

  const promptsOf = (session: ProtocolBuilderSessionStore): unknown =>
    session.getSnapshot().editedSection.fields.prompts;

  it('travels whole rather than being merged leaf by leaf', () => {
    const session = openSession({
      label: 'Who',
      prompts: [prompt({ allowHighlighting: false, variable: 'isClose' })],
    });

    // The researcher turns highlighting on. Rewriting one row is a whole-list
    // `set`: the vocabulary cannot say "this property of this row".
    edit(session, {
      label: 'Who',
      prompts: [prompt({ allowHighlighting: true, variable: 'isClose' })],
    });

    // A collaborator clears the attribute the highlight names, leaving the
    // other variant of the same container.
    arrives(session, {
      label: 'Who',
      prompts: [prompt({ allowHighlighting: false })],
    });

    const merged = promptsOf(session);
    expect(merged).toEqual([
      prompt({ allowHighlighting: true, variable: 'isClose' }),
    ]);
    // Said by the schema rather than by the shape above: highlighting on with
    // no attribute to write is a prompt it refuses.
    expect(
      sociogramPromptSchema.safeParse(
        Array.isArray(merged) ? merged[0] : merged,
      ).success,
    ).toBe(true);
  });

  /**
   * The other half, which is what makes this a rule about the container rather
   * than about the researcher always winning: a row property OUTSIDE the
   * variant is still merged leaf by leaf, so both of them keep their work.
   */
  it('leaves the rest of the row addressed property by property', () => {
    const session = openSession({
      label: 'Who',
      prompts: [prompt({ allowHighlighting: false, variable: 'isClose' })],
    });

    edit(session, {
      label: 'Who',
      prompts: [
        { ...prompt({ allowHighlighting: true, variable: 'isClose' }) },
      ],
    });

    // The collaborator rewrote the question, and said nothing about the
    // highlight.
    arrives(session, {
      label: 'Who',
      prompts: [
        {
          ...prompt({ allowHighlighting: false, variable: 'isClose' }),
          text: 'Who do you see most often?',
        },
      ],
    });

    expect(promptsOf(session)).toEqual([
      {
        ...prompt({ allowHighlighting: true, variable: 'isClose' }),
        text: 'Who do you see most often?',
      },
    ]);
  });
});
