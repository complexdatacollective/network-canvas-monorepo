'use client';
import type { ReactNode } from 'react';

import { AppMessage } from '@codaco/app-i18n/react';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { NcNode } from '@codaco/shared-consts';

import { useNodeLabel } from '../../Anonymisation/useNodeLabel';
import { interfaceMessages } from '../../messages';

type BinSummaryProps = {
  nodes: NcNode[];
};

const renderSummaryName = (chunks: ReactNode[]) => (
  <span className="line-clamp-2">{chunks}</span>
);
const renderSummaryCount = (chunks: ReactNode[]) => <span>{chunks}</span>;

const BinSummary = ({ nodes }: BinSummaryProps) => {
  const firstNode = nodes[0];
  const label = useNodeLabel(firstNode);
  const otherCount = nodes.length - 1;

  return (
    <Paragraph margin="none" className="catbin-summary-text">
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
