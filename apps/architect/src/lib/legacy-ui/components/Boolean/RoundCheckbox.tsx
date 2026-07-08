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
      'size-10 basis-10 rounded-full',
      'border-outline border-2 border-solid',
      'transition-[border-color,background-color] duration-300 ease-in-out',
      'mr-5',
      '[&_svg]:size-5 [&_svg]:opacity-0 [&_svg]:transition-opacity [&_svg]:duration-300 [&_svg]:ease-in-out',
      checked && 'border-transparent [&_svg]:opacity-100',
      checked && (negative ? 'bg-destructive' : 'bg-input-active'),
    )}
  >
    <Icon name={negative ? 'cross' : 'tick'} className="text-white" />
  </div>
);

export default RoundCheckbox;
