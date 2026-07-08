import Icon from '~/lib/legacy-ui/components/Icon';
import { cx } from '~/utils/cva';

type FieldErrorProps = {
  error?: string | null;
  show?: boolean;
  className?: string;
};

const FieldError = ({
  error = null,
  show = false,
  className,
}: FieldErrorProps) => (
  <div
    className={cx(
      // overflow-hidden matters when hidden: without it the collapsed
      // (max-h-0) box still paints its overflowing content, which invisibly
      // covers — and steals pointer events from — elements rendered below.
      'bg-destructive text-destructive-contrast flex max-h-0 items-center overflow-hidden rounded-b-sm p-0 opacity-0',
      'transition-[opacity,max-height] duration-300 ease-in-out',
      '[&_svg]:max-h-5',
      show && 'max-h-12.5 p-1 opacity-100',
      className,
    )}
  >
    <Icon name="warning" /> {error}
  </div>
);

export default FieldError;
