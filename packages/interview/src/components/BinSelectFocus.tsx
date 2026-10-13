'use client';

import { AnimatePresence, motion } from 'motion/react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { useNodeLabel } from '../interfaces/Anonymisation/useNodeLabel';
import { interfaceMessages } from '../interfaces/messages';
import ConnectedNode from './ConnectedNode';

const appear = {
  initial: { opacity: 0, scale: 0.6 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.6 },
};

/**
 * The person a bin stage in select mode is placing (#1652), shown above the
 * drawer that queues the rest, or the completed state once nobody is left.
 * The announcement is keyed by prompt, so the same person shown first on the
 * next prompt is announced again. While the drawer's order is `settling`
 * nobody is shown and nothing is announced, since the stage is not complete.
 */
export default function BinSelectFocus({
  node,
  settling = false,
  promptId,
}: {
  node: NcNode | undefined;
  settling?: boolean;
  promptId: string;
}) {
  const intl = useAppIntl();
  const name = useNodeLabel(node);
  const nodeId = node?.[entityPrimaryKeyProperty];

  return (
    <div
      className="flex shrink-0 flex-col items-center gap-2"
      data-testid="bin-select-focus"
    >
      <div role="status" aria-live="polite" aria-atomic className="sr-only">
        {!settling && (
          <span key={`${promptId}:${nodeId ?? 'complete'}`}>
            {node
              ? intl.formatMessage(interfaceMessages.binSelectFocal, { name })
              : intl.formatMessage(interfaceMessages.binSelectComplete)}
          </span>
        )}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        {node && nodeId ? (
          // Shown, not operated: the bins are the controls.
          <motion.div
            key={nodeId}
            data-testid="bin-select-focal-node"
            {...appear}
          >
            <ConnectedNode
              nodeId={nodeId}
              type={node.type}
              size="md"
              selected
              presentational
            />
          </motion.div>
        ) : settling ? (
          <div key="settling" className="min-h-24" aria-hidden />
        ) : (
          <motion.div
            key="complete"
            className="flex min-h-24 items-center"
            aria-hidden
            {...appear}
          >
            <Paragraph intent="lead" margin="none">
              {intl.formatMessage(interfaceMessages.binSelectComplete)}
            </Paragraph>
          </motion.div>
        )}
      </AnimatePresence>
      {node && (
        <Paragraph intent="smallText" margin="none" aria-hidden>
          {intl.formatMessage(interfaceMessages.binSelectInstruction)}
        </Paragraph>
      )}
    </div>
  );
}
