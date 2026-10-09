'use client';
import type { Ref } from 'react';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { NcNode } from '@codaco/shared-consts';

import { useContentFormat } from '../../../localization/useContentFormat';
import { useNodeLabel } from '../../Anonymisation/useNodeLabel';

type BinSummaryProps = {
  nodes: NcNode[];
  /**
   * The text element itself, which lays out at its natural height even while
   * the bin is holding its container at zero. Callers measuring how much room
   * the summary needs have to read it here.
   */
  ref?: Ref<HTMLParagraphElement>;
};

const BinSummary = ({ nodes, ref }: BinSummaryProps) => {
  // Shown beside a participant's name, so in the protocol's digits.
  const contentFormat = useContentFormat();
  const firstNode = nodes[0];
  const label = useNodeLabel(firstNode);
  const otherCount = Math.max(0, nodes.length - 1);

  return (
    <Paragraph ref={ref} margin="none" className="catbin-summary-text">
      {/* The separate spans keep a long authored name from hiding the count. */}
      <span className="line-clamp-2">{label ?? ''}</span>
      {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx -- A space, so the name and the count read as two words. */}{' '}
      {otherCount > 0 && (
        <span className="rounded-full bg-current/15 px-1.5">
          {contentFormat.formatSigned(otherCount)}
        </span>
      )}
    </Paragraph>
  );
};

export default BinSummary;
