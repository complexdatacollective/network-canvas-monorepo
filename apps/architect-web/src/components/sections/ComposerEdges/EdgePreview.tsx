import { useSelector } from 'react-redux';

import { getCodebook } from '~/selectors/protocol';

type EdgePreviewProps = {
  subject?: { type?: string; entity?: string };
  form?: { fields?: unknown[] };
};

const EdgePreview = ({ subject, form }: EdgePreviewProps) => {
  const codebook = useSelector(getCodebook);

  const edgeType = subject?.type;
  const edgeDefinition = edgeType ? codebook?.edge?.[edgeType] : undefined;
  const label = edgeType
    ? (edgeDefinition?.name ?? edgeType)
    : '(no edge type)';
  const color = edgeDefinition?.color;

  const count = (form?.fields ?? []).length;

  return (
    <div className="flex items-center gap-(--space-sm)">
      {color && (
        <span
          className="inline-block size-(--space-md) rounded-full"
          style={{ backgroundColor: `var(--${color})` }}
        />
      )}
      <span>{label}</span>
      <span className="text-(--current-surface-foreground)/70">
        {count} attribute{count === 1 ? '' : 's'}
      </span>
    </div>
  );
};

export default EdgePreview;
