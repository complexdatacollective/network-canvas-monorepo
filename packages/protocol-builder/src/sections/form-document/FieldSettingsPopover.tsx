import { Pencil, Trash2 } from 'lucide-react';
import { type ReactNode, type RefObject, useMemo, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { formFieldPlacement, type Variable } from '@codaco/protocol-validation';

import CodebookVariableValidationSection from '../../codebook/validation/CodebookVariableValidationSection.tsx';
import { parameterShapeFor } from '../../codebook/variableParameters.ts';
import {
  buildVariableUsageIndex,
  variableRoleKey,
} from '../../codebook/variableRoles.ts';
import { BlockSettingsPopover } from '../../fields/BlockSettingsPopover.tsx';
import VariablePickerField from '../../fields/VariablePickerField.tsx';
import {
  VariablePill,
  variablePillKindOf,
} from '../../fields/VariablePill.tsx';
import { useLanguageNaming } from '../../localization/LanguageNaming.tsx';
import { resolveTranslation } from '../../localization/localizedText.ts';
import { controlsForType, isOptionType } from '../collectableTypes.ts';
import { controlOf, isRecord } from './fieldDefinition.ts';
import { FieldOptionsDialog } from './FieldOptionsDialog.tsx';
import {
  fieldAttributeGroup,
  roleMapFor,
  useFormDocumentEnvironment,
  useFormStageEnvironment,
} from './formDocumentEnvironment.ts';
import { formDocumentMessages as messages } from './formDocumentMessages.ts';
import { fieldCollecting, variablesPlacedBy } from './formDocumentValue.ts';

type FieldSettingsPopoverProps = Readonly<{
  attributes: Readonly<{
    fieldId: string;
    variable: string;
    showValidationHints: boolean;
  }>;
  variable: Readonly<Variable>;
  update: (
    changes: Partial<
      Readonly<{
        fieldId: string;
        variable: string;
        showValidationHints: boolean;
      }>
    >,
  ) => void;
  remove: () => void;
  /** Selects the field, with the keyboard in the text. */
  select: () => void;
  /** Selects the field and leaves focus where it is, as the settings open. */
  selectKeepingFocus: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Given the panel of the settings while they are drawn, for the block. */
  panelRef?: RefObject<HTMLElement | null>;
}>;

/** The names of the other stages that collect or read `variableId`. */
function useOtherStagesUsing(variableId: string): readonly string[] {
  const { localization, locale } = useFormDocumentEnvironment();
  const { protocolContext, subject, stageId } = useFormStageEnvironment();
  return useMemo(() => {
    if (subject === undefined) return [];
    const hits =
      buildVariableUsageIndex(protocolContext)[
        variableRoleKey(subject, variableId)
      ] ?? [];
    const labels = new Set<string>();
    for (const hit of hits) {
      const [root, index] = hit.path;
      if (root !== 'stages' || typeof index !== 'number') continue;
      const stage = protocolContext.orderedStages[index];
      if (stage === undefined || stage.id === stageId) continue;
      labels.add(resolveTranslation(stage.label, localization, locale).text);
    }
    return [...labels];
  }, [localization, locale, protocolContext, stageId, subject, variableId]);
}

/**
 * The settings button of a field (in its block's tab) and the field's
 * settings, attached to the button: the attribute that it collects, the
 * attribute's input control, options, control settings and validation,
 * whether the field shows its validation hints, and Delete field. The control, options, settings and validation are
 * the attribute's, so a change here applies wherever the attribute is
 * collected; the note at the end says so, and names the other stages that use
 * it. Placed as an asset block's settings are (`BlockSettingsPopover`).
 */
export function FieldSettingsPopover({
  attributes,
  variable,
  update,
  remove,
  select,
  selectKeepingFocus,
  open,
  onOpenChange,
  panelRef,
}: FieldSettingsPopoverProps) {
  const intl = useAppIntl();
  const environment = useFormDocumentEnvironment();
  const stage = useFormStageEnvironment();
  const { name: languageName } = useLanguageNaming();
  const { fieldId, variable: variableId, showValidationHints } = attributes;
  const [controlRefusal, setControlRefusal] = useState<string | undefined>();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const otherStages = useOtherStagesUsing(variableId);

  const roleMap = useMemo(
    () => roleMapFor(stage.protocolContext, stage.rules.answeredFor),
    [stage.protocolContext, stage.rules.answeredFor],
  );
  const message = environment.content[environment.locale];
  const attributeGroup = useMemo(
    () =>
      fieldAttributeGroup({
        intl,
        subject: stage.subject,
        variables: environment.variables,
        roleMap,
        rules: stage.rules,
        taken: variablesPlacedBy(environment.fields, message).filter(
          (placed) => placed !== variableId,
        ),
        held: variableId,
      }),
    [
      environment.fields,
      stage.rules,
      stage.subject,
      environment.variables,
      intl,
      message,
      roleMap,
      variableId,
    ],
  );

  const component = controlOf(variable);
  const controls = controlsForType(variable.type).map(({ value, label }) => ({
    value,
    label: intl.formatMessage(label),
  }));
  const options: unknown = Reflect.get(variable, 'options');
  const optionLabels = Array.isArray(options)
    ? options.flatMap((option) =>
        isRecord(option)
          ? [
              resolveTranslation(
                option.label,
                environment.localization,
                environment.locale,
              ).text,
            ]
          : [],
      )
    : [];
  // An attribute with a list of answers (a categorical or ordinal one, or a
  // Boolean one with labels for yes and no) has options; a date or a number
  // has only the settings of its control.
  const hasOptions = optionLabels.length > 0 || isOptionType(variable.type);
  const hasSettings =
    component !== undefined &&
    parameterShapeFor(variable.type, component) !== null;

  // The other languages whose forms contain this field, with a document of
  // their own or the one that they fall back to: its settings are shared
  // with them.
  const otherLanguages = [
    ...formFieldPlacement(environment.content, environment.localization),
  ]
    .filter(
      ([language, placed]) =>
        language !== environment.locale && placed.has(fieldId),
    )
    .map(([language]) => languageName(language));

  const pill = (
    <VariablePill
      name={variable.name}
      kind={variablePillKindOf(variable.type)}
      size="inline"
    />
  );
  const note: ReactNode[] = [
    intl.formatMessage(messages.sharedNote, { attribute: pill }),
  ];
  if (otherStages.length > 0) {
    note.push(
      ' ',
      intl.formatMessage(messages.usedOnStages, {
        count: otherStages.length,
        stages: intl.formatList(
          otherStages.map((label) => `“${label}”`),
          { type: 'conjunction' },
        ),
      }),
    );
  }
  if (otherLanguages.length > 0) {
    note.push(
      ' ',
      intl.formatMessage(messages.otherLanguages, {
        languages: intl.formatList(otherLanguages, { type: 'conjunction' }),
      }),
    );
  }

  return (
    <>
      <BlockSettingsPopover
        name="Field settings"
        open={open}
        onOpenChange={onOpenChange}
        select={selectKeepingFocus}
        hidden={optionsOpen}
        {...(panelRef !== undefined && { panelRef })}
        popupProps={{ 'data-field-settings': fieldId }}
      >
        <div className="flex w-[36rem] max-w-full flex-col gap-4">
          <div>
            <UnconnectedField
              name={`${fieldId}-attribute`}
              component={VariablePickerField}
              label={intl.formatMessage(messages.attributeLabel)}
              hint={intl.formatMessage(messages.attributeHint)}
              options={attributeGroup.options}
              unavailableDisplay="inPlace"
              value={variableId}
              onChange={(next) => {
                if (typeof next !== 'string' || next === variableId) {
                  return;
                }
                // The form's field for that attribute in another
                // language is this field from now on.
                const existing = fieldCollecting(environment.fields, next);
                update(
                  existing === undefined || existing.id === fieldId
                    ? { variable: next }
                    : { variable: next, fieldId: existing.id },
                );
              }}
            />
          </div>
          {component === undefined ? (
            <p className="text-destructive text-sm">
              {intl.formatMessage(messages.noInputControl)}
            </p>
          ) : (
            <div>
              <UnconnectedField
                name={`${fieldId}-control`}
                component={SelectField}
                label={intl.formatMessage(messages.inputControlLabel)}
                hint={intl.formatMessage(messages.inputControlHint)}
                options={controls}
                value={component}
                {...(controlRefusal === undefined
                  ? {}
                  : { errors: [controlRefusal], showErrors: true })}
                onChange={(next) => {
                  if (typeof next !== 'string' || next === component) {
                    return;
                  }
                  setControlRefusal(undefined);
                  void (async () => {
                    const outcome = await stage.writes.setControl(
                      variableId,
                      next,
                    );
                    if (outcome.status === 'refused') {
                      setControlRefusal(outcome.message);
                    }
                  })();
                }}
              />
            </div>
          )}
          {(isOptionType(variable.type) ||
            variable.type === 'boolean' ||
            hasSettings) && (
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-heading text-base font-bold">
                    {intl.formatMessage(
                      hasOptions
                        ? messages.optionsLabel
                        : messages.controlSettingsLabel,
                    )}
                  </h3>
                  {optionLabels.length > 0 && (
                    <p className="text-sm text-current/70">
                      {intl.formatMessage(messages.optionsHint)}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="text"
                  icon={<Pencil aria-hidden />}
                  onClick={() => setOptionsOpen(true)}
                >
                  {intl.formatMessage(
                    hasOptions
                      ? messages.editOptions
                      : messages.editControlSettings,
                  )}
                </Button>
              </div>
              {optionLabels.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {optionLabels.map((label, index) => (
                    <li
                      // Labels can repeat while they are being written.
                      // oxlint-disable-next-line react/no-array-index-key
                      key={`${index}:${label}`}
                      className="bg-surface-1 rounded-full px-3 py-1 text-sm"
                    >
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <CodebookVariableValidationSection
            subject={stage.subject}
            variableId={variableId}
          />
          <div>
            <UnconnectedField
              name={`${fieldId}-validation-hints`}
              component={ToggleField}
              label={intl.formatMessage(messages.validationHintsLabel)}
              hint={intl.formatMessage(messages.validationHintsHint)}
              value={showValidationHints}
              onChange={(next) =>
                update({ showValidationHints: next === true })
              }
            />
          </div>
          <Alert variant="info">
            <AlertDescription>{note}</AlertDescription>
          </Alert>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              color="destructive"
              icon={<Trash2 aria-hidden />}
              onClick={remove}
              // The last of the settings: Tab goes back to the field rather
              // than on to the page behind them.
              onKeyDown={(event) => {
                if (event.key !== 'Tab' || event.shiftKey) return;
                event.preventDefault();
                select();
              }}
            >
              {intl.formatMessage(messages.deleteField)}
            </Button>
          </div>
        </div>
      </BlockSettingsPopover>
      {optionsOpen && component !== undefined && (
        <FieldOptionsDialog
          variableId={variableId}
          variable={variable}
          component={component}
          onClose={() => {
            setOptionsOpen(false);
            select();
          }}
        />
      )}
    </>
  );
}
