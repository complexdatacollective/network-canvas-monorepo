import { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { describeLayouts } from '~/selectors/codebook/layouts';

import DualLink from './DualLink';
import EntityBadge from './EntityBadge';
import MiniTable from './MiniTable';
import SummaryContext from './SummaryContext';
import SummaryPage from './SummaryPage';
import { DefaultLanguageText } from './SummaryText';

const messages = defineMessages({
  layouts: {
    id: 'architect.protocolSummary.layouts.layouts',
    defaultMessage: 'Layouts',
    description:
      'Heading of the page of the printable protocol summary in Architect that lists the layouts of the codebook. A layout is a named set of node positions that participants create on a Sociogram or a Network Composer. Read by the researcher and by anyone they share the printed summary with.',
  },
  setBy: {
    id: 'architect.protocolSummary.layouts.setBy',
    defaultMessage: 'Placed on',
    description:
      'Row label in the table for one layout in the printable protocol summary of Architect. The row lists the stages on which participants or the automatic layout place nodes in the layout. Read by the researcher and by anyone they share the printed summary with.',
  },
  readBy: {
    id: 'architect.protocolSummary.layouts.readBy',
    defaultMessage: 'Shown on',
    description:
      'Row label in the table for one layout in the printable protocol summary of Architect. The row lists the stages that show the node positions stored in the layout, such as a Narrative. Read by the researcher and by anyone they share the printed summary with.',
  },
  nodeTypes: {
    id: 'architect.protocolSummary.layouts.nodeTypes',
    defaultMessage: 'Node types',
    description:
      'Row label in the table for one layout in the printable protocol summary of Architect. The row lists the node types that have positions in the layout. Read by the researcher and by anyone they share the printed summary with.',
  },
  namedByRules: {
    id: 'architect.protocolSummary.layouts.namedByRules',
    defaultMessage: 'Named in rules on',
    description:
      'Row label in the table for one layout in the printable protocol summary of Architect. The row lists the stages with a rule (a filter, skip logic or a condition) that checks whether a node has a position in the layout. Read by the researcher and by anyone they share the printed summary with.',
  },
  notInUse: {
    id: 'architect.protocolSummary.layouts.notInUse',
    defaultMessage: 'Not in use',
    description:
      'Text in the table for one layout in the printable protocol summary of Architect, shown when no stage and no rule uses the layout. Read by the researcher and by anyone they share the printed summary with.',
  },
});

/**
 * The codebook's layouts, each with the stages that place nodes in it, show
 * its positions or name it in a rule, and the node types that have positions
 * in it.
 */
const Layouts = () => {
  const intl = useAppIntl();
  const { protocol } = useContext(SummaryContext);
  const layouts = describeLayouts(protocol);

  if (layouts.length === 0) return null;

  const stageLinks = (stageIds: string[]) =>
    stageIds.flatMap((stageId) => {
      const stage = protocol.stages.find(({ id }) => id === stageId);
      if (!stage) return [];
      return [
        <div key={stageId}>
          <DualLink to={`#stage-${stageId}`}>
            <span className="wrap-anywhere">
              <DefaultLanguageText value={stage.label} />
            </span>
          </DualLink>
        </div>,
      ];
    });

  return (
    <SummaryPage id="layouts">
      <Heading level="h1">{intl.formatMessage(messages.layouts)}</Heading>
      {layouts.map((layout) => {
        const rows = [
          { label: messages.setBy, cells: stageLinks(layout.setBy) },
          { label: messages.readBy, cells: stageLinks(layout.readBy) },
          {
            label: messages.nodeTypes,
            cells: layout.nodeTypes.map((type) => (
              <EntityBadge key={type} type={type} entity="node" link tiny />
            )),
          },
          {
            label: messages.namedByRules,
            cells: stageLinks(layout.namedByRules),
          },
        ].filter(({ cells }) => cells.length > 0);
        return (
          <div key={layout.id} id={`layout-${layout.id}`}>
            <Heading level="h2">
              <bdi>{layout.name}</bdi>
            </Heading>
            {layout.inUse ? (
              <MiniTable
                rotated
                rows={rows.map(({ label, cells }) => [
                  intl.formatMessage(label),
                  cells,
                ])}
              />
            ) : (
              <p>{intl.formatMessage(messages.notInUse)}</p>
            )}
          </div>
        );
      })}
    </SummaryPage>
  );
};

export default Layouts;
