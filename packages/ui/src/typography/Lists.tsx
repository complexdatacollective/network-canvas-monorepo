import { cn } from "../utils";

export type UnorderedListProps = React.HTMLAttributes<HTMLUListElement> & {
  children: React.ReactNode;
  className?: string;
};

export function UnorderedList({
  children,
  className,
}: UnorderedListProps) {
  return (
    <ul className={cn('my-4 ml-8 list-disc [&>li]:mt-2 text-base', className)}>
      {children}
    </ul>
  );
}

export type OrderedListProps = React.HTMLAttributes<HTMLOListElement> & {
  children: React.ReactNode;
  className?: string;
};

export function OrderedList({
  children,
  className,
}: OrderedListProps) {
  return (
    <ol className={cn('my-4 ml-8 list-decimal [&>li]:mt-2 text-base', className)}>
      {children}
    </ol>
  );
}

export type ListItemProps = React.HTMLAttributes<HTMLLIElement> & {
  children: React.ReactNode;
  className?: string;
};

export function ListItem({
  children,
  className,
}: ListItemProps) {
  return (
    <li className={cn('text-pretty', className)}>
      {children}
    </li>
  );
}

