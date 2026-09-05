import { compose } from 'react-recompose';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import MultiSelect, {
  completeRows,
  type ItemValue,
  type PropertyField,
} from '~/components/Form/arrayFields/MultiSelect';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import useVariablesFromExternalData from '~/hooks/useVariablesFromExternalData';
import { type MessageConfig, formatConfig } from '~/i18n/formatConfig';

import withDisabledAssetRequired from '../../enhancers/withDisabledAssetRequired';
import getVariableOptionsGetter from '../SortOptionsForExternalData/getVariableOptionsGetter';
const additionalMessages = defineMessages({
  addNewDisplayProperty: {
    id: 'architect.additional.sections.cardDisplayOptions.cardDisplayOptions.addNewDisplayProperty',
    defaultMessage: 'Add new display property',
    description:
      'The addButtonLabel text in components / sections / CardDisplayOptions / CardDisplayOptions.',
  },
});
const configMessages = defineMessages({
  attribute: {
    id: 'architect.sections.cardDisplayOptions.cardDisplayOptions.config.attribute',
    defaultMessage: 'Attribute',
    description:
      'Presentation label or description in components/sections/CardDisplayOptions/CardDisplayOptions.tsx. Identifiers are not translated.',
  },
  label: {
    id: 'architect.sections.cardDisplayOptions.cardDisplayOptions.config.label',
    defaultMessage: 'Label',
    description:
      'Presentation label or description in components/sections/CardDisplayOptions/CardDisplayOptions.tsx. Identifiers are not translated.',
  },
});
const messages = defineMessages({
  cardDisplay: {
    id: 'architect.sections.cardDisplayOptions.cardDisplayOptions.cardDisplay',
    defaultMessage: 'Card display',
    description:
      'The title text in components / sections / CardDisplayOptions / CardDisplayOptions.',
  },
  configureHowRosterCardsAreDisplayed: {
    id: 'architect.sections.cardDisplayOptions.cardDisplayOptions.configureHowRosterCardsAreDisplayed',
    defaultMessage: 'Configure how roster cards are displayed to participants.',
    description:
      'The description text in components / sections / CardDisplayOptions / CardDisplayOptions.',
  },
  cardsWillUseTheNameAttribute: {
    id: 'architect.sections.cardDisplayOptions.cardDisplayOptions.cardsWillUseTheNameAttribute',
    defaultMessage:
      'Cards will use the <strong>name</strong> attribute from your external data as the main card title.',
    description:
      'Visible text in components / sections / CardDisplayOptions / CardDisplayOptions.',
  },
  yourExternalDataDoesNotSeem: {
    id: 'architect.sections.cardDisplayOptions.cardDisplayOptions.yourExternalDataDoesNotSeem',
    defaultMessage:
      'Your external data does not seem to contain any usable attributes. Is it correctly formatted?',
    description:
      'Visible text in components / sections / CardDisplayOptions / CardDisplayOptions.',
  },
  additionalDisplayProperties: {
    id: 'architect.sections.cardDisplayOptions.cardDisplayOptions.additionalDisplayProperties',
    defaultMessage: 'Additional display properties',
    description:
      'The label text in components / sections / CardDisplayOptions / CardDisplayOptions.',
  },
  chooseAnyAdditionalRosterAttributesThat: {
    id: 'architect.sections.cardDisplayOptions.cardDisplayOptions.chooseAnyAdditionalRosterAttributesThat',
    defaultMessage:
      'Choose any additional roster attributes that will help participants recognize an alter.',
    description:
      'The hint text in components / sections / CardDisplayOptions / CardDisplayOptions.',
  },
});

const DISPLAY_PROPERTIES: MessageConfig<PropertyField>[] = [
  { fieldName: 'variable', label: configMessages.attribute },
  {
    fieldName: 'label',
    control: 'input',
    label: configMessages.label,
    placeholder: configMessages.label,
  },
];

// A row's own cells cannot block the save (see RowField), and a display
// property missing either member survives `prune` to fail the roster stage's
// schema.

type CardDisplayOptionsProps = StageEditorSectionProps & {
  dataSource?: string;
  disabled: boolean;
};
const CardDisplayOptions = ({
  dataSource,
  disabled,
}: CardDisplayOptionsProps) => {
  const intl = useAppIntl();
  const DISPLAY_PROPERTIES_VALIDATION = {
    completeRows: completeRows(formatConfig(DISPLAY_PROPERTIES, intl), intl),
  };
  const { variables: variableOptions } = useVariablesFromExternalData(
    dataSource,
    true,
  );
  const variableOptionsGetter = getVariableOptionsGetter(variableOptions);
  const maxVariableOptions = variableOptions.length;
  const hasCardDisplayOptions =
    useStageFormValue('cardOptions.additionalProperties') != null;
  const initialAdditionalProperties = useStageInitialValue<ItemValue[]>(
    'cardOptions.additionalProperties',
  );
  return (
    <Section
      title={intl.formatMessage(messages.cardDisplay)}
      description={intl.formatMessage(
        messages.configureHowRosterCardsAreDisplayed,
      )}
      toggleable
      defaultOpen={hasCardDisplayOptions}
      disabled={disabled}
    >
      <Alert variant="info" className="my-7">
        <AlertDescription>
          {intl.formatMessage(messages.cardsWillUseTheNameAttribute, {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </AlertDescription>
      </Alert>
      {maxVariableOptions === 0 && (
        <Paragraph>
          <em>{intl.formatMessage(messages.yourExternalDataDoesNotSeem)}</em>
        </Paragraph>
      )}
      {/* Mounted unconditionally, including while the roster's variables are
          still loading (or if the asset can no longer be parsed). The stage
          saves the registered fields only, so a field that never mounts for
          an already-configured value silently deletes it; `maxItems` of 0
          still hides the add affordance, which is all the empty case needs. */}
      <ArchitectArrayField
        name="cardOptions.additionalProperties"
        label={intl.formatMessage(messages.additionalDisplayProperties)}
        hint={intl.formatMessage(
          messages.chooseAnyAdditionalRosterAttributesThat,
        )}
        component={MultiSelect}
        addButtonLabel={intl.formatMessage(
          additionalMessages.addNewDisplayProperty,
        )}
        initialValue={initialAdditionalProperties}
        maxItems={maxVariableOptions}
        properties={formatConfig(DISPLAY_PROPERTIES, intl)}
        validation={DISPLAY_PROPERTIES_VALIDATION}
        options={(fieldName: string, rowValues: unknown, allValues: unknown) =>
          variableOptionsGetter(
            fieldName,
            rowValues,
            allValues as Array<Record<string, unknown>>,
          )
        }
      />
    </Section>
  );
};

type GatedProps = StageEditorSectionProps & { dataSource?: string };

/**
 * `compose` is hoisted to module scope so the gated component keeps a stable
 * identity across renders — `dataSource` is read via `useStageFormValue` in
 * the wrapper below.
 */
const GatedCardDisplayOptions = compose<CardDisplayOptionsProps, GatedProps>(
  withDisabledAssetRequired,
)(CardDisplayOptions);

const CardDisplayOptionsWithDataSource = (props: StageEditorSectionProps) => {
  const dataSource = useStageFormValue<string | undefined>('dataSource');
  return <GatedCardDisplayOptions {...props} dataSource={dataSource} />;
};

export default CardDisplayOptionsWithDataSource;
