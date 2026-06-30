import { get } from 'es-toolkit/compat';
import { useSelector } from 'react-redux';

import Badge from '~/components/Badge';
import withSubject from '~/components/enhancers/withSubject';
import { Markdown } from '~/components/Form/Fields';
import { getColorForType } from '~/config/variables';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubject } from '~/selectors/codebook';

type ComposerFieldPreviewProps = {
  variable: string;
  prompt?: string;
  component?: string;
  entity: string;
  type?: string | null;
};

const ComposerFieldPreview = ({
  variable,
  prompt,
  component,
  entity,
  type = null,
}: ComposerFieldPreviewProps) => {
  const subjectVariables = useSelector((state: RootState) =>
    getVariablesForSubject(state, {
      entity: entity as 'node' | 'edge' | 'ego',
      type: type ?? undefined,
    }),
  );
  const codebookVariable = get(subjectVariables, variable, {}) as {
    type?: string;
  };

  return (
    <div className="m-(--space-md) flex flex-col gap-(--space-sm)">
      {prompt && <Markdown label={prompt} className="[&>p]:m-0" />}
      <div>
        <Badge color={getColorForType(codebookVariable.type)}>
          <strong>{codebookVariable.type}</strong>
          {' variable using '}
          <strong>{component}</strong>
          {' input control'}
        </Badge>
      </div>
    </div>
  );
};

export default withSubject(ComposerFieldPreview);
