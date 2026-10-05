/**
 * The two lists an editor asks before it decides how deep to address a change,
 * and what to do with what it assembled.
 *
 * Both are derived from the stage schemas rather than written beside them, so
 * what this file guards is the DERIVATION: that it finds every container the
 * schemas declare as a choice between shapes, that it finds nothing else, that
 * nothing in the schemas can hide such a choice from it — and that it finds
 * every container whose members constrain one another WITHOUT being rivals,
 * which is the case a choice between shapes cannot answer.
 */
import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '../../../utils/test-utils.ts';
import {
  AMBIGUOUS_VARIANT_CONTAINERS,
  CONSTRAINED_CONTAINERS,
  EXCLUSIVE_VARIANT_CONTAINERS,
  isExclusiveVariantContainer,
  schemaRefusesContainer,
  UNREADABLE_STAGE_CONTAINERS,
} from '../exclusive-variant-containers.ts';
import ProtocolSchemaV8 from '../schema.ts';

describe('the exclusive-variant containers of a stage document', () => {
  /**
   * Written out rather than counted, because the point of the list is that a
   * stage type gaining a variant changes it — and that change has to be read
   * by somebody, since it changes how an editor's commands are addressed.
   *
   * At an object path, where a command can address a member directly:
   *
   * - `background` is a sociogram's, a narrative's and a network composer's:
   *   an image XOR a number of concentric circles, said once as an
   *   author-facing refinement and once as the union it narrows to.
   * - `framing` is the family pedigree's, discriminated on `mode`: a fixed
   *   framing carries the value it is fixed to, and a participant's choice
   *   carries nothing.
   * - `skipLogic.destination` is every stage's, discriminated on `type`: a
   *   named stage to jump to, or the end of the interview.
   *
   * And inside a list ROW, where no command reaches but the merge that replays
   * a rewritten row does — leaf by leaf, which is the same granularity one
   * level down:
   *
   * - a filter rule is a choice of subject, discriminated on `type`, wherever
   *   a filter appears: on the stage's skip logic, on a network filter, and on
   *   each of a narrative's panels.
   * - a content item — an Information stage's `items`, a family pedigree's
   *   `introScreen.items` — is text XOR an asset.
   * - `prompts.*.highlight` is a sociogram's: highlighting is on and names the
   *   attribute a tap writes, or it is off.
   */
  it('is every choice between object shapes the stage schemas declare', () => {
    expect(EXCLUSIVE_VARIANT_CONTAINERS).toEqual([
      ['background'],
      ['filter', 'rules', '*'],
      ['framing'],
      ['introScreen', 'items', '*'],
      ['items', '*'],
      ['panels', '*', 'filter', 'rules', '*'],
      ['prompts', '*', 'highlight'],
      ['skipLogic', 'destination'],
      ['skipLogic', 'filter', 'rules', '*'],
    ]);
  });

  /**
   * The one path the stage types disagree about, and the reason the list above
   * is answerable at all without knowing which stage this is.
   *
   * A categorical bin's PROMPT is itself a choice between two shapes: one that
   * offers an 'other' option carries all three of the fields describing it,
   * and one that does not carries none of them. Every other stage type's
   * prompt is an ordinary row. Calling `prompts.*` a variant for all of them
   * would hand the researcher's whole prompt row to whoever touched it and
   * throw away a collaborator's edit to another property of the same row;
   * calling it ordinary for all of them lets a categorical bin prompt hold
   * half of each shape.
   *
   * Neither is said. The consumers that ask are handed a stage's fields and
   * not its type — a draft carries no `type` — so a question they cannot ask
   * gets no answer, and a categorical bin prompt row is merged property by
   * property like any other. Pinned here so that a stage type creating a new
   * disagreement is a failure rather than a silent one.
   */
  it('says nothing about a path the stage types disagree about', () => {
    expect(AMBIGUOUS_VARIANT_CONTAINERS).toEqual([['prompts', '*']]);
    expect(isExclusiveVariantContainer(['prompts', '*'])).toBe(false);
  });

  /**
   * The blind spot, kept empty.
   *
   * A variant declared with `.transform()` rather than `.pipe()` — the shape
   * `narrowTo` uses in `common/prompts.ts` — hides behind a function the
   * derivation cannot look through. Both of those declare themselves with
   * `asExclusiveVariants`, which is what puts them in the list above. One that
   * did not would be a variant nothing here can see, so it is reported and
   * this fails rather than being silently left out.
   */
  it('leaves nowhere for a variant to hide from it', () => {
    expect(UNREADABLE_STAGE_CONTAINERS).toEqual([]);
  });

  /**
   * The other half: an ordinary container is still addressed leaf by leaf, so
   * two researchers configuring different parts of one capability both keep
   * their work. `skipLogic` holds the variant and is not one itself.
   */
  it.each([['skipLogic'], ['form'], ['behaviours'], ['nodeConfig'], ['edges']])(
    'does not claim %s, whose members are not rivals',
    (key) => {
      expect(isExclusiveVariantContainer([key])).toBe(false);
    },
  );

  /**
   * What "exclusive" means, said by the schema rather than by this list: a
   * value carrying members of two variants at once is a protocol the schema
   * refuses. That is the document a leaf-addressed write produces when the
   * other side has switched the variant, and the reason the whole container
   * travels instead.
   */
  it('refuses a background carrying both variants', () => {
    const base = createBaseProtocol();
    // The protocol these hybrids are made out of, so that a refusal below is
    // the mixture being refused and not the fixture.
    expect(ProtocolSchemaV8.safeParse(base).success).toBe(true);
    const hybrid = {
      ...base,
      stages: base.stages.map((stage) =>
        stage.type === 'Sociogram'
          ? { ...stage, background: { concentricCircles: 4, image: 'map.png' } }
          : stage,
      ),
    };

    expect(ProtocolSchemaV8.safeParse(hybrid).success).toBe(false);
  });

  it('refuses a skip-logic destination carrying both variants', () => {
    const base = createBaseProtocol();
    expect(ProtocolSchemaV8.safeParse(base).success).toBe(true);
    const hybrid = {
      ...base,
      stages: base.stages.map((stage, index) =>
        index === 1
          ? {
              ...stage,
              skipLogic: {
                action: 'SKIP',
                filter: {
                  rules: [
                    {
                      id: 'consent-rule',
                      type: 'ego',
                      options: { attribute: 'egoAge', operator: 'EXISTS' },
                    },
                  ],
                },
                destination: { type: 'finish', stageId: 'nameGenerator1' },
              },
            }
          : stage,
      ),
    };

    expect(ProtocolSchemaV8.safeParse(hybrid).success).toBe(false);
  });
});

