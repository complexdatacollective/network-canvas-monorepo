import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import Form from '@codaco/fresco-ui/form/Form';

/**
 * Twenty-seventh-wave Finding 1: the unused-reference-rule gating in
 * Validations.tsx used to call `checkDraft` (and so re-run
 * `findValidationContradictions` over the WHOLE record) once per candidate
 * variable per unused reference rule — O(rule types × variable count)
 * analyser passes to render the section once. The fix routes this through
 * `findLegalReferenceTargets`, which answers "does this rule have ANY legal
 * target" for every candidate in one batched analysis pass per rule. Mock
 * pattern follows findLegalReferenceTargets.test.ts / the migration's own
 * migration-repair-batching.test.ts: count real `findValidationContradictions`
 * invocations rather than asserting on wall-clock duration.
 */
const { analyser } = vi.hoisted(() => ({ analyser: { calls: 0 } }));

vi.mock('@codaco/protocol-validation', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@codaco/protocol-validation')>();
  return {
    ...actual,
    findValidationContradictions: (
      variables: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => {
      analyser.calls += 1;
      return actual.findValidationContradictions(variables, options);
    },
  };
});

// Imported AFTER the mock is registered above (vitest hoists `vi.mock` above
// this import regardless of source order) so every analyser call the
// component's render makes, directly or via `findLegalReferenceTargets`, is
// counted.
const { default: Validations } = await import('../Validations');

beforeAll(() => {
  Element.prototype.scrollTo ??= () => undefined;
});

type TestVariable = {
  name: string;
  type: 'number';
  validation?: Record<string, unknown>;
};

type OwnProps = {
  variableType: string;
  entity: string;
  existingVariables: Record<string, Pick<TestVariable, 'name' | 'type'>>;
  allVariables: Record<string, TestVariable>;
  currentVariableId: string;
};

/** A sibling field, so the harness can produce form activity of its own. */
const ProbeInput = ({
  value,
  onChange,
  ...rest
}: {
  value?: string;
  onChange?: (value: string) => void;
} & React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...rest}
    value={value ?? ''}
    onChange={(event) => onChange?.(event.target.value)}
  />
);

const setup = (
  ownProps: OwnProps,
  validation: Record<string, boolean | number | string | null> = {},
) =>
  render(
    <Form onSubmit={() => ({ success: true })}>
      <Field name="name" label="Name" component={ProbeInput} />
      <Validations name="validation" initialValue={validation} {...ownProps} />
    </Form>,
  );

// Six reference-type rules (sameAs, differentFrom, and the four numeric
// comparators) are all candidates for gating on `b`.
const REFERENCE_RULE_COUNT = 6;

const buildCodebook = (candidateCount: number) => {
  const allVariables: Record<string, TestVariable> = {
    b: { name: 'B', type: 'number', validation: {} },
  };
  const existingVariables: Record<
    string,
    Pick<TestVariable, 'name' | 'type'>
  > = {};
  for (let index = 0; index < candidateCount; index++) {
    const id = `v${index}`;
    allVariables[id] = { name: id, type: 'number' };
    existingVariables[id] = { name: id, type: 'number' };
  }
  return {
    variableType: 'number',
    entity: 'node',
    currentVariableId: 'b',
    allVariables,
    existingVariables,
  };
};

const EVERY_REFERENCE_RULE_SET = {
  sameAs: 'v0',
  differentFrom: 'v1',
  lessThanVariable: 'v2',
  greaterThanVariable: 'v3',
  lessThanOrEqualToVariable: 'v4',
  greaterThanOrEqualToVariable: 'v5',
};

const countCallsFor = (
  candidateCount: number,
  validation: Record<string, boolean | number | string | null>,
) => {
  analyser.calls = 0;
  const { unmount } = setup(buildCodebook(candidateCount), validation);
  const calls = analyser.calls;
  unmount();
  return calls;
};

describe('Validations: reference-rule gating batches per rule, not per candidate', () => {
  beforeEach(() => {
    analyser.calls = 0;
  });

  it('does not scale the analyser with candidate count when the edited variable has no reference edges', () => {
    const atTwenty = countCallsFor(20, {});
    const atForty = countCallsFor(40, {});

    // Each of the 6 reference rules resolves in one candidate-free baseline
    // pass (Thirtieth-wave Finding 2) plus a single shared batch call, so
    // doubling the codebook must not move the count at all. Equality is the
    // real contract: a `<` bound against the per-candidate worst case
    // (6 * 20 = 120) passes for anything merely sub-quadratic.
    expect(atTwenty).toBeGreaterThan(0);
    expect(atForty).toBe(atTwenty);
    expect(atTwenty).toBeLessThanOrEqual(REFERENCE_RULE_COUNT * 2 * 4);
  });

  it('stays linear in candidate count on the individual path', () => {
    const atTwenty = countCallsFor(20, EVERY_REFERENCE_RULE_SET);
    const atForty = countCallsFor(40, EVERY_REFERENCE_RULE_SET);

    expect(atTwenty).toBeGreaterThan(0);
    expect(atForty).toBeLessThanOrEqual(
      atTwenty * 2 + REFERENCE_RULE_COUNT * 4,
    );
  });

  it('does not re-run the analyser for form activity unrelated to validation', () => {
    const { unmount } = setup(buildCodebook(10), {});
    const afterMount = analyser.calls;

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'unrelated' },
    });

    expect(afterMount).toBeGreaterThan(0);
    expect(analyser.calls).toBe(afterMount);

    unmount();
  });
});
