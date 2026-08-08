import { get } from 'es-toolkit/compat';

import { Badge } from '@codaco/fresco-ui/Badge';
import Markdown from '~/components/Markdown';
import { useStageFormValue } from '~/components/StageEditor/stageFormHooks';
import { getColorForType } from '~/config/variables';
import { useAppSelector } from '~/ducks/hooks';
import { getVariablesForSubject } from '~/selectors/codebook';

type NominationPromptPreviewProps = {
  text: string;
  variable: string;
};

const NominationPromptPreview = ({
  text,
  variable,
}: NominationPromptPreviewProps) => {
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
          {' variable: '}
          <strong>{codebookVariable.name}</strong>
        </Badge>
      </div>
    </div>
  );
};

export default NominationPromptPreview;
