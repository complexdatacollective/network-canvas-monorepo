import { cx } from './utils/cva';

const groupClasses =
  'group text-link focusable rounded-sm font-semibold transition-all duration-300 ease-in-out';
const spanClasses =
  'from-link to-link bg-linear-to-r bg-[length:0%_2px] bg-bottom-left bg-no-repeat pb-[2px] transition-all duration-200 ease-out group-hover:bg-[length:100%_2px]';

export function NativeLink({ className, ...props }: React.ComponentProps<'a'>) {
  return (
    <a className={cx(groupClasses, className)} {...props}>
      <span className={spanClasses}>{props.children}</span>
    </a>
  );
}
