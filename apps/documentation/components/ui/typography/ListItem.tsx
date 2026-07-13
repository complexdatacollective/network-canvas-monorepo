import { cx } from '@codaco/fresco-ui/utils/cva';

const baseParagraphClasses = 'text-pretty font-normal';

type ListItemProps = React.HTMLAttributes<HTMLLIElement> & {
  children: React.ReactNode;
  className?: string;
};

export function ListItem({ children, className }: ListItemProps) {
  return (
    <li
      className={cx(
        baseParagraphClasses,
        'pl-2 [&>ol]:mt-2 [&>ol]:mb-0 [&>ul]:mt-2 [&>ul]:mb-0',
        className,
      )}
    >
      {children}
    </li>
  );
}
