import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { useSortVariablePool, useStageSubject } from '../promptCodebook.ts';

/**
 * Which of `SortOrderRows`' two answers this family gives about the properties
 * its sort rules may name.
 *
 * The component takes `readonly SortableProperty[] | undefined` and reads the
 * two differently: `undefined` is "the family does not know yet" and nothing is
 * judged against it, while an EMPTY list is a real subject with nothing to sort
 * by, where every rule the prompt holds is certainly dangling and is shown and
 * refused as such. Both are covered where the reading happens, in
 * `SortOrderRows`' own tests. What is decided HERE is which of them a bin or
 * census prompt means, and answering `[]` for both would report every rule of a
 * stage that has not been told what it collects as pointing at a deleted
 * attribute.
 *
 * Probed rather than driven through a prompt dialog because `PromptsSection`
 * keeps its own section closed until the stage has a subject, so the "not known
 * yet" answer is not reachable from a well-formed stage's prompt editor — which
 * is a reason to keep the two apart here, not a reason to conflate them: the
 * two readings of the subject are not the same predicate, and a stage whose
 * subject this editor cannot read still opens.
 */
function SortPoolProbe() {
  const subject = useStageSubject();
  const properties = useSortVariablePool(subject);
  // `null` stands in for `undefined`, which `JSON.stringify` answers with
  // nothing at all. The same stand-in `useStageValue`'s own probe uses.
  return (
    <output data-testid="sort-pool">
      {JSON.stringify(properties ?? null)}
    </output>
  );
}

/** What the hook answered, with `null` for "does not know yet". */
const sortPool = (): { value: string }[] | null =>
  JSON.parse(screen.getByTestId('sort-pool').textContent ?? 'null') as
    | { value: string }[]
    | null;

/** The fixture's person type, as a collaborator who deleted every attribute
 * of it would leave it. */
const PERSON_WITHOUT_ATTRIBUTES: SectionDoc = {
  name: 'person',
  color: 'node-color-seq-1',
  variables: {},
};

const openWith = (fields: SectionDoc) => ({
  stage: {
    type: 'CategoricalBin' as const,
    fields: { label: 'Categorical Bin', ...fields },
  },
  sections: <SortPoolProbe />,
});

describe('the properties a bin or census prompt may sort by', () => {
  it('says it does not know them yet while the stage has no subject', () => {
    renderStageEditor(openWith({}));

    expect(sortPool()).toBeNull();
  });

  it('says the same of a subject this editor cannot read', () => {
    // A subject a collaborator or an import left half-written. `PromptsSection`
    // asks only whether `type` is a string, so a stage like this one opens its
    // prompts while nothing here can say what they describe.
    renderStageEditor(openWith({ subject: { entity: 'node', type: '' } }));

    expect(sortPool()).toBeNull();
  });

  it('offers every attribute of a subject it can read', () => {
    renderStageEditor(
      openWith({ subject: { entity: 'node', type: 'person' } }),
    );

    const pool = sortPool();
    expect(pool).not.toBeNull();
    expect(pool?.map(({ value }) => value)).toContain('name');
  });

  it('says a subject whose attributes have all gone has nothing to sort by', () => {
    const harness = renderStageEditor(
      openWith({ subject: { entity: 'node', type: 'person' } }),
    );
    // Proves the empty answer below is the deletion's doing rather than the
    // probe never having read a codebook.
    expect(sortPool()?.length).toBeGreaterThan(0);

    harness.receiveCodebookUpdate({
      node: { person: PERSON_WITHOUT_ATTRIBUTES },
    });

    // An empty list, NOT the "does not know yet" answer: the subject is right
    // there and it has nothing to sort by, so a rule the prompt still holds
    // has to be shown and refused rather than passed over.
    expect(sortPool()).toEqual([]);
  });
});
