import { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import {
  getLayoutsOfNodeType,
  type LocalizedString,
  type Variable,
} from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import DualLink from './DualLink';
import EntityBadge from './EntityBadge';
import MiniTable from './MiniTable';
import SummaryContext from './SummaryContext';
import SummaryPage from './SummaryPage';
import { SummaryText } from './SummaryText';
import Variables from './Variables';
const messages = defineMessages({
  ego: {
    id: 'architect.protocolSummary.entity.ego',
    defaultMessage: 'Ego',
    description:
      'Heading of the section of the printable protocol summary for the ego, the codebook entry for the interviewee, above the table of its variables.',
  },
  layouts: {
    id: 'architect.protocolSummary.entity.layouts',
    defaultMessage: 'Layouts',
    description:
      'Row label on the page for one node type in the printable protocol summary of Architect, read by the researcher and by anyone they share the printed summary with. The row lists the layouts (named sets of node positions) in which a stage places nodes of this type; each links to the page of the summary that describes the layout.',
  },
});

type EntityProps = {
  type?: string;
  entity?: string;
  label?: LocalizedString;
  variables?: Record<string, Variable>;
};
const Entity = ({ type, entity, label, variables }: EntityProps) => {
  const intl = useAppIntl();
  const { protocol } = useContext(SummaryContext);
  const layouts =
    entity === 'node' && type ? getLayoutsOfNodeType(protocol, type) : [];
  const rows = [
    ...(label
      ? [
          [
            intl.formatMessage(summaryMessages.label),
            <SummaryText key="label" value={label} />,
          ],
        ]
      : []),
    ...(layouts.length > 0
      ? [
          [
            intl.formatMessage(messages.layouts),
            layouts.map((layoutId) => (
              <div key={layoutId}>
                <DualLink to={`#layout-${layoutId}`}>
                  <bdi className="wrap-anywhere">
                    {protocol.codebook.layouts?.[layoutId]?.name ?? layoutId}
                  </bdi>
                </DualLink>
              </div>
            )),
          ],
        ]
      : []),
  ];
  return (
    <SummaryPage id={entity === 'ego' ? 'ego' : `entity-${type ?? ''}`}>
      {entity !== 'ego' && type && entity && (
        <EntityBadge type={type} entity={entity} iconSize="tiny" />
      )}

      {rows.length > 0 && <MiniTable rotated rows={rows} />}

      {entity === 'ego' && (
        <Heading level="h1">{intl.formatMessage(messages.ego)}</Heading>
      )}

      <Variables variables={variables} />
    </SummaryPage>
  );
};
export default Entity;
