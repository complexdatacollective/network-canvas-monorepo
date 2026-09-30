'use client';
import type { ReactNode, Ref } from 'react';

import { AppMessage } from '@codaco/app-i18n/react';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { NcNode } from '@codaco/shared-consts';

import { useNodeLabel } from '../../Anonymisation/useNodeLabel';
import { interfaceMessages } from '../../messages';

type BinSummaryProps = {
  nodes: NcNode[];
  /**
   * The text element itself, which lays out at its natural height even while
   * the bin is holding its container at zero. Callers measuring how much room
   * the summary needs have to read it here.
   */
  ref?: Ref<HTMLParagraphElement>;
};

const renderSummaryName = (chunks: ReactNode[]) => (
  <span className="line-clamp-2">{chunks}</span>
);
const renderSummaryCount = (chunks: ReactNode[]) => <span>{chunks}</span>;

const BinSummary = ({ nodes, ref }: BinSummaryProps) => {
  const firstNode = nodes[0];
  const label = useNodeLabel(firstNode);
  const otherCount = nodes.length - 1;

  return (
    <Paragraph ref={ref} margin="none" className="catbin-summary-text">
      <AppMessage
        message={interfaceMessages.binSummary}
        values={{
          name: label ?? '',
          otherCount: Math.max(0, otherCount),
          // The separate spans keep a long authored name from hiding the count.
          label: renderSummaryName,
          count: renderSummaryCount,
        }}
      />
    </Paragraph>
  );
};

export default BinSummary;
