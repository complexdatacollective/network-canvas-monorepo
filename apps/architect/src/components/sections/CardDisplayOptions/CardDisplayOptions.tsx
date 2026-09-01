import { compose } from 'react-recompose';

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

import withDisabledAssetRequired from '../../enhancers/withDisabledAssetRequired';
import getVariableOptionsGetter from '../SortOptionsForExternalData/getVariableOptionsGetter';

const DISPLAY_PROPERTIES: PropertyField[] = [
  { fieldName: 'variable', label: 'Attribute' },
  {
    fieldName: 'label',
    control: 'input',
    label: 'Label',
    placeholder: 'Label',
  },
];

// A row's own cells cannot block the save (see RowField), and a display
// property missing either member survives `prune` to fail the roster stage's
// schema.
const DISPLAY_PROPERTIES_VALIDATION = {
  completeRows: completeRows(DISPLAY_PROPERTIES),
};

type CardDisplayOptionsProps = StageEditorSectionProps & {
  dataSource?: string;
  disabled: boolean;
};
const CardDisplayOptions = ({
  dataSource,
  disabled,
}: CardDisplayOptionsProps) => {
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
      title="Card display"
      description="Configure how roster cards are displayed to participants."
      toggleable
      defaultOpen={hasCardDisplayOptions}
      disabled={disabled}
    >
      <Alert variant="info" className="my-7">
        <AlertDescription>
          Cards will use the <strong>name</strong> attribute from your external
          data as the main card title.
        </AlertDescription>
      </Alert>
      {maxVariableOptions === 0 && (
        <Paragraph>
          <em>
            Your external data does not seem to contain any usable attributes.
            Is it correctly formatted?
          </em>
        </Paragraph>
      )}
      {/* Mounted unconditionally, including while the roster's variables are
          still loading (or if the asset can no longer be parsed). The stage
          saves the registered fields only, so a field that never mounts for
          an already-configured value silently deletes it; `maxItems` of 0
          still hides the add affordance, which is all the empty case needs. */}
      <ArchitectArrayField
        name="cardOptions.additionalProperties"
        label="Additional display properties"
        hint="Choose any additional roster attributes that will help participants recognize an alter."
        component={MultiSelect}
        addButtonLabel="Add new display property"
        initialValue={initialAdditionalProperties}
        maxItems={maxVariableOptions}
        properties={DISPLAY_PROPERTIES}
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
