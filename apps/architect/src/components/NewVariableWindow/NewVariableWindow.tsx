import { values } from 'es-toolkit/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  CreateFormFieldProps,
  FieldValue,
} from '@codaco/fresco-ui/form/Field/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import type {
  Variable,
  VariableOption,
  VariableSynthetic,
  VariableType,
} from '@codaco/protocol-validation';
import { ensureError } from '@codaco/shared-consts';
import type { SyntheticVariableDraft } from '~/components/Codebook/VariableSynthetic/draft';
import {
  NO_IMPLIED_RULES,
  type VariableImpliedRules,
} from '~/components/Codebook/VariableSynthetic/impliedRules';
import { VariableSyntheticProvider } from '~/components/Codebook/VariableSynthetic/VariableSyntheticProvider';
import {
  SYNTHETIC_SECTION_TITLE,
  VariableSyntheticSection,
} from '~/components/Codebook/VariableSynthetic/VariableSyntheticSection';
import DialogForm from '~/components/DialogForm/DialogForm';
import { Section, Subsection } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import Options, {
  optionsValidation,
  type OptionValue,
} from '~/components/Form/arrayFields/Options';
import LockedOptions from '~/components/Options/LockedOptions';
import {
  isOrdinalOrCategoricalType,
  VARIABLE_OPTIONS,
} from '~/config/variables';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { createVariableAsync } from '~/ducks/modules/protocol/codebook';
import { getVariablesForSubject } from '~/selectors/codebook';
import { getFieldId } from '~/utils/issues';
import safeName from '~/utils/safeName';

import {
  prospectiveImpliedRules,
  type OwningStageDraft,
} from './prospectiveImpliedRules';

const FORM_ID = 'create-new-variable';

/**
 * A seeded option list the researcher may not edit. `readonly` because the
 * canonical interface-owned sets (`INTERFACE_OWNED_OPTION_SETS`) are declared
 * that way in `@codaco/protocol-validation` and nothing here may mutate one —
 * the alternative, copying each set at its call site, would put the canonical
 * data back into several hands.
 */
export type LockedVariableOptions = readonly VariableOption[];

/** Stable empty list: `initialValue` is a register-effect dependency. */
const NO_OPTIONS: OptionValue[] = [];

type VariableNameFieldProps = CreateFormFieldProps<
  string,
  'input',
  {
    // Narrows the `size` an <input> would otherwise contribute (a number) to
    // the control-size scale `InputField` expects.
    size?: 'sm' | 'md' | 'lg' | 'xl';
  }
>;

/**
 * Variable names are NMTOKENs, so the characters `safeName` strips can never
 * be part of one, so the value is filtered on change rather than only
 * validated.
 */
const VariableNameField = ({
  value,
  onChange,
  ...props
}: VariableNameFieldProps) => (
  <InputField
    {...props}
    value={value ?? ''}
    onChange={(nextValue) => onChange?.(safeName(nextValue ?? ''))}
  />
);

export type Entity = 'node' | 'edge' | 'ego';

type NewVariableFieldsProps = {
  existingVariableNames: string[];
  variableTypeOptions: typeof VARIABLE_OPTIONS;
  initialValues: Record<string, unknown>;
  typeLocked: boolean;
  lockedOptions: LockedVariableOptions | null;
  /** The synthetic block being authored alongside the definition. */
  synthetic: VariableSynthetic | undefined;
  onSyntheticChange: (next: VariableSynthetic | undefined) => void;
  /** What the stage this attribute is being created for will impose on it. */
  implied: VariableImpliedRules;
};

