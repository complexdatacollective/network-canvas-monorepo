'use client';

import { useAppIntl } from '@codaco/app-i18n/react';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { useNodeLabel } from '../interfaces/Anonymisation/useNodeLabel';
import { interfaceMessages } from '../interfaces/messages';

/**
 * Tells screen reader users which node a bin stage in select mode is placing
 * (#1652), or that nothing is left. Sighted participants see the same thing
 * as the selected node, so nothing is rendered visibly. The announcement is
 * keyed by prompt, so the same node chosen first on the next prompt is
 * announced again. While the drawer's order is `settling` nothing is
 * announced, since the stage is not complete.
 */
export default function BinSelectAnnouncer({
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
      role="status"
      aria-live="polite"
      aria-atomic
      className="sr-only"
      data-testid="bin-select-announcer"
    >
      {!settling && (
        <span key={`${promptId}:${nodeId ?? 'complete'}`}>
          {node
            ? intl.formatMessage(interfaceMessages.binSelectInstruction, {
                name,
              })
            : intl.formatMessage(interfaceMessages.binSelectComplete)}
        </span>
      )}
    </div>
  );
}
