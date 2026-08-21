import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import { DistributionVisual } from '~/components/Synthetic/DistributionVisual';
import type {
  SyntheticDistribution,
  SyntheticWindow,
} from '~/components/Synthetic/summaries';
import { SyntheticNumberField } from '~/components/Synthetic/SyntheticNumberField';
import { numericWindowOf } from '~/components/Synthetic/useNumericDraft';

import {
  type DistributionFamily,
  DISTRIBUTION_LABELS,
  DISTRIBUTION_PARAMETERS,
  distributionCandidates,
  PARAMETER_LABELS,
  parameterValue,
  parameterWindow,
  withParameter,
} from './distributions';
import type { SyntheticIssue } from './stageSynthetic';

/**
 * The editor for one distribution: which family, its parameters, and a sketch
 * of the shape they make over the field's valid window.
 *
 * It proposes rather than decides. Every gesture — choosing a family, moving a
 * parameter — hands `onCandidates` an ORDERED list of candidate declarations,
 * and the owning section writes the first one the schema accepts (spec
 * governing rules 1 and 2). That is why switching families can offer a rounded
 * seed after a raw one: which of them is admissible is a question only the
 * schema answers, and it answers it the same way for a whole-number count and
 * a continuous density.
 *
 * The visual is `aria-hidden` by its own contract; the numeric fields beside
 * it are the accessible representation of the same values.
 */

export type DistributionEditorProps = {
  /** Field-name prefix, e.g. `synthetic.count`. */
  name: string;
  /** Names the group of controls for assistive technology. */
  legend: string;
  /** The resolved declaration currently in force. */
  distribution: SyntheticDistribution;
  /** The field's own valid window, from the schema. */
  window: SyntheticWindow;
  /** The families the schema admits here, in the order they are offered. */
  families: readonly DistributionFamily[];
  /** Explains what this distribution decides, beside the family select. */
  hint?: ReactNode;
  /** Whole numbers only — the schema refuses a fraction for this field. */
  integral?: boolean;
  /** The schema's refusals, pathed relative to this distribution. */
  issues?: readonly SyntheticIssue[];
  disabled?: boolean;
  onCandidates: (candidates: Record<string, unknown>[]) => void;
};

const FAMILY_LABEL = 'Distribution';

const issuesFor = (
  issues: readonly SyntheticIssue[],
  parameter: string,
): string[] =>
  issues
    .filter((issue) => issue.path[issue.path.length - 1] === parameter)
    .map((issue) => issue.message);

/**
 * Refusals about the declaration as a whole rather than one of its parameters
 * — a count whose whole support the stage's behaviours window cannot hold, for
 * one. No field can carry these, so they are rendered here rather than being
 * dropped.
 */
const declarationIssues = (issues: readonly SyntheticIssue[]): string[] =>
  issues.filter((issue) => issue.path.length === 0).map((i) => i.message);

export function DistributionEditor({
  name,
  legend,
  distribution,
  window,
  families,
  hint,
  integral = false,
  issues = [],
  disabled,
  onCandidates,
}: DistributionEditorProps) {
  const family = distribution.distribution;
  const parameters = DISTRIBUTION_PARAMETERS[family];
  const declarationRefusals = declarationIssues(issues);

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      {declarationRefusals.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>{legend}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ps-5">
              {declarationRefusals.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex min-w-0 flex-wrap items-start gap-6">
        <div className="min-w-0 flex-1 basis-64">
          <UnconnectedField
            name={`${name}.distribution`}
            label={FAMILY_LABEL}
            {...(hint === undefined ? {} : { hint })}
            component={StyledSelectField}
            value={family}
            options={families.map((option) => ({
              value: option,
              label: DISTRIBUTION_LABELS[option],
            }))}
            disabled={disabled}
            onChange={(next: string | number | undefined) => {
              // Narrowed through the offered list rather than asserted: the
              // select can only ever return one of these, and looking it up is
              // what proves it.
              const chosen = families.find((option) => option === next);
              if (chosen === undefined || chosen === family) return;
              onCandidates(
                distributionCandidates(chosen, distribution, window),
              );
            }}
          />
          {parameters.map((parameter) => (
            <SyntheticNumberField
              key={parameter}
              name={`${name}.${parameter}`}
              label={PARAMETER_LABELS[parameter]}
              value={parameterValue(distribution, parameter)}
              window={numericWindowOf(
                parameterWindow(distribution, parameter, window),
                integral,
              )}
              disabled={disabled}
              errors={issuesFor(issues, parameter)}
              onCommit={(value) => {
                // The field is not `clearable`, so it only ever commits a
                // number; the union is the one contract every numeric
                // parameter shares.
                if (value === undefined) return;
                onCandidates([withParameter(distribution, parameter, value)]);
              }}
            />
          ))}
        </div>
        <DistributionVisual
          distribution={distribution}
          window={window}
          className="shrink-0"
        />
      </div>
    </fieldset>
  );
}
