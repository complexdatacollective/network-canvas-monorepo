import { render } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

const setup = (ownProps: OwnProps) =>
  render(
    <Form onSubmit={() => ({ success: true })}>
      <Validations name="validation" initialValue={{}} {...ownProps} />
    </Form>,
  );

// Six reference-type rules (sameAs, differentFrom, and the four numeric
// comparators) are unused on `b` and so are all candidates for gating.
const REFERENCE_RULE_COUNT = 6;

describe('Validations: rule-type gating batches per rule, not per candidate', () => {
  beforeEach(() => {
    analyser.calls = 0;
  });

  it('keeps the analyser call count bounded (not growing with candidate count) when gating every unused reference rule', () => {
    const allVariables: Record<string, TestVariable> = {
      b: { name: 'B', type: 'number', validation: {} },
    };
    const existingVariables: Record<
      string,
      Pick<TestVariable, 'name' | 'type'>
    > = {};
    for (let index = 0; index < 20; index++) {
      const id = `v${index}`;
      allVariables[id] = { name: id, type: 'number' };
      existingVariables[id] = { name: id, type: 'number' };
    }

    setup({
      variableType: 'number',
      entity: 'node',
      currentVariableId: 'b',
      allVariables,
      existingVariables,
    });

    // Every candidate is isolated, so each of the 6 reference rules resolves
    // in one candidate-free baseline pass (Thirtieth-wave Finding 2) plus a
    // single shared batch call — never one call per candidate (which would
    // be 6 * 20 = 120). A generous allowance covers any extra React
    // re-render without hiding a regression back to per-candidate scaling:
    // the assertion that matters is the strict bound against that
    // per-candidate-per-rule worst case below.
    expect(analyser.calls).toBeGreaterThan(0);
    expect(analyser.calls).toBeLessThanOrEqual(REFERENCE_RULE_COUNT * 2 * 4);
    expect(analyser.calls).toBeLessThan(
      REFERENCE_RULE_COUNT * Object.keys(existingVariables).length,
    );
  });
});
