import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { Section } from '~/components/EditorLayout';
import MultiSelect from '~/components/Form/MultiSelect';
import { useAppDispatch } from '~/ducks/hooks';

type BucketSortOrderSectionProps = {
  form: string;
  disabled?: boolean;
  maxItems?: number;
  optionGetter: () => Array<{ label: string; value: string }>;
  summary?: React.ReactNode;
};

const getDefaultSummary = () => (
  <p>
    Nodes are stacked in the bucket before they are placed by the participant.
    You may optionally configure a list of rules to determine how nodes are
    sorted in the bucket when the task starts, which will determine the order
    that your participant places them into bins. Interviewer will default to
    using the order in which nodes were named.
  </p>
);

const BucketSortOrderSection = ({
  form,
  disabled = false,
  maxItems = 5,
  optionGetter,
  summary = getDefaultSummary(),
}: BucketSortOrderSectionProps) => {
  const dispatch = useAppDispatch();
  const formSelector = useMemo(() => formValueSelector(form), [form]);
  const hasBucketSortOrder = useSelector((state: Record<string, unknown>) =>
    formSelector(state, 'bucketSortOrder'),
  );

  const handleToggleChange = (nextState: boolean) => {
    if (!nextState) {
      dispatch(change(form, 'bucketSortOrder', null));
    }

    return true;
  };

  return (
    <Section
      title="Bucket Sort Order"
      summary={summary}
      toggleable
      disabled={disabled}
      startExpanded={!!hasBucketSortOrder}
      handleToggleChange={handleToggleChange}
      layout="vertical"
    >
      <Alert variant="info" className="my-7">
        <AlertDescription>
          <p>
            Use the asterisk property to sort by the order that nodes were
            created.
          </p>
        </AlertDescription>
      </Alert>
      <MultiSelect
        name="bucketSortOrder"
        properties={[{ fieldName: 'property' }, { fieldName: 'direction' }]}
        maxItems={maxItems}
        options={optionGetter}
      />
    </Section>
  );
};

export default BucketSortOrderSection;
