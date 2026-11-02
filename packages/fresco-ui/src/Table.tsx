'use client';

import * as React from 'react';

import Surface from './layout/Surface';
import { cx } from './utils/cva';

/**
 * Whether the element's content overflows it, kept current as the element or
 * its children resize. The same signal `ScrollArea` derives its tab stop from:
 * a scrolling box that nothing inside can focus is unreachable by keyboard.
 */
function useScrolls(ref: React.RefObject<HTMLElement | null>) {
  const [scrolls, setScrolls] = React.useState(false);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const measure = () =>
      setScrolls(
        element.scrollWidth > element.clientWidth ||
          element.scrollHeight > element.clientHeight,
      );
    const observer = new ResizeObserver(measure);
    // The scroller's own box is pinned by its layout; it is the table inside
    // that grows when columns widen or rows arrive.
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, [ref]);

  return scrolls;
}

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & {
    surfaceProps?: React.ComponentProps<typeof Surface>;
    bodyScroll?: boolean;
    /** Classes for the element that scrolls the table, such as its scrollbars' look. */
    scrollerClassName?: string;
  }
>(
  (
    {
      className,
      surfaceProps,
      bodyScroll = false,
      scrollerClassName,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      ...props
    },
    ref,
  ) => {
    const scrollerRef = React.useRef<HTMLElement>(null);
    const scrolls = useScrolls(scrollerRef);
    // Like `ScrollArea`, the scroller is a tab stop only while it scrolls, and
    // a named `<section>` (a `region` landmark) only while it is a tab stop, so
    // that a table which fits adds neither a stop nor a landmark.
    const scrollerName = scrolls
      ? { 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }
      : undefined;

    return (
      <Surface
        maxWidth="none"
        spacing="none"
        shadow="none"
        {...surfaceProps}
        className={cx(
          'mx-auto w-full max-w-full overflow-x-auto rounded border',
          bodyScroll && 'flex min-h-0 flex-1 flex-col',
          surfaceProps?.className,
        )}
        noContainer
      >
        <section
          ref={scrollerRef}
          tabIndex={scrolls ? 0 : undefined}
          {...scrollerName}
          className={cx(
            'w-full max-w-full overflow-x-auto overscroll-x-none',
            // Drawn inside: the surface around the scroller clips overflow, so the
            // default outward ring would be cut off.
            scrolls && 'focusable focus-visible:-outline-offset-3',
            bodyScroll && 'min-h-0 flex-1 overflow-y-auto overscroll-y-none',
            scrollerClassName,
          )}
        >
          <table
            ref={ref}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            className={cx('w-full caption-bottom border-collapse', className)}
            {...props}
          />
        </section>
      </Surface>
    );
  },
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cx(
      'publish-colors bg-surface-2 border-collapse [&_tr]:border-b',
      // Override selected color CSS variable so that ColumnHeader buttons use primary instead of selected
      '[--selected-contrast:var(--primary-contrast)] [--selected:var(--primary)]',
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cx(
      '[&_tr:last-child]:border-0',
      '[&_tr:not(:only-child)]:hover:bg-current/3', // Hover effect only on body rows, disabled when empty (single row)
      className,
    )}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cx(
      'bg-primary publish-colors text-primary-contrast font-medium',
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cx(
      'h-14', // Height works the same as min-h for table rows https://stackoverflow.com/questions/19432092/can-i-use-a-min-height-for-table-tr-or-td
      'data-[state=selected]:bg-selected/15 border-b outline-current/20 transition-colors duration-300',
      className,
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cx(
      'w-0 px-6 whitespace-nowrap',
      'text-start font-medium last:w-auto',
      className,
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cx(
      'w-0 px-6 align-middle whitespace-nowrap',
      'last:w-auto',
      className,
    )}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cx('mt-4 text-sm text-current/70', className)}
    {...props}
  />
));
TableCaption.displayName = 'TableCaption';

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