/**
 * The other list the same walk derives: the containers whose members are not
 * rivals but still constrain one another, so that a merge assembling one out
 * of two people's work can produce a container the schema refuses.
 */
describe('the jointly constrained containers of a stage document', () => {
  /**
   * Written out for the same reason the variant list is: a stage type gaining
   * a rule about two of a container's members TOGETHER changes what happens to
   * a collaborator's edit inside that container, so the change has to be read
   * by somebody.
   *
   * - `prompts.*` is the one this exists for. A sociogram prompt's `edges`
   *   says which edges to draw and which the participant may create, and an
   *   `edges` setting neither has no effect, so the schema refuses it. It is
   *   also the path `AMBIGUOUS_VARIANT_CONTAINERS` reports, and this is the
   *   only rule that reaches a categorical bin's prompt.
   * - `behaviours` is the name generators': a node-count window whose
   *   `maxNodes` falls below its `minNodes` can never be satisfied.
   * - `filter`, `skipLogic.filter` and `panels.*.filter` are `FilterSchema`:
   *   more than one rule has to say how the rules combine.
   * - `nodeForm.fields.*` and `edges.*.form.fields.*` are the Network
   *   Composer's form fields, whose `parameters` have to match the control
   *   `component` names.
   *
   * The exclusive-variant containers are deliberately absent: the whole
   * container travels there, so nothing is ever assembled to ask about.
   */
  it('is every container whose members constrain one another', () => {
    expect(CONSTRAINED_CONTAINERS).toEqual([
      ['behaviours'],
      ['edges', '*', 'form', 'fields', '*'],
      ['filter'],
      ['nodeForm', 'fields', '*'],
      ['panels', '*', 'filter'],
      ['prompts', '*'],
      ['skipLogic', 'filter'],
    ]);
  });

  it('says nothing about a path whose members do not constrain each other', () => {
    // `edges` holds the two members the sociogram prompt's rule is ABOUT, and
    // is not itself where the rule lives: it is the prompt row that carries
    // it, which is why the question is asked one level up.
    expect(schemaRefusesContainer(['edges'], {})).toBe(false);
    expect(schemaRefusesContainer(['layout'], { layoutVariable: 'pos' })).toBe(
      false,
    );
    // A variant container is answered whole by `isExclusiveVariantContainer`,
    // so nothing is assembled at one for this to judge.
    expect(schemaRefusesContainer(['background'], {})).toBe(false);
  });

  /**
   * What the rule is FOR, said by the schema: a prompt row assembled out of
   * two edits each side was entitled to make, which neither of them held.
   */
  it('refuses a sociogram prompt whose edges set neither member', () => {
    const prompt = (edges: unknown) => ({
      id: 'p1',
      text: 'Who do you know?',
      layout: { layoutVariable: 'position' },
      edges,
    });

    expect(
      schemaRefusesContainer(['prompts', '*'], prompt({ display: [] })),
    ).toBe(true);
    // Each side's own prompt, which is what makes the one above an invention.
    expect(
      schemaRefusesContainer(['prompts', '*'], prompt({ display: ['knows'] })),
    ).toBe(false);
    expect(
      schemaRefusesContainer(
        ['prompts', '*'],
        prompt({ display: [], create: 'knows' }),
      ),
    ).toBe(false);
  });

  /**
   * And the half that keeps it from answering for every stage type at once: a
   * prompt row is `prompts.*` whatever stage it belongs to, so a name
   * generator's row must not be judged by the sociogram's schema.
   */
  it('accepts a row any stage type’s schema at that path accepts', () => {
    expect(
      schemaRefusesContainer(['prompts', '*'], {
        id: 'p1',
        text: 'Who do you know?',
        additionalAttributes: [{ variable: 'isClose', value: true }],
      }),
    ).toBe(false);
    // A row NO stage type can read is refused, which is the answer that makes
    // the acceptance above a judgement rather than a shrug.
    expect(
      schemaRefusesContainer(['prompts', '*'], { id: 'p1', text: '' }),
    ).toBe(true);
  });
});
