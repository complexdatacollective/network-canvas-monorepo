import { cn } from '../utils';
import { baseParagraphClasses } from './Paragraph';

export type UnorderedListProps = React.HTMLAttributes<HTMLUListElement> & {
  children: React.ReactNode;
  className?: string;
};

const listContainerClasses = cn(
  'my-5 ml-8 text-base [&>li]:mt-2',
  // '[&:not(:first-child)]:my-0',
);

export function UnorderedList({ children, className }: UnorderedListProps) {
  return (
    <ul className={cn(listContainerClasses, 'list-disc', className)}>
      {children}
    </ul>
  );
}

export type OrderedListProps = React.HTMLAttributes<HTMLOListElement> & {
  children: React.ReactNode;
  className?: string;
};

export function OrderedList({ children, className }: OrderedListProps) {
  return (
    <ol className={cn(listContainerClasses, 'list-decimal', className)}>
      {children}
    </ol>
  );
}

export type ListItemProps = React.HTMLAttributes<HTMLLIElement> & {
  children: React.ReactNode;
  className?: string;
};

export function ListItem({ children, className }: ListItemProps) {
  return (
    <li
      className={cn(
        baseParagraphClasses,
        'pl-2 [&>ol]:mb-0 [&>ul]:mb-0',
        className,
      )}
    >
      {children}
    </li>
  );
}
