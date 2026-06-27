import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import { Row, Section } from '~/components/EditorLayout';
import { Field as RichText } from '~/components/Form/Fields/RichText';
import TextField from '~/components/Form/Fields/Text';
import VideoInput from '~/components/Form/Fields/Video';
import ValidatedField from '~/components/Form/ValidatedField';
import IssueAnchor from '~/components/IssueAnchor';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';

type IntroScreenValue = {
  title?: string;
  text: string;
  videoAssetId?: string;
} | null;

const IntroScreen = ({ form }: StageEditorSectionProps) => {
  const dispatch = useAppDispatch();
  const formSelector = formValueSelector(form);

  const introScreen = useSelector(
    (state: RootState) =>
      formSelector(state, 'introScreen') as IntroScreenValue | undefined,
  );

  const isEnabled = introScreen !== null && introScreen !== undefined;

  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      if (newState) {
        dispatch(change(form, 'introScreen', { text: '' }));
        return true;
      }

      dispatch(change(form, 'introScreen', null));
      return true;
    },
    [dispatch, form],
  );

  return (
    <Section
      title="Intro Screen"
      summary={
        <p>
          Optionally show an introductory screen to participants before the
          family pedigree task begins.
        </p>
      }
      toggleable
      startExpanded={isEnabled}
      handleToggleChange={handleToggleChange}
    >
      <Row>
        <IssueAnchor fieldName="introScreen.title" description="Title" />
        <ValidatedField
          name="introScreen.title"
          component={TextField}
          validation={{}}
          componentProps={{ label: 'Title (optional)' }}
        />
      </Row>
      <Row>
        <IssueAnchor fieldName="introScreen.text" description="Body text" />
        <ValidatedField
          name="introScreen.text"
          component={RichText}
          validation={{ required: true }}
          componentProps={{ label: 'Body text' }}
        />
      </Row>
      <Row>
        <IssueAnchor
          fieldName="introScreen.videoAssetId"
          description="Video (optional)"
        />
        <ValidatedField
          name="introScreen.videoAssetId"
          component={VideoInput}
          validation={{}}
        />
      </Row>
    </Section>
  );
};

export default IntroScreen;
