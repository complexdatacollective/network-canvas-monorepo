import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';

import VariableParameterFields from '../../codebook/components/VariableParameterFields.tsx';
import {
  type ParameterShape,
  parametersForShape,
  parametersWith,
  validateParameters,
} from '../../codebook/variableParameters.ts';
import { composerFormFieldMessages as messages } from './composerFormFieldMessages.ts';

export type ComposerParameters = Record<string, unknown>;

export type ComposerParametersFieldProps = CreateFormFieldProps<
  ComposerParameters,
  'div',
  {
    /** Which settings the field's chosen control takes. */
    shape: ParameterShape;
    /**
     * What the codebook attribute contributes to this control, where it
     * contributes anything.
     *
     * A composer field that holds no settings of its own runs on the
     * attribute's: the interview reads `field.parameters ?? variable.parameters`
     * (`interview/src/selectors/forms.ts`), so an absent block is not an absent
     * setting. It is shown and edited as though it were this field's, and
     * writing anything different is what gives the field a block of its own.
     */
    inherited?: ComposerParameters;
    /** The attribute those inherited settings belong to, for the sentence. */
    inheritedFrom?: string;
  }
>;

/** Whether two blocks say the same thing. Flat: a block is strings and numbers. */
const sameParameters = (
  first: ComposerParameters | undefined,
  second: ComposerParameters | undefined,
): boolean => {
  if (first === undefined || second === undefined) return first === second;
  const keys = Object.keys(first);
  return (
    keys.length === Object.keys(second).length &&
    keys.every((key) => first[key] === second[key])
  );
};

/**
 * The settings a network composer form field's chosen input control takes.
 *
 * The same three sets of controls the codebook's own attribute editor renders,
 * over the same helpers, because the question the researcher is answering is
 * identical. What differs is where the answer is written: everywhere else a
 * control's settings belong to the codebook attribute, keyed to the
 * `component` the codebook records for it, while here `component` and
 * `parameters` are the composer FIELD's — so one attribute can be a date
 * picker bounded by two dates on this form and a relative window on the next,
 * and a block written to the codebook would be authored against a control the
 * codebook does not have.
 *
 * Judged where it is written rather than only at the save, which is the rule
 * `VariableParameterFields` already applies to a day count: a window that ends
 * before it starts says so under the date that ends it, while the researcher
 * is still looking at it.
 */
export default function ComposerParametersField({
  value,
  onChange,
  shape,
  inherited,
  inheritedFrom,
  disabled = false,
  readOnly = false,
  className,
  id,
}: ComposerParametersFieldProps) {
  const intl = useAppIntl();
  // What the participant would meet, which is what the researcher is shown and
  // edits as a whole: an override entered over blanks would replace the
  // inherited block with the one setting just typed and silently drop the rest.
  const effective = value ?? inherited;
  const inheriting = value === undefined && inherited !== undefined;

  return (
    <div id={id} className={className}>
      {inheriting && inheritedFrom !== undefined && (
        <p className="text-muted mb-4 text-sm">
          {intl.formatMessage(messages.parametersInherited, {
            attributeName: inheritedFrom,
          })}
        </p>
      )}
      <VariableParameterFields
        shape={shape}
        parameters={effective}
        onChange={(key, next) => {
          const written = parametersForShape(
            shape,
            parametersWith(shape, effective, key, next),
          );
          // A block that still says exactly what the attribute says is left as
          // an inheritance rather than written back as a copy of it: a field
          // that stopped following the attribute would have stopped for a
          // decision the researcher never made.
          onChange?.(sameParameters(written, inherited) ? undefined : written);
        }}
        issues={validateParameters(shape, effective)}
        readOnly={readOnly || disabled}
      />
    </div>
  );
}
