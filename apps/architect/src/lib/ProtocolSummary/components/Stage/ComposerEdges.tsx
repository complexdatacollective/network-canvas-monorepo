import { useAppIntl } from '@codaco/app-i18n/react';
import { composerMessages } from '@codaco/protocol-builder/editors/network-composer/composerMessages';
import type { LocalizedString } from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import EntityBadge from '../EntityBadge';
import MiniTable from '../MiniTable';
import { SummaryText } from '../SummaryText';
import SectionFrame from './SectionFrame';

type ComposerEdgesProps = {
  edges: { subject: { type: string }; label: LocalizedString }[] | null;
};

/**
 * The edge types a Network Composer stage lets participants draw, each with
 * the label participants choose it by.
 */
const ComposerEdges = ({ edges }: ComposerEdgesProps) => {
  const intl = useAppIntl();
  if (!edges || edges.length === 0) {
    return null;
  }

  return (
    <SectionFrame title={intl.formatMessage(composerMessages.connectionsTitle)}>
      <MiniTable
        wide
        rows={[
          [
            intl.formatMessage(summaryMessages.edgeType),
            intl.formatMessage(summaryMessages.label),
          ],
          ...edges.map(({ subject, label }) => [
            <EntityBadge
              key={`type-${subject.type}`}
              entity="edge"
              type={subject.type}
              tiny
              link
            />,
            <SummaryText key={`label-${subject.type}`} value={label} />,
          ]),
        ]}
      />
    </SectionFrame>
  );
};

export default ComposerEdges;
