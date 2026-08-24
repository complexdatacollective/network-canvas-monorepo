import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import Options, {
  optionsValidation,
  type OptionValue,
} from '~/components/Form/arrayFields/Options';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import { getLockedOptions } from '~/components/Options/getLockedOptions';
import LockedOptions from '~/components/Options/LockedOptions';
import Parameters from '~/components/Parameters';
import { asParameterValues } from '~/components/Parameters/parameterValues';
import {
  isBooleanWithOptions,
  isOrdinalOrCategoricalType,
  isVariableTypeWithParameters,
} from '~/config/variables';
import { documentationLinks } from '~/utils/documentationLinks';
import { getFieldId } from '~/utils/issues';

import BooleanChoice from '../../BooleanChoice';
import ExternalLink from '../../ExternalLink';
import { toSelectOptions } from './helpers';
import type { FieldHandlers } from './withFieldsHandlers';

/** Stable empty list: `initialValue` is a register-effect dependency. */
const NO_OPTIONS: OptionValue[] = [];

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asOptions = (value: unknown): OptionValue[] =>
  Array.isArray(value) ? (value as OptionValue[]) : NO_OPTIONS;

type SharedProps = {
  entity?: string | null;
  type?: string | null;
  /**
   * The row being edited, already merged with its codebook variable. Every
   * control seeds its `initialValue` from here — `getFormValues()` reports
   * registered fields only, so a field that registers empty would blank the
   * property it owns when the dialog saves.
   */
  item: Record<string, unknown>;
  /** The variable/input-control state both editors already own. */
  fields: FieldHandlers;
  /**
   * Whether a section with no single owning field carries a group heading.
   * NetworkComposer's attribute dialog needs those headings because it has no
   * other structure; the Form field editor sits inside a titled stage editor.
   */
  withSectionTitles?: boolean;
};

/**
 * The attribute picker both field editors open with. Its hint is the only
 * researcher-facing difference: the composer's picker also creates codebook
 * attributes, and says so.
 */
export const VariablePickerSection = ({
  entity = null,
  type = null,
  item,
  fields,
  hint,
}: SharedProps & { hint: ReactNode }) => (
  <Section layout="vertical" id={getFieldId('variable')}>
    <ArchitectField
      name="variable"
      label="Attribute"
      hint={hint}
      component={VariablePickerControl}
      initialValue={asString(item.variable)}
      validation={{ required: true }}
      entity={entity ?? undefined}
      type={type ?? undefined}
      options={fields.variableOptions}
      onCreateOption={fields.handleNewVariable}
    />
  </Section>
);

/**
 * Everything that DEFINES a codebook attribute: which input control collects
 * it, and the option list or parameters that control needs.
 *
 * Both field editors — the Form stage's `FieldFields` and NetworkComposer's
 * `ComposerAttributeFields` — render exactly this, over the same
 * `useFieldHandlers` state. They were two copies until the copies started
 * answering the same researcher question in different words; the differences
 * that remain (section headings, the picker's hint, what each editor adds
 * around this) are props and surrounding markup, not a second implementation.
 */
const VariableDefinitionFields = ({
  item,
  fields,
  withSectionTitles = false,
}: SharedProps) => {
  const {
    variable,
    variableType,
    isNewVariable,
    component,
    componentOptions,
    existingVariables,
    interfaceOwnedOptionSet,
  } = fields;
  const lockedOptions = getLockedOptions(
    existingVariables,
    variable,
    interfaceOwnedOptionSet,
  );

  return (
    <>
      <Section
        layout="vertical"
        id={getFieldId('component')}
        disabled={!variable}
        title={!variable ? 'Input control' : undefined}
      >
        <ArchitectField
          name="component"
          label="Input control"
          hint={
            <>
              How the answer is collected. For detailed information about these
              options, see our{' '}
              <ExternalLink href={documentationLinks.inputControls}>
                documentation
              </ExternalLink>
              .
            </>
          }
          component={NativeSelectField}
          initialValue={asString(item.component)}
          validation={{ required: true }}
          placeholder="Select an input control"
          // A NEW variable keeps the authored order, which reads as a
          // progression from simplest control to most involved. An existing
          // variable's list is a lookup — the researcher knows what they want
          // and is finding it — so it is alphabetised (within each group,
          // since the list may still be grouped by type).
          options={toSelectOptions(componentOptions, {
            sorted: !isNewVariable,
          })}
        />
        {isNewVariable && variableType && (
          <Alert variant="info" className="my-7">
            <AlertDescription>
              The selected input control will cause this attribute to be defined
              as type <strong>{variableType}</strong>. Once set, this cannot be
              changed (although you may change the input control within this
              type).
            </AlertDescription>
          </Alert>
        )}
        {!isNewVariable && variableType && (
          <Alert variant="warning" className="my-7">
            <AlertTitle>Attribute type is locked</AlertTitle>
            <AlertDescription>
              A pre-existing attribute is currently selected. You cannot change
              an attribute type after it has been created, so only{' '}
              <strong>{variableType}</strong> compatible input controls can be
              selected above. If you would like to use a different input control
              type, you will need to create a new attribute.
            </AlertDescription>
          </Alert>
        )}
      </Section>

      {isOrdinalOrCategoricalType(variableType) && (
        <Section
          layout="vertical"
          id={getFieldId('options')}
          title={
            lockedOptions && withSectionTitles
              ? 'Categorical/Ordinal options'
              : undefined
          }
        >
          {lockedOptions ? (
            <LockedOptions options={lockedOptions} />
          ) : (
            <ArchitectArrayField
              name="options"
              label="Categorical/Ordinal options"
              hint="The input type you selected indicates that this is a categorical or ordinal attribute. Create a minimum of two possible values for the participant to choose between."
              component={Options}
              addButtonLabel="Create new option"
              initialValue={asOptions(item.options)}
              validation={optionsValidation}
            />
          )}
        </Section>
      )}
      {isBooleanWithOptions(component) && (
        // BooleanChoice writes to the `options` field, so anchor it there (it
        // is mutually exclusive with the Categorical/Ordinal options section
        // above, so the shared id never collides at runtime).
        <Section layout="vertical" id={getFieldId('options')}>
          <BooleanChoice initialValue={asOptions(item.options)} />
        </Section>
      )}
      {isVariableTypeWithParameters(variableType) && (
        <Section
          layout="vertical"
          id={getFieldId('parameters')}
          title={withSectionTitles ? 'Input Options' : undefined}
        >
          <Parameters
            type={variableType}
            component={component ?? ''}
            name="parameters"
            initialParameters={asParameterValues(item.parameters)}
          />
        </Section>
      )}
    </>
  );
};

export default VariableDefinitionFields;
