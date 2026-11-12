import { useContext } from 'react';

import { type IntlShape, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { LocalizedString } from '@codaco/protocol-validation';
import { effectivePassphraseMinLength } from '@codaco/shared-consts';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import DualLink from '../DualLink';
import EntityBadge from '../EntityBadge';
import { SummaryValue } from '../helpers';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import { SummaryMarkdown } from '../SummaryText';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  defaultMinimumPassphraseLength: {
    id: 'architect.protocolSummary.stage.anonymisation.defaultMinimumPassphraseLength',
    defaultMessage: '{count, number} (default)',
    description:
      'Value of the minimum passphrase length row in the printed protocol summary when the stage sets no minimum of its own, so the interview applies its default. count is that default length in characters.',
  },
  explanationText: {
    id: 'architect.protocolSummary.stage.anonymisation.explanationText',
    defaultMessage: 'Explanation Text',
    description:
      'Section heading in the printable protocol summary, above the text an Anonymisation stage shows participants to explain the passphrase.',
  },
  theFollowingAttributesWillBeEncrypted: {
    id: 'architect.protocolSummary.stage.anonymisation.theFollowingAttributesWillBeEncrypted',
    defaultMessage:
      "The following attributes will be encrypted using the participant's passphrase:",
    description:
      "Sentence in the printable protocol summary of an Anonymisation stage, above the table of variables that are encrypted with the participant's passphrase.",
  },
});
const finalMessages = defineMessages({
  minimumPassphrase: {
    id: 'architect.final.lib.ProtocolSummary.components.Stage.Anonymisation.minimumPassphrase',
    defaultMessage: 'Minimum passphrase length',
    description:
      "Row label in the printable protocol summary of an Anonymisation stage; its value is the fewest characters a participant's passphrase may have.",
  },
  maximumPassphrase: {
    id: 'architect.final.lib.ProtocolSummary.components.Stage.Anonymisation.maximumPassphrase',
    defaultMessage: 'Maximum passphrase length',
    description:
      "Row label in the printable protocol summary of an Anonymisation stage; its value is the most characters a participant's passphrase may have. Shown only when the stage sets a maximum.",
  },
});

type AnonymisationProps = {
  explanationText?: LocalizedString | null;
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
  validation: AnonymisationProps['validation'],
  intl: IntlShape,
) => {
  // Always present: a stage that sets no minimum still holds participants to
  // the interview's default, which a printed summary has to state.
  const rows: [string, React.ReactNode][] = [
    [
      intl.formatMessage(finalMessages.minimumPassphrase),
      validation?.minLength === undefined ? (
        intl.formatMessage(messages.defaultMinimumPassphraseLength, {
          count: effectivePassphraseMinLength(validation ?? undefined),
        })
      ) : (
        <SummaryValue key="minLength" value={validation.minLength} />
      ),
    ],
  ];
  if (validation?.maxLength !== undefined) {
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
  const hasEncryptedVariables = encryptedVariables.length > 0;
  return (
    <>
      {hasExplanation && (
        <SectionFrame title={intl.formatMessage(messages.explanationText)}>
          <div className="my-5">
            <SummaryMarkdown value={explanationText} />
          </div>
        </SectionFrame>
      )}

      <MiniTable rotated rows={validationRows(validation, intl)} />

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
