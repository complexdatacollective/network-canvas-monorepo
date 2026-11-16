'use client';

import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { useNodeLabel } from '../interfaces/Anonymisation/useNodeLabel';

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
  const name = useNodeLabel(node);
  const nodeId = node?.[entityPrimaryKeyProperty];

  return (
    <output
      aria-live="polite"
      aria-atomic
      className="sr-only"
      lang="en"
      data-testid="bin-select-announcer"
    >
      {!settling && (
        <span key={`${promptId}:${nodeId ?? 'complete'}`}>
          {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx -- screen-reader text stays English */}
          {node ? `Choose where ${name} belongs.` : 'Nothing left to place.'}
        </span>
      )}
    </output>
  );
}