const NewVariableFields = ({
  existingVariableNames,
  variableTypeOptions,
  initialValues,
  typeLocked,
  lockedOptions,
  synthetic,
  onSyntheticChange,
  implied,
}: NewVariableFieldsProps) => {
  const variableType = useFormStore((state) => {
    const value = state.getFieldState('type')?.value;
    return typeof value === 'string' ? value : undefined;
  });
  // The synthetic editor describes the variable being defined right now, so it
  // reads the live fields rather than the seed: choosing a type changes which
  // controls it offers, and adding an option gives that option a weight.
  const variableName = useFormStore((state) => {
    const value = state.getFieldState('name')?.value;
    return typeof value === 'string' ? value : '';
  });
  const variableOptions = useFormStore((state) => {
    const value = state.getFieldState('options')?.value;
    return Array.isArray(value) ? (value as OptionValue[]) : undefined;
  });
  const initialOptions = Array.isArray(initialValues.options)
    ? (initialValues.options as OptionValue[])
    : NO_OPTIONS;

  const draftVariable = useMemo<SyntheticVariableDraft | undefined>(() => {
    if (variableType === undefined) return undefined;
    return {
      name: variableName,
      // The select offers only the schema's own variable types.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      type: variableType as VariableType,
      ...(lockedOptions
        ? { options: lockedOptions }
        : variableOptions
          ? { options: variableOptions }
          : {}),
      ...(synthetic === undefined ? {} : { synthetic }),
    };
  }, [variableName, variableType, variableOptions, lockedOptions, synthetic]);

  /**
   * A block describes the values of ONE kind of attribute, so changing the kind
   * discards it. Without this, a chance-of-true authored for a boolean would
   * still be attached when the researcher switched the attribute to text, and
   * the schema would refuse the whole variable at save with nothing on screen
   * to say why.
   */
  const authoredForType = useRef(variableType);
  useEffect(() => {
    if (authoredForType.current === variableType) return;
    authoredForType.current = variableType;
    onSyntheticChange(undefined);
  }, [variableType, onSyntheticChange]);

  return (
    // The scope wraps the whole Section, and is rendered whether or not a type
    // has been chosen, so choosing one does not change the SHAPE of the tree
    // and remount every field inside it.
    <VariableSyntheticProvider
      variable={draftVariable}
      implied={implied}
      namePrefix="synthetic"
      onChange={onSyntheticChange}
    >
      <Section layout="vertical">
        <Subsection id={getFieldId('name')} title="Attribute Name">
          <ArchitectField
            name="name"
            label="Attribute name"
            hint="The attribute name is how you will reference the attribute elsewhere, including in exported data."
            component={VariableNameField}
            placeholder="e.g. Nickname"
            initialValue={
              typeof initialValues.name === 'string'
                ? initialValues.name
                : undefined
            }
            validation={{
              required: true,
              uniqueByList: existingVariableNames,
              allowedVariableName: true,
            }}
          />
        </Subsection>
        <Subsection id={getFieldId('type')} title="Attribute Type">
          <ArchitectField
            name="type"
            label="Attribute type"
            labelHidden
            component={StyledSelectField}
            placeholder="Select attribute type"
            options={variableTypeOptions}
            initialValue={
              typeof initialValues.type === 'string'
                ? initialValues.type
                : undefined
            }
            // Locked options only make sense for a categorical/ordinal type, so
            // lock the type selector too — otherwise a caller passing
            // lockedOptions without initialValues.type could switch away from
            // that type while the options and readOnly flag stay locked.
            disabled={typeLocked}
            validation={{ required: true }}
          />
        </Subsection>
        {isOrdinalOrCategoricalType(variableType) && (
          <Subsection id={getFieldId('options')} title="Options">
            {lockedOptions ? (
              <LockedOptions options={lockedOptions} />
            ) : (
              <ArchitectArrayField
                name="options"
                label="Options"
                hint="Create the values this input control offers the participant."
                component={Options}
                addButtonLabel="Create new option"
                initialValue={initialOptions}
                validation={optionsValidation}
              />
            )}
          </Subsection>
        )}
        {/*
        The synthetic sub-editor sits inside this Section so its disclosure and
        the options editor above share one scope: expanding it is what reveals
        the weight column on those options (spec, "Option weights reveal").
      */}
        {draftVariable !== undefined && (
          <Subsection
            id={getFieldId('synthetic')}
            title={SYNTHETIC_SECTION_TITLE}
          >
            <VariableSyntheticSection />
          </Subsection>
        )}
      </Section>
    </VariableSyntheticProvider>
  );
};

type NewVariableWindowProps = {
  show?: boolean;
  entity: Entity;
  type: string;
  allowVariableTypes?: string[] | null;
  onComplete: (variable: string) => void;
  onCancel: () => void;
  initialValues?: Record<string, unknown> | null;
  /** Pre-defined options that cannot be edited. When provided, the options section is read-only. */
  lockedOptions?: LockedVariableOptions | null;
  /**
   * Reads the stage this attribute is being created for, as its editor holds
   * it, beside the stage-relative path of the slot the attribute will fill. Together they
   * are what lets the synthetic sub-editor apply the rules that stage will
   * impose the moment the attribute exists — see `prospectiveImpliedRules`.
   * Both are absent where no stage owns the attribute (the Codebook's own "add
   * attribute" buttons), and then nothing is implied.
   */
  readOwningStage?: (() => OwningStageDraft | undefined) | null;
  slotPath?: string | null;
};

