import { compose, withHandlers } from 'react-recompose';

import { Icon } from '~/lib/legacy-ui/components';

import RuleText, { Join } from './PreviewText';
import withDisplayOptions from './withDisplayOptions';

const withDeleteHandler = withHandlers({
  handleDelete: (props: { onDelete: () => void }) => (e: React.MouseEvent) => {
    e.stopPropagation();

    props.onDelete();
  },
});

type PreviewRuleProps = {
  type: string;
  options: Record<string, unknown>;
  join?: string | null;
  onClick: () => void;
  handleDelete: () => void;
  onDelete?: () => void;
  codebook?: Record<string, unknown>;
};

const PreviewRule = ({
  type,
  options,
  join = null,
  onClick,
  handleDelete,
}: PreviewRuleProps) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.key === ' ') e.preventDefault();
      onClick();
    }
  };

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: a real <button> would nest with the inner delete <button> */}
      <div
        role="button"
        tabIndex={0}
        className="group text-surface-1-contrast hover:bg-surface-accent hover:text-primary-contrast mx-auto flex min-h-19 w-[95%] cursor-pointer items-center rounded px-5 py-2.5"
        onClick={onClick}
        onKeyDown={handleKeyDown}
        aria-label="Edit rule"
      >
        <div className="flex w-full flex-1 items-center *:mx-2.5 *:max-w-[24rem] [&_.variable-pill]:zoom-[0.8]">
          <RuleText type={type} options={options} />
        </div>
        <button
          type="button"
          className="bg-destructive text-destructive-contrast ml-2.5 flex size-7 shrink-0 grow-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-0 opacity-0 transition-opacity duration-150 ease-in-out group-hover:opacity-100 [&_.icon]:size-5"
          onClick={handleDelete}
        >
          <Icon name="delete" />
        </button>
      </div>
      {join && <Join value={join} />}
    </>
  );
};

export default compose<PreviewRuleProps, Partial<PreviewRuleProps>>(
  withDeleteHandler,
  withDisplayOptions,
)(PreviewRule);
