import { get } from 'es-toolkit/compat';

import { Badge } from '@codaco/fresco-ui/Badge';
import AttributeControlDescription from '~/components/Form/AttributeControlDescription';
import Markdown from '~/components/Markdown';
import { useStageFormValue } from '~/components/StageEditor/stageFormHooks';
import { getColorForType } from '~/config/variables';
import { useAppSelector } from '~/ducks/hooks';
import { getVariablesForSubject } from '~/selectors/codebook';

type NodeFormFieldPreviewProps = {
  variable: string;
  prompt: string;
};

const NodeFormFieldPreview = ({
  variable,
  prompt,
}: NodeFormFieldPreviewProps) => {
  const nodeType = useStageFormValue<string>('nodeConfig.type');

  const subjectVariables = useAppSelector((state) =>
    getVariablesForSubject(state, { entity: 'node', type: nodeType }),
  );
  const codebookVariable = get(subjectVariables, variable, {}) as {
    type?: string;
    component?: string;
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Markdown label={prompt} className="[&>p]:m-0" />
      <div>
        <Badge color={getColorForType(codebookVariable.type)}>
          <AttributeControlDescription
            type={codebookVariable.type}
            component={codebookVariable.component}
          />
        </Badge>
      </div>
    </div>
  );
};

export default NodeFormFieldPreview;
