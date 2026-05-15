import { useContext } from 'react';

import Markdown from '~/components/Form/Fields/Markdown';

import DualLink from '../DualLink';
import EntityBadge from '../EntityBadge';
import { renderValue } from '../helpers';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import SectionFrame from './SectionFrame';

type AnonymisationProps = {
  explanationText?: {
    title: string;
    body: string;
  } | null;
  validation?: {
    minLength?: number;
    maxLength?: number;
  } | null;
};

type EncryptedVariable = {
  id: string;
  name: string;
  nodeType: string;
  nodeTypeName: string;
};

const getEncryptedVariables = (codebook: {
  node?: Record<
    string,
    {
      name: string;
      variables?: Record<string, { name: string; encrypted?: boolean }>;
    }
  >;
}): EncryptedVariable[] => {
  const encrypted: EncryptedVariable[] = [];

  if (!codebook?.node) {
    return encrypted;
  }

  for (const [nodeTypeId, nodeType] of Object.entries(codebook.node)) {
    if (!nodeType.variables) continue;

    for (const [variableId, variable] of Object.entries(nodeType.variables)) {
      if (variable.encrypted) {
        encrypted.push({
          id: variableId,
          name: variable.name,
          nodeType: nodeTypeId,
          nodeTypeName: nodeType.name,
        });
      }
    }
  }

  return encrypted;
};

const validationRows = (validation: {
  minLength?: number;
  maxLength?: number;
}) => {
  const rows: [string, React.ReactNode][] = [];

  if (validation.minLength !== undefined) {
    rows.push(['Minimum passphrase length', renderValue(validation.minLength)]);
  }

  if (validation.maxLength !== undefined) {
    rows.push(['Maximum passphrase length', renderValue(validation.maxLength)]);
  }

  return rows;
};

const Anonymisation = ({
  explanationText = null,
  validation = null,
}: AnonymisationProps) => {
  const { protocol } = useContext(SummaryContext);
  const encryptedVariables = getEncryptedVariables(protocol.codebook);

  const hasExplanation = !!explanationText;
  const hasValidation =
    validation &&
    (validation.minLength !== undefined || validation.maxLength !== undefined);
  const hasEncryptedVariables = encryptedVariables.length > 0;

  if (!hasExplanation && !hasValidation && !hasEncryptedVariables) {
    return null;
  }

  return (
    <>
      {hasExplanation && (
        <SectionFrame title="Explanation Text">
          <h1>{explanationText.title}</h1>
          <Markdown label={explanationText.body} />
        </SectionFrame>
      )}

      {hasValidation && <MiniTable rotated rows={validationRows(validation)} />}

      {hasEncryptedVariables && (
        <>
          <p className="mb-(--space-md)">
            The following variables will be encrypted using the participant's
            passphrase:
          </p>
          <MiniTable
            rows={[
              ['Node Type', 'Variable'],
              ...encryptedVariables.map(({ id, name, nodeType }) => [
                <EntityBadge
                  key={`badge-${id}`}
                  small
                  type={nodeType}
                  entity="node"
                  link
                />,
                <DualLink key={`link-${id}`} to={`#variable-${id}`}>
                  {name}
                </DualLink>,
              ]),
            ]}
          />
        </>
      )}
    </>
  );
};

export default Anonymisation;
