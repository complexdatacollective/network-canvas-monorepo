import { cx } from '~/utils/cva';

import Icon from '../Icon';

type RoundCheckboxProps = {
  checked?: boolean;
  negative?: boolean;
};

const RoundCheckbox = ({
  checked = false,
  negative = false,
}: RoundCheckboxProps) => (
  <div
    className={cx(
      'box-content inline-flex shrink-0 items-center justify-center',
      'size-(--space-xl) basis-(--space-xl) rounded-full',
      'border-border border-2 border-solid',
      'transition-[border-color,background-color] duration-(--animation-duration-standard) ease-(--animation-easing)',
      'mr-(--space-md)',
      '[&_svg]:size-(--space-md) [&_svg]:opacity-0 [&_svg]:transition-opacity [&_svg]:duration-(--animation-duration-standard) [&_svg]:ease-(--animation-easing)',
      checked && 'border-transparent [&_svg]:opacity-100',
      checked && (negative ? 'bg-error' : 'bg-input-active'),
    )}
  >
    <Icon name={negative ? 'cross' : 'tick'} color="white" />
  </div>
);

export default RoundCheckbox;
