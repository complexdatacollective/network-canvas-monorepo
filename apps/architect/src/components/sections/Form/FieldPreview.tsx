import { get } from 'es-toolkit/compat';
import { useSelector } from 'react-redux';

import { Badge } from '@codaco/fresco-ui/Badge';
import AttributeControlDescription from '~/components/Form/AttributeControlDescription';
import Markdown from '~/components/Markdown';
import { getColorForType } from '~/config/variables';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubject } from '~/selectors/codebook';

type FieldPreviewProps = {
  variable: string;
  prompt: string;
  // The subject the field belongs to, passed explicitly by the list rather
  // than read from the stage form: the row renders inside the array editor,
  // which already knows which codebook entry to look the variable up in.
  entity: string;
  type?: string | null;
};

const FieldPreview = ({
  variable,
  prompt,
  entity,
  type = null,
}: FieldPreviewProps) => {
  const subjectVariables = useSelector((state: RootState) =>
    getVariablesForSubject(state, {
      entity: entity as 'node' | 'edge' | 'ego',
      type: type ?? undefined,
    }),
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

export default FieldPreview;
