import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import architectIcon from '~/images/architect-icon.png';
import { cx } from '~/utils/cva';

type BrandProps = {
  onClick?: () => void;
  className?: string;
  variant?: 'pill' | 'inline' | 'icon';
};

const PILL_CHROME =
  'py-2 pl-2 tablet-portrait:pl-3 pr-4 tablet-portrait:pr-8 rounded-full bg-surface-1 text-surface-1-contrast shadow-sm';
const ROW = 'flex items-center gap-3 tablet-portrait:gap-4 shrink-0';
const INTERACTIVE =
  'cursor-pointer border-none hover:opacity-90 transition-opacity';

const Brand = ({ onClick, className, variant = 'pill' }: BrandProps) => {
  const isPill = variant === 'pill';
  const isIcon = variant === 'icon';

  const iconClassName = 'h-11 w-11';
  const iconImg = (
    <img src={architectIcon} alt="Architect" className={iconClassName} />
  );

  if (isIcon) {
    if (onClick) {
      return (
        <button
          type="button"
          onClick={onClick}
          aria-label="Return to start screen"
          className={cx(
            'flex shrink-0 bg-transparent p-0',
            INTERACTIVE,
            className,
          )}
        >
          {iconImg}
        </button>
      );
    }
    return <div className={cx('shrink-0', className)}>{iconImg}</div>;
  }

  const baseClasses = cx(ROW, isPill && PILL_CHROME);

  const content = (
    <>
      {iconImg}
      <span
        className={headingVariants({
          level: 'h3',
          margin: 'none',
          className: 'font-semibold',
        })}
      >
        Architect
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Return to start screen"
        className={cx(
          baseClasses,
          INTERACTIVE,
          !isPill && 'bg-transparent p-0',
          className,
        )}
      >
        {content}
      </button>
    );
  }

  return <div className={cx(baseClasses, className)}>{content}</div>;
};

export default Brand;
