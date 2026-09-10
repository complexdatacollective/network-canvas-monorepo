import { get } from 'es-toolkit/compat';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Markdown from '~/components/Markdown';
import { useStageFormValue } from '~/components/StageEditor/stageFormHooks';
import { getColorForType } from '~/config/variables';
import { useAppSelector } from '~/ducks/hooks';
import { getVariablesForSubject } from '~/selectors/codebook';
const messages = defineMessages({
  attribute: {
    id: 'architect.sections.familyPedigree.nominationPromptPreview.attribute',
    defaultMessage: 'attribute:',
    description:
      'Visible text in components / sections / FamilyPedigree / NominationPromptPreview.',
  },
});

type NominationPromptPreviewProps = {
  text: string;
  variable: string;
};

const NominationPromptPreview = ({
  text,
  variable,
}: NominationPromptPreviewProps) => {
  const intl = useAppIntl();
  const nodeType = useStageFormValue<string>('nodeConfig.type');

  const subjectVariables = useAppSelector((state) =>
    getVariablesForSubject(state, { entity: 'node', type: nodeType }),
  );
  const codebookVariable = get(subjectVariables, variable, {}) as {
    name?: string;
    type?: string;
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Markdown label={text} className="[&>p]:m-0" />
      <div>
        <Badge color={getColorForType(codebookVariable.type)}>
          <strong>{codebookVariable.type}</strong>
          {intl.formatMessage(messages.attribute)}
          <strong>{codebookVariable.name}</strong>
        </Badge>
      </div>
    </div>
  );
};

export default NominationPromptPreview;
