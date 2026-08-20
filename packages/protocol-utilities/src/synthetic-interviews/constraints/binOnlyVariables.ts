import {
  collectEntityAttributeReferences,
  type Stage,
} from '@codaco/protocol-validation';

/** Variable ids per node type, for the types that have any. */
type BinOnlyVariables = Map<string, ReadonlySet<string>>;

const BIN_STAGE_TYPES: ReadonlySet<string> = new Set([
  'OrdinalBin',
  'CategoricalBin',
]);

/**
 * Whether a collected reference is a binning stage's own prompt variable —
 * `stages[i].prompts[j].variable` on an OrdinalBin or CategoricalBin — as
 * opposed to any other reference the same stage carries (a CategoricalBin
 * prompt's `otherVariable` is a sibling key, so it is not one of these).
 */
function isBinPromptAssignment(
  path: readonly (string | number)[],
  stages: Stage[],
): boolean {
  if (path.length !== 5) return false;
  const [root, stageIndex, prompts, , key] = path;
  if (root !== 'stages' || typeof stageIndex !== 'number') return false;
  if (prompts !== 'prompts' || key !== 'variable') return false;
  const stage = stages[stageIndex];
  return stage !== undefined && BIN_STAGE_TYPES.has(stage.type);
}

function add(
  variablesByType: Map<string, Set<string>>,
  type: string,
  variableId: string,
): void {
  const forType = variablesByType.get(type) ?? new Set<string>();
  forType.add(variableId);
  variablesByType.set(type, forType);
}

/**
 * The node variables a protocol assigns *only* through a binning stage's
 * prompt, whose declared validation rules the interview therefore never
 * enforces.
 *
 * Validation rules are a form-field mechanism: `useProtocolForm` applies them
 * where it builds a `Field`. Neither binning interface builds one for its
 * prompt variable — OrdinalBin renders no `Field` at all, and CategoricalBin
 * renders one only for a prompt's `otherVariable` — so both write the bin's
 * value straight through `updateNode`. Enforcing rules on such a variable would
 * also describe arrangements the interface cannot produce: `differentFrom`
 * forbids two nodes sharing a bin, `minSelected: 2` forbids a node sitting in
 * exactly one. See commit 49142e017.
 *
 * "Only" is the whole of the claim, and it is deliberately strict about other
 * writers: a variable with another validated or unvalidated writer keeps its
 * rules, because the other site may be a form field where the participant is
 * shown a validation error. Read-only references do not change who writes the
 * value and therefore do not disqualify it. References and their writer usage
 * are read from the schema's own `entityAttributeReference` tags rather than
 * from a hand-listed set of stage keys, so a writer added to the schema later
 * keeps the variable constrained without anything here being updated.
 */
export function collectBinOnlyVariables(stages: Stage[]): BinOnlyVariables {
  const binAssigned = new Map<string, Set<string>>();
  const otherwiseUsed = new Map<string, Set<string>>();

  // The collector walks whatever branches of the protocol schema the value
  // supplies, so a value carrying only `stages` collects only the stages'
  // references, at paths rooted there. The codebook is deliberately left out: a
  // rule naming this variable as its target is a rule on the OTHER variable,
  // and does not put this one in front of a participant.
  for (const hit of collectEntityAttributeReferences({ stages })) {
    if (hit.usage === undefined) continue;

    // Both binning stages take a node subject, so a reference resolving to any
    // other entity cannot be one of their prompt variables.
    if (hit.subject?.entity !== 'node') continue;

    add(
      isBinPromptAssignment(hit.path, stages) ? binAssigned : otherwiseUsed,
      hit.subject.type,
      hit.variableId,
    );
  }

  const binOnly: BinOnlyVariables = new Map();

  for (const [type, assigned] of binAssigned) {
    const used = otherwiseUsed.get(type);
    const only = new Set(
      [...assigned].filter((variableId) => !used?.has(variableId)),
    );
    if (only.size > 0) binOnly.set(type, only);
  }

  return binOnly;
}
