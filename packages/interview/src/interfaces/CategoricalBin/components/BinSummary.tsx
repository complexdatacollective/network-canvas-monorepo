import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { NcNode } from '@codaco/shared-consts';

import { useNodeLabel } from '../../Anonymisation/useNodeLabel';

type BinSummaryProps = {
  nodes: NcNode[];
};

const BinSummary = ({ nodes }: BinSummaryProps) => {
  const firstNode = nodes[0];
  const label = useNodeLabel(firstNode);
  const otherCount = nodes.length - 1;

  return (
    <Paragraph margin="none" className="catbin-summary-text">
      {/* Clamped on its own element rather than on the paragraph: a label long
          enough to fill the bin would otherwise push the count outside the
          clamp, leaving the summary claiming the bin holds one thing. */}
      <span className="line-clamp-2">{label}</span>
      {otherCount > 0 && (
        <>
          {/* A whitespace-only flex item is not rendered (the visible gap comes
              from column-gap), but it survives into the paragraph's text
              content — without it a screen reader reads "Amyand 2 others". */}{' '}
          <span>
            {otherCount === 1 ? 'and 1 other' : `and ${otherCount} others`}
          </span>
        </>
      )}
    </Paragraph>
  );
};

export default BinSummary;