export default function NewVariableWindow({
  show = false,
  entity,
  type,
  allowVariableTypes = null,
  onComplete,
  onCancel,
  initialValues = null,
  lockedOptions = null,
  readOwningStage = null,
  slotPath = null,
}: NewVariableWindowProps) {
  const dispatch = useAppDispatch();
  // Memoize subject to avoid creating new object on every render, which breaks selector memoization
  const subject = useMemo(() => ({ entity, type }), [entity, type]);
  const existingVariables = useAppSelector((state) =>
    getVariablesForSubject(state, subject),
  );
  const existingVariableNames = useMemo(
    () => values(existingVariables).map(({ name }: Variable) => name),
    [existingVariables],
  );
  const filteredVariableOptions = useMemo(
    () =>
      allowVariableTypes
        ? VARIABLE_OPTIONS.filter(({ value: optionVariableType }) =>
            allowVariableTypes.includes(optionVariableType),
          )
        : VARIABLE_OPTIONS,
    [allowVariableTypes],
  );
  // Merge locked options into initial values if provided
  const mergedInitialValues = useMemo(() => {
    if (lockedOptions) {
      return { ...initialValues, options: lockedOptions };
    }
    return initialValues ?? {};
  }, [initialValues, lockedOptions]);

  /**
   * The synthetic block, held beside the form rather than in it.
   *
   * It is one opaque value with no control of its own to register — every
   * control inside the sub-editor writes into it — and the serialisation rule
   * is presence: `undefined` here means the created variable carries no
   * `synthetic` key at all (spec governing rule 4), which a registered field
   * holding `undefined` could not say.
   */
  const [synthetic, setSynthetic] = useState<VariableSynthetic | undefined>(
    undefined,
  );

  /**
   * Collected only while the window is open. The owning stage's draft changes
   * on every keystroke in its editor, and the reference walk behind this would
   * otherwise run on all of them to answer a question nobody is asking — the
   * window is mounted for the lifetime of the picker that owns it and merely
   * toggles `show`.
   */
  const implied = useMemo(
    () =>
      show
        ? prospectiveImpliedRules(readOwningStage?.(), slotPath, subject)
        : NO_IMPLIED_RULES,
    [show, readOwningStage, slotPath, subject],
  );

  const handleSubmit = useCallback(
    async (formValues: Record<string, FieldValue>) => {
      // Locked options are never rendered as a field, so they are carried over
      // from the seed rather than read back out of the form.
      const configuration = {
        ...mergedInitialValues,
        ...formValues,
        ...(synthetic === undefined ? {} : { synthetic }),
      };
      // Locked options belong to an interface-owned value set the researcher may
      // not edit; persist readOnly so the shared options editors enforce it.
      const withReadOnly = lockedOptions
        ? { ...configuration, readOnly: true }
        : configuration;

      try {
        // unwrap() re-throws the thunk's error (a duplicate or invalid name)
        // instead of resolving to a rejected action with no payload.
        const result = await dispatch(
          createVariableAsync({
            entity,
            type,
            configuration: withReadOnly as Partial<Variable>,
          }),
        ).unwrap();
        onComplete(result.variable);
      } catch (error) {
        // Keep the dialog open and say why, rather than closing on a failure.
        return {
          success: false as const,
          formErrors: [ensureError(error).message],
        };
      }
    },
    [
      dispatch,
      entity,
      type,
      onComplete,
      lockedOptions,
      mergedInitialValues,
      synthetic,
    ],
  );

  /**
   * Every open of this window creates a DIFFERENT variable, so each one needs
   * its own field store — the `key` DialogForm documents for exactly this.
   *
   * The window is mounted for the lifetime of the picker that owns it and only
   * toggles `show`, so without a key the store is shared across opens. What
   * normally hides that is `Modal`'s exit animation: it unmounts the form,
   * whose `useForm` cleanup resets the store. A close that is followed by
   * another open before that exit finishes cancels the removal, so the reset
   * never runs — and the next variable's fields then re-register over the
   * previous one's parked values, which `registerField` prefers over
   * `initialValue`. Creating a boolean variable straight after a categorical
   * one therefore reopened the window still holding `categorical`: the type
   * selector is locked against correcting it, so the options editor it reveals
   * could never be satisfied and the save was blocked for good. The quieter
   * case is worse — a boolean created straight after a TEXT one is stored as
   * text, a wrong-typed codebook variable with nothing on screen to show it.
   *
   * Bumped as the window OPENS (the React-documented adjust-state-on-prop-
   * change pattern) rather than on close, so the entering dialog is the fresh
   * one and a close still animates out.
   */
  const [wasShown, setWasShown] = useState(show);
  const [openCount, setOpenCount] = useState(0);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setOpenCount((count) => count + 1);
      // The synthetic block lives outside the keyed field store, so it has to
      // be cleared on the same edge the store is: the next open is a different
      // attribute, and must not inherit what the last one authored.
      setSynthetic(undefined);
    }
  }

  return (
    <DialogForm
      key={openCount}
      open={show}
      onClose={onCancel}
      title="Create New Attribute"
      formId={FORM_ID}
      submitLabel="Save and Close"
      onSubmit={handleSubmit}
      // The block below is held beside the form, so nothing the field store
      // compares can report it. Opened with its name and type already filled
      // in — which several stage attribute pickers do — a researcher who only
      // touched a generation parameter was dismissed without being asked.
      unregisteredDraft={() => synthetic !== undefined}
    >
      <NewVariableFields
        existingVariableNames={existingVariableNames}
        variableTypeOptions={filteredVariableOptions}
        initialValues={mergedInitialValues}
        typeLocked={!!initialValues?.type || !!lockedOptions}
        lockedOptions={lockedOptions}
        synthetic={synthetic}
        onSyntheticChange={setSynthetic}
        implied={implied}
      />
    </DialogForm>
  );
}
