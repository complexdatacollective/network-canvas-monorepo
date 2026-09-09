import { useEffect, useRef, useState } from 'react';

import { formatMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { useField } from '@codaco/fresco-ui/form/hooks/useField';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type { Variables } from '@codaco/protocol-validation';

import VariableParameterFields from '../../codebook/components/VariableParameterFields.tsx';
import {
  PARAMETERS_BLOCK,
  type ParameterIssues,
  type ParameterShape,
  parameterShapeFor,
  parametersForShape,
  parametersWith,
  validateParameters,
} from '../../codebook/variableParameters.ts';
import { variableDisplayName } from '../../codebook/variableValidation.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { RowValues } from '../rowRenderers.tsx';
import { useSubjectVariables } from './codebookOptions.ts';
import { useComposerFormSubject } from './composerFormSubject.ts';
import { networkCanvasMessages } from './networkCanvasMessages.ts';
import { asText } from './rowValues.ts';

/** Where a composer form field keeps the settings its control takes. */
export const PARAMETERS_FIELD = 'parameters';

const NO_ISSUES: ParameterIssues = Object.freeze({});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Which settings a composer field's control takes, from the pair the ROW
 * holds.
 *
 * The type comes from the codebook — an attribute is a date or it is not,
 * whatever any form does with it — and the control from the field, because a
 * composer field carries its own. Exported so the list's save check and the
 * controls it refuses answer the same question the same way.
 */
export function composerParameterShape(
  variables: Readonly<Variables>,
  variable: unknown,
  component: unknown,
): ParameterShape | null {
  const attributeId = asText(variable);
  const attribute =
    attributeId === undefined ? undefined : variables[attributeId];
  return parameterShapeFor(attribute?.type, component);
}

/**
 * The settings this field's control would actually run with.
 *
 * A composer field that omits `parameters` INHERITS the codebook variable's
 * block: the interview runtime reads `fieldParameters ?? codebookParameters`
 * (see interview's `selectors/forms.ts`), so an absent key is not an absent
 * setting — it is the attribute's own. Read only through the shape the FIELD's
 * control takes, because that is what the field would be judged by: a codebook
 * block authored for a control this field does not use contributes nothing.
 *
 * Exported so the editor, the list's save check and the runtime all answer the
 * same question the same way — a field validly inheriting its scale labels was
 * refused for missing them, and shown as blank while the participant would
 * have seen the attribute's.
 */
export function effectiveComposerParameters(
  variables: Readonly<Variables>,
  variable: unknown,
  component: unknown,
  parameters: unknown,
): Record<string, unknown> | undefined {
  if (isRecord(parameters)) return parameters;
  const shape = composerParameterShape(variables, variable, component);
  if (shape === null) return undefined;
  const attributeId = asText(variable);
  const attribute =
    attributeId === undefined ? undefined : variables[attributeId];
  const inherited =
    attribute !== undefined && 'parameters' in attribute
      ? attribute.parameters
      : undefined;
  return parametersForShape(shape, inherited);
}

/**
 * Whether two blocks say the same thing, which is what tells an inherited
 * block from an override of it. Shallow, because a settings block is a flat
 * record of strings and numbers.
 */
const sameParameters = (
  first: Record<string, unknown> | undefined,
  second: Record<string, unknown> | undefined,
): boolean => {
  if (first === undefined || second === undefined) return first === second;
  const keys = Object.keys(first);
  return (
    keys.length === Object.keys(second).length &&
    keys.every((key) => first[key] === second[key])
  );
};

export type ComposerFieldParametersProps = Readonly<{
  /** The row being edited, whole, for the block it arrived holding. */
  item: RowValues;
}>;

/**
 * The settings a composer form field's chosen input control takes.
 *
 * The counterpart of Architect's "Control settings" section, and of the block
 * the codebook's own attribute editor renders — the same three sets of
 * controls, over the same helpers, because the question the researcher is
 * answering is identical. What differs is where the answer is written.
 * Everywhere else a control's settings belong to the codebook attribute, keyed
 * to the `component` the codebook records for it. Here `component` and
 * `parameters` are the composer FIELD's (`ComposerFormFieldSchema`), so one
 * attribute can be a date picker bounded by two dates on this form and a
 * relative window on the next — and a block written to the codebook would be
 * authored against a control the codebook does not have.
 *
 * So this registers a `parameters` field on the ROW's own form, and everything
 * it writes is saved with the row.
 *
 * It registers whether or not the chosen control takes settings, and renders
 * nothing when it does not. That is what takes a block away: an unregistered
 * field contributes nothing to the row, which would leave the committed one
 * in place, whereas a registered field holding nothing DELETES the key.
 */
export default function ComposerFieldParameters({
  item,
}: ComposerFieldParametersProps) {
  const intl = useAppIntl();
  const { readOnly } = useStageEditorForm();
  const subject = useComposerFormSubject();
  const variables = useSubjectVariables(subject);
  // The row's live pair, falling back to the row it arrived as for the render
  // before those two controls have registered.
  const { variable, component } = useFormValue(['variable', 'component']);
  const shape = composerParameterShape(
    variables,
    variable ?? item.variable,
    component ?? item.component,
  );

  /**
   * What the row arrived holding, frozen for the life of this editor.
   *
   * A field's starting value is part of its REGISTRATION, and the row editor
   * is handed a freshly built copy of its row on every render — so reading it
   * inline would re-register the field on every keystroke elsewhere in the
   * dialog, and a field registering while a submit validates supersedes that
   * validation.
   */
  const [seeded] = useState(() =>
    isRecord(item.parameters) ? item.parameters : undefined,
  );
  const { fieldProps, meta } = useField({
    name: PARAMETERS_FIELD,
    initialValue: seeded,
  });
  const { value: held, onChange } = fieldProps;

  /**
   * Whether the row arrived INHERITING, frozen with the seed above.
   *
   * A field with no block of its own runs on the codebook attribute's, and
   * that is a live relationship: the attribute's block changes and this field
   * changes with it. So a row that arrived inheriting and was not touched is
   * written back without the key — the editor may not turn an inheritance into
   * a copy of itself just because its dialog was opened.
   */
  const [arrivedInheriting] = useState(() => !isRecord(item.parameters));

  /** What the codebook contributes to this control, or nothing. */
  const inherited = effectiveComposerParameters(
    variables,
    variable ?? item.variable,
    component ?? item.component,
    undefined,
  );

  /**
   * What the participant would meet, which is what the researcher is shown and
   * edits: the field's own block, or the attribute's while it has none.
   *
   * Shown rather than blanks, and edited as a whole: an override entered over
   * blanks replaced the inherited block with the one setting just typed, and
   * silently dropped everything else the attribute said.
   */
  const effective = isRecord(held) ? held : inherited;
  const inheriting = !isRecord(held) && inherited !== undefined;

  // Read at the moment of a write rather than closed over, so a handler built
  // one render ago still replaces a setting rather than reviving the block as
  // it was then.
  const heldRef = useRef(effective);
  heldRef.current = effective;
  const inheritedRef = useRef(inherited);
  inheritedRef.current = inherited;

  /**
   * Writes the block, or the inheritance it is still identical to.
   *
   * A row that arrived inheriting goes on inheriting until the researcher
   * changes something: written back as an explicit copy it would stop
   * following the attribute, which is a decision they never made.
   */
  const write = (next: Record<string, unknown> | undefined) => {
    onChange(
      arrivedInheriting && sameParameters(next, inheritedRef.current)
        ? undefined
        : next,
    );
  };

  /**
   * Once the save has refused this block, its complaints stay on the controls
   * that earned them until each is answered.
   *
   * The refusal itself arrives as a field error and is cleared by the next
   * write, which would take every message with it — including the one about
   * the setting the researcher has not reached yet. Latching it and
   * recomputing the issues live means a corrected control goes quiet and an
   * uncorrected one does not.
   */
  const [refused, setRefused] = useState(false);
  const refusedNow = (meta.errors?.length ?? 0) > 0;
  useEffect(() => {
    if (refusedNow) setRefused(true);
  }, [refusedNow]);

  /**
   * A control change makes what was authored for the old control meaningless
   * rather than portable: the two date schemas are strict about their own
   * keys, so a `min` beside a relative picker is a field it refuses outright.
   * Only the new shape's keys survive — and a control that takes no settings
   * at all leaves nothing, which is what deletes the key.
   *
   * Deliberately does nothing on the first render: the row arrives with a
   * pairing that is already saved, and re-deciding it here would rewrite a
   * block nobody touched.
   */
  const seenShape = useRef(shape);
  const writeRef = useRef(write);
  writeRef.current = write;
  useEffect(() => {
    if (seenShape.current === shape) return;
    seenShape.current = shape;
    setRefused(false);
    writeRef.current(
      shape === null ? undefined : parametersForShape(shape, heldRef.current),
    );
  }, [shape]);

  if (shape === null) return null;

  const issues =
    refused || refusedNow ? validateParameters(shape, effective) : NO_ISSUES;
  const blockMessages = issues[PARAMETERS_BLOCK] ?? [];

  return (
    <fieldset
      className="mb-8 min-w-0"
      // What a refusal naming this block scrolls to; see `focusFirstError`.
      data-field-name={PARAMETERS_FIELD}
      aria-invalid={blockMessages.length > 0 || undefined}
    >
      <legend className="font-heading mb-2 font-bold">
        {intl.formatMessage(networkCanvasMessages.fieldParametersLegend)}
      </legend>
      <p className="text-muted mb-4 text-sm">
        {intl.formatMessage(networkCanvasMessages.fieldParametersDescription)}
      </p>
      {/* Said, rather than left to look like something the researcher wrote:
          these are the attribute's, this field follows them, and changing any
          of them is what makes the field keep a set of its own. */}
      {inheriting && (
        <p className="text-muted mb-4 text-sm">
          {intl.formatMessage(networkCanvasMessages.fieldParametersInherited, {
            attributeName: variableDisplayName(
              variables,
              asText(variable ?? item.variable) ?? '',
            ),
          })}
        </p>
      )}
      {blockMessages.length > 0 && (
        <ul className="text-destructive mb-3 list-disc pl-5">
          {blockMessages.map((message) => (
            <li key={message}>
              {formatMessageError(message, intl) ?? message}
            </li>
          ))}
        </ul>
      )}
      <VariableParameterFields
        shape={shape}
        parameters={effective}
        onChange={(key, value) => {
          write(
            parametersForShape(
              shape,
              parametersWith(shape, heldRef.current, key, value),
            ),
          );
        }}
        issues={issues}
        readOnly={readOnly}
      />
    </fieldset>
  );
}
