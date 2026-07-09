import type { UnknownAction } from '@reduxjs/toolkit';
import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import FrescoBooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import { Row, Section } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';

import IssueAnchor from '../IssueAnchor';

const FORM_PROPERTY = 'behaviours.automaticLayout';

const AutomaticLayout = ({ form }: StageEditorSectionProps) => {
  const dispatch = useAppDispatch();
  const formSelector = useMemo(() => formValueSelector(form), [form]);
  const formValue = useSelector(
    (state: RootState) => !!formSelector(state, FORM_PROPERTY),
  );

  const [useAutomaticLayout, setUseAutomaticLayout] = useState(formValue);

  const handleChooseLayoutMode = (nextValue: boolean | undefined) => {
    const useNextValue = !!nextValue;
    dispatch(change(form, FORM_PROPERTY, useNextValue) as UnknownAction);
    setUseAutomaticLayout(useNextValue);
  };

  return (
    <Section
      title="Layout Mode"
      summary={
        <p>
          Interviewer offers two modes for positioning nodes on the sociogram:
          &quot;Manual&quot;, and &quot;Automatic&quot;.
        </p>
      }
    >
      <Row>
        <IssueAnchor
          fieldName="behaviours.automaticLayout"
          description="Layout mode"
        />
        <p>
          <strong>Automatic mode</strong> positions nodes when the stage is
          first shown by simulating physical forces such as attraction and
          repulsion. This simulation can be paused and resumed within the
          interview. When paused, the position of nodes can be adjusted
          manually.
        </p>
        <p>
          <strong>Manual mode</strong> first places all nodes into a
          &quot;bucket&quot; at the bottom of the screen, from which the
          participant can drag nodes to their desired position.
        </p>
      </Row>
      <Row>
        <FrescoBooleanField
          onChange={handleChooseLayoutMode}
          value={useAutomaticLayout}
          options={[
            {
              value: false,
              label:
                '**Manual mode**\n\nParticipants must position their alters manually.',
            },
            {
              value: true,
              label:
                '**Automatic mode**\n\nA force-directed layout positions nodes automatically.',
            },
          ]}
          noReset
        />
      </Row>
    </Section>
  );
};

export default AutomaticLayout;
