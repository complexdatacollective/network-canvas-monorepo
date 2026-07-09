import { useSlate } from 'slate-react';

import { cx } from '~/utils/cva';

import Icon from './Icon';
import {
  isBlockActive,
  isMarkActive,
  toggleBlock,
  toggleMark,
} from './lib/actions';

type ToolbarButtonProps = {
  isActive?: boolean;
  icon: string;
  tooltip: string;
  action: () => void;
};

export const ToolbarButton = ({
  isActive = false,
  icon,
  tooltip,
  action,
}: ToolbarButtonProps) => (
  <button
    title={tooltip}
    onMouseDown={(event) => {
      event.preventDefault();
      action();
    }}
    type="button"
    className={cx(
      'cursor-pointer rounded-full border-0 bg-transparent outline-none',
      'm-1 size-10',
      'transition-[filter,background-color] duration-150 ease-in-out',
      '[&_svg]:w-full [&_svg]:align-middle',
      isActive
        ? 'bg-primary'
        : 'brightness-[0.65] grayscale hover:brightness-0',
    )}
  >
    <Icon name={icon} />
  </button>
);

type BlockButtonProps = {
  format: string;
  icon: string;
  tooltip?: string | null;
};

export const BlockButton = ({
  format,
  icon,
  tooltip = null,
}: BlockButtonProps) => {
  const editor = useSlate();
  return (
    <ToolbarButton
      isActive={isBlockActive(editor, format)}
      icon={icon}
      tooltip={tooltip || format}
      action={() => toggleBlock(editor, format)}
    />
  );
};

type MarkButtonProps = {
  format: string;
  icon: string;
  tooltip?: string | null;
};

export const MarkButton = ({
  format,
  icon,
  tooltip = null,
}: MarkButtonProps) => {
  const editor = useSlate();

  return (
    <ToolbarButton
      isActive={isMarkActive(editor, format)}
      icon={icon}
      tooltip={tooltip || format}
      action={() => toggleMark(editor, format)}
    />
  );
};
