import { useContext } from 'react';

import { type IntlShape, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import Markdown from '~/components/Markdown';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import DualLink from '../DualLink';
import EntityBadge from '../EntityBadge';
import { SummaryValue } from '../helpers';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  explanationText: {
    id: 'architect.protocolSummary.stage.anonymisation.explanationText',
    defaultMessage: 'Explanation Text',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / Anonymisation.',
  },
  theFollowingAttributesWillBeEncrypted: {
    id: 'architect.protocolSummary.stage.anonymisation.theFollowingAttributesWillBeEncrypted',
    defaultMessage:
      "The following attributes will be encrypted using the participant's passphrase:",
    description:
      'Visible text in lib / ProtocolSummary / components / Stage / Anonymisation.',
  },
});
const finalMessages = defineMessages({
  minimumPassphrase: {
    id: 'architect.final.lib.ProtocolSummary.components.Stage.Anonymisation.minimumPassphrase',
    defaultMessage: 'Minimum passphrase length',
    description: 'Researcher-facing Architect control or feedback.',
  },
  maximumPassphrase: {
    id: 'architect.final.lib.ProtocolSummary.components.Stage.Anonymisation.maximumPassphrase',
    defaultMessage: 'Maximum passphrase length',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

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
      variables?: Record<
        string,
        {
          name: string;
          encrypted?: boolean;
        }
      >;
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
const validationRows = (
  validation: {
    minLength?: number;
    maxLength?: number;
  },
  intl: IntlShape,
) => {
  const rows: [string, React.ReactNode][] = [];
  if (validation.minLength !== undefined) {
    rows.push([
      intl.formatMessage(finalMessages.minimumPassphrase),
      <SummaryValue key="minLength" value={validation.minLength} />,
    ]);
  }
  if (validation.maxLength !== undefined) {
    rows.push([
      intl.formatMessage(finalMessages.maximumPassphrase),
      <SummaryValue key="maxLength" value={validation.maxLength} />,
    ]);
  }
  return rows;
};
const Anonymisation = ({
  explanationText = null,
  validation = null,
}: AnonymisationProps) => {
  const intl = useAppIntl();
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
        <SectionFrame title={intl.formatMessage(messages.explanationText)}>
          <Heading level="h1">{explanationText.title}</Heading>
          <Markdown label={explanationText.body} />
        </SectionFrame>
      )}

      {hasValidation && (
        <MiniTable rotated rows={validationRows(validation, intl)} />
      )}

      {hasEncryptedVariables && (
        <>
          <Paragraph className="mb-5">
            {intl.formatMessage(messages.theFollowingAttributesWillBeEncrypted)}
          </Paragraph>
          <MiniTable
            rows={[
              [
                intl.formatMessage(summaryMessages.nodeType),
                intl.formatMessage(summaryMessages.attribute),
              ],
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
