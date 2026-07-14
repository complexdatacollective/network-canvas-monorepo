import { Trash2 } from 'lucide-react';
import { compose } from 'react-recompose';

import Button, { IconButton } from '@codaco/fresco-ui/Button';

import RuleText, { Join } from './PreviewText';
import withDisplayOptions from './withDisplayOptions';

type PreviewRuleProps = {
  type: string;
  options: Record<string, unknown>;
  join?: string | null;
  onClick: () => void;
  onDelete?: () => void;
  codebook?: Record<string, unknown>;
};

export const PreviewRule = ({
  type,
  options,
  join = null,
  onClick,
  onDelete,
}: PreviewRuleProps) => {
  return (
    <>
      <div className="group text-surface-1-contrast mx-auto flex min-h-19 w-[95%] items-center gap-2">
        <Button
          type="button"
          variant="text"
          color="dynamic"
          className="hover:bg-surface-accent hover:text-primary-contrast min-h-19 min-w-0 flex-1 justify-start rounded px-5 py-2.5 text-wrap"
          onClick={onClick}
          aria-label="Edit rule"
        >
          <span className="flex w-full min-w-0 items-center *:mx-2.5 *:max-w-[24rem] [&_.variable-pill]:zoom-[0.8]">
            <RuleText type={type} options={options} />
          </span>
        </Button>
        <IconButton
          type="button"
          icon={<Trash2 />}
          aria-label="Delete rule"
          size="md"
          variant="text"
          color="destructive"
          className="hover:enabled:bg-destructive hover:enabled:text-destructive-contrast shrink-0 text-current opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          onClick={onDelete}
        />
      </div>
      {join && <Join value={join} />}
    </>
  );
};

export default compose<PreviewRuleProps, Partial<PreviewRuleProps>>(
  withDisplayOptions,
)(PreviewRule);
