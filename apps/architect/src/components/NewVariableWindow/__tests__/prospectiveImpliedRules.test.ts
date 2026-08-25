import { describe, expect, it } from 'vitest';

import { prospectiveImpliedRules } from '../prospectiveImpliedRules';

/**
 * What the stage about to own an attribute implies about it, read by writing a
 * placeholder into the slot and asking the schema's own collector.
 *
 * The whole reading rests on the placeholder being the slot's and nothing
 * else's: rules grouped onto it from some OTHER writer are rules the new
 * attribute is not held to, and the dialog would disable controls over them.
 */

const SUBJECT = { entity: 'node', type: 'person' } as const;

const quickAddStage = (quickAdd: string) => ({
  id: 'qa',
  type: 'NameGeneratorQuickAdd',
  label: 'Quick Add Name Generator',
  subject: SUBJECT,
  quickAdd,
  prompts: [{ id: 'p1', text: 'Who do you know?' }],
});

describe('prospectiveImpliedRules', () => {
  it('reports what the slot implies', () => {
    // A quick add always collects the value it creates people with, so an
    // attribute created into that slot is always answered.
    const rules = prospectiveImpliedRules(
      quickAddStage('v_name'),
      'quickAdd',
      SUBJECT,
    );

    expect(rules.rules.required).toBe(true);
    expect(rules.alwaysAnsweredBy).toEqual(['Quick Add Name Generator']);
  });

  it('reports nothing for a slot that implies nothing', () => {
    const rules = prospectiveImpliedRules(
      quickAddStage('v_name'),
      'prompts.0.variable',
      SUBJECT,
    );

    expect(rules.rules.required).toBeUndefined();
    expect(rules.alwaysAnsweredBy).toEqual([]);
  });

  it('does not inherit rules from a writer that already names the placeholder', () => {
    // A document whose author chose the placeholder's own literal string as an
    // attribute key: its quick-add writer would otherwise be grouped with the
    // inserted one, and a form field created here would arrive claiming the
    // quick add's "always answered" — disabling a missingness control over a
    // rule no new attribute is actually held to.
    const collided = quickAddStage('__architect-prospective-attribute__');

    const rules = prospectiveImpliedRules(
      collided,
      'prompts.0.variable',
      SUBJECT,
    );

    expect(rules.rules.required).toBeUndefined();
    expect(rules.alwaysAnsweredBy).toEqual([]);
  });
});
