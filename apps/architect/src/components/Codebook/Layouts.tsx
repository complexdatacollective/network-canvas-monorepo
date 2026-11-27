import { createElement, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'wouter';

import { commonMessages } from '@codaco/app-i18n/common';
import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Section from '@codaco/fresco-ui/Section';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { ensureError } from '@codaco/shared-consts';
import { useAppDispatch } from '~/ducks/hooks';
import { deleteLayoutAsync } from '~/ducks/modules/protocol/codebook';
import { useProtocolReadOnly } from '~/hooks/useProtocolReadOnly';

import { codebookHref, layoutAnchorId } from './codebookLinks';
import { layoutMatchesFilter } from './filterEntityType';
import { type LayoutWithUsage, makeGetLayoutsWithUsage } from './helpers';

const messages = defineMessages({
  layouts: {
    id: 'architect.codebook.layouts.layouts',
    defaultMessage: 'Layouts ({count, number})',
    description:
      'Heading of the section of the Codebook page in Architect that lists the layouts of the protocol. A layout is a named set of node positions that participants create on a Sociogram or a Network Composer. count is the number of layouts. Read by the researcher who designs the protocol.',
  },
  noLayoutsYet: {
    id: 'architect.codebook.layouts.noLayoutsYet',
    defaultMessage:
      'No layouts yet. A layout is created when you choose a new layout on a Sociogram or a Network Composer.',
    description:
      'Message under the Layouts heading on the Codebook page of Architect when the protocol has no layouts. A layout is a named set of node positions. Sociogram and Network Composer are stage types. Read by the researcher who designs the protocol.',
  },
  layout: {
    id: 'architect.codebook.layouts.layout',
    defaultMessage: '{name} layout',
    description:
      'Heading of the entry for one layout on the Codebook page of Architect. name is the name of the layout that the researcher chose, for example Closeness. A layout is a named set of node positions. Read by the researcher who designs the protocol.',
  },
  notInUse: {
    id: 'architect.codebook.layouts.notInUse',
    defaultMessage: 'not in use',
    description:
      'Warning badge on the entry for a layout on the Codebook page of Architect, shown when no stage and no rule uses the layout. Read by the researcher who designs the protocol.',
  },
  setBy: {
    id: 'architect.codebook.layouts.setBy',
    defaultMessage: 'Stages that place nodes in it:',
    description:
      'Label before the list of stages on the entry for a layout on the Codebook page of Architect. On these stages (a Sociogram or a Network Composer), participants or the automatic layout give nodes positions in the layout. Read by the researcher who designs the protocol.',
  },
  readBy: {
    id: 'architect.codebook.layouts.readBy',
    defaultMessage: 'Stages that show its positions:',
    description:
      'Label before the list of stages on the entry for a layout on the Codebook page of Architect. These stages (a Narrative, for example) show the node positions stored in the layout but do not change them. Read by the researcher who designs the protocol.',
  },
  nodeTypes: {
    id: 'architect.codebook.layouts.nodeTypes',
    defaultMessage: 'Node types that have positions in it:',
    description:
      'Label before the list of node types on the entry for a layout on the Codebook page of Architect. Nodes of these types are given positions in the layout by a stage. Read by the researcher who designs the protocol.',
  },
  namedByRules: {
    id: 'architect.codebook.layouts.namedByRules',
    defaultMessage: 'Stages with rules that name it:',
    description:
      'Label before the list of stages on the entry for a layout on the Codebook page of Architect. A rule on these stages (a filter, skip logic or a condition) checks whether a node has a position in the layout. Read by the researcher who designs the protocol.',
  },
  inUse: {
    id: 'architect.codebook.layouts.inUse',
    defaultMessage:
      'To delete this layout, first remove it from the stages listed here.',
    description:
      'Note on the entry for a layout on the Codebook page of Architect, shown instead of a delete button when stages or rules use the layout. Read by the researcher who designs the protocol.',
  },
  deleteLayout: {
    id: 'architect.codebook.layouts.deleteLayout',
    defaultMessage: 'Delete layout',
    description:
      'Button on the entry for an unused layout on the Codebook page of Architect, and the title and confirm button of the dialog that it opens. Delete is a verb. A layout is a named set of node positions. Read by the researcher who designs the protocol.',
  },
  confirmDelete: {
    id: 'architect.codebook.layouts.confirmDelete',
    defaultMessage:
      'Are you sure you want to delete the layout “{name}”? You can restore it with Undo while this protocol remains open.',
    description:
      'Text of the dialog that asks the researcher in Architect to confirm deleting a layout from the codebook. name is the name of the layout, shown in quotation marks.',
  },
});

const badgeClass = 'wrap-break-word [--badge-color:var(--surface-3)]';

type UsageRowProps = {
  label: MessageDescriptor;
  children: React.ReactNode[];
};

const UsageRow = ({ label, children }: UsageRowProps) => {
  const intl = useAppIntl();
  if (children.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <dt>{intl.formatMessage(label)}</dt>
      <dd>
        <ul className="flex flex-wrap items-center gap-1">{children}</ul>
      </dd>
    </div>
  );
};

const stageItems = (stages: LayoutWithUsage['setBy']) =>
  stages.map(({ id, label }, index) => (
    <li key={id ?? `${index}-${label}`}>
      {id ? (
        <Link href={`/protocol/stage/${id}`}>
          <Badge className={badgeClass}>{label}</Badge>
        </Link>
      ) : (
        <Badge className={badgeClass}>{label}</Badge>
      )}
    </li>
  ));

type LayoutEntryProps = {
  layout: LayoutWithUsage;
};

const LayoutEntry = ({ layout }: LayoutEntryProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const readOnly = useProtocolReadOnly();
  const { confirm } = useDialog();

  const handleDelete = () => {
    void confirm({
      title: createElement(AppMessage, { message: messages.deleteLayout }),
      description: createElement(AppMessage, {
        message: messages.confirmDelete,
        values: { name: layout.name },
      }),
      confirmLabel: createElement(AppMessage, {
        message: messages.deleteLayout,
      }),
      cancelLabel: createElement(AppMessage, {
        message: commonMessages.cancel,
      }),
      intent: 'destructive',
      // As in EntityType: `.unwrap()` lets a refusal reach the dialog, and
      // `ensureError` lets the dialog show its message.
      onConfirm: async () => {
        try {
          await dispatch(deleteLayoutAsync({ layoutId: layout.id })).unwrap();
        } catch (error) {
          throw ensureError(error);
        }
      },
    });
  };

  return (
    <Section
      id={layoutAnchorId(layout.id)}
      title={intl.formatMessage(messages.layout, {
        name: <bdi>{layout.name}</bdi>,
      })}
    >
      <div className="flex items-start gap-5">
        <div className="flex flex-1 flex-col gap-2">
          {!layout.inUse && (
            <Badge tone="warning" className="self-start wrap-break-word">
              {intl.formatMessage(messages.notInUse)}
            </Badge>
          )}
          <dl className="flex flex-col gap-2">
            <UsageRow label={messages.setBy}>
              {stageItems(layout.setBy)}
            </UsageRow>
            <UsageRow label={messages.readBy}>
              {stageItems(layout.readBy)}
            </UsageRow>
            <UsageRow label={messages.nodeTypes}>
              {layout.nodeTypes.map(({ id, name }) => (
                <li key={id}>
                  <Link href={codebookHref({ entity: 'node', type: id })}>
                    <Badge className={badgeClass}>
                      <bdi>{name}</bdi>
                    </Badge>
                  </Link>
                </li>
              ))}
            </UsageRow>
            <UsageRow label={messages.namedByRules}>
              {stageItems(layout.namedByRules)}
            </UsageRow>
          </dl>
          {layout.inUse && (
            <Paragraph emphasis="muted" margin="none">
              {intl.formatMessage(messages.inUse)}
            </Paragraph>
          )}
        </div>
        {!layout.inUse && (
          <Button
            color="destructive"
            onClick={handleDelete}
            disabled={readOnly}
          >
            {intl.formatMessage(messages.deleteLayout)}
          </Button>
        )}
      </div>
    </Section>
  );
};

type LayoutsProps = {
  search?: string;
  unusedOnly?: boolean;
};

/**
 * The codebook's layouts, each with the stages that place nodes in it, the
 * stages that show its positions, the node types that have positions in it
 * and the stages whose rules name it. Only a layout that nothing uses can be
 * deleted.
 */
const Layouts = ({ search = '', unusedOnly = false }: LayoutsProps) => {
  const intl = useAppIntl();
  const getLayouts = useMemo(() => makeGetLayoutsWithUsage(intl), [intl]);
  const layouts = useSelector(getLayouts);
  const visible = layouts.filter((layout) =>
    layoutMatchesFilter(layout, { search, unusedOnly }),
  );

  return (
    <div className="mb-14">
      <Heading level="h2" margin="none" className="mb-5!">
        {intl.formatMessage(messages.layouts, { count: layouts.length })}
      </Heading>
      {layouts.length === 0 ? (
        <Paragraph emphasis="muted">
          {intl.formatMessage(messages.noLayoutsYet)}
        </Paragraph>
      ) : (
        visible.map((layout) => <LayoutEntry key={layout.id} layout={layout} />)
      )}
    </div>
  );
};

export default Layouts;
