import { get } from 'es-toolkit/compat';
import { useSelector } from 'react-redux';

import Badge from '~/components/Badge';
import { getColorForType } from '~/config/variables';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubject } from '~/selectors/codebook';

type ComposerFieldPreviewProps = {
  variable: string;
  component?: string;
  label?: string;
  // The entity/type of the subject the attribute belongs to — a node type for
  // node attributes, an edge type for edge attributes. Passed explicitly by
  // EditableAttributesList (NOT via withSubject, which only knows the stage's
  // node subject and would look edge variables up in the wrong codebook).
  entity: 'node' | 'edge' | 'ego';
  type?: string | null;
};

const ComposerFieldPreview = ({
  variable,
  component,
  label,
  entity,
  type = null,
}: ComposerFieldPreviewProps) => {
  const subjectVariables = useSelector((state: RootState) =>
    getVariablesForSubject(state, { entity, type: type ?? undefined }),
  );
  const codebookVariable = get(subjectVariables, variable, {}) as {
    type?: string;
    name?: string;
  };

  return (
    <div className="m-(--space-md) flex flex-col gap-(--space-sm)">
      {/* Mirror the drawer's caption: the field label, else the variable name. */}
      <strong>{label ?? codebookVariable.name ?? variable}</strong>
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

export default ComposerFieldPreview;
