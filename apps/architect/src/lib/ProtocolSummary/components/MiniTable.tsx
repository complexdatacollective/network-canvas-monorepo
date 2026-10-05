import type React from 'react';

import { cva } from '~/utils/cva';

type MiniTableProps = {
  rows?: React.ReactNode[][];
  wide?: boolean;
  rotated?: boolean;
  className?: string;
};

const tableVariants = cva({
  base: [
    'bg-platinum my-5 break-inside-avoid overflow-hidden rounded-sm',
    '[&>thead>tr>th]:text-xs [&>thead>tr>th]:font-semibold [&>thead>tr>th]:tracking-widest [&>thead>tr>th]:break-keep [&>thead>tr>th]:uppercase',
    '[&_:is(td,th)]:px-5 [&_:is(td,th)]:py-2.5',
    '[&_:is(td,th)_:is(ul,ol)]:p-[inherit]',
    '[&_:is(td,th)>p:first-child]:mt-0 [&_:is(td,th)>p:last-child]:mb-0',
    '[&_tr>:is(td,th):not(:last-child)]:border-r-[3px] [&_tr>:is(td,th):not(:last-child)]:border-r-white',
    '[&>thead>tr>th]:border-b-[3px] [&>thead>tr>th]:border-b-white',
    '[&>tbody>tr:not(:last-child)>td]:border-b-[3px] [&>tbody>tr:not(:last-child)>td]:border-b-white',
  ],
  variants: {
    wide: { true: 'w-full' },
    rotated: {
      true: '[&>tbody>tr>td:first-child]:text-right [&>tbody>tr>td:first-child]:text-xs [&>tbody>tr>td:first-child]:font-semibold [&>tbody>tr>td:first-child]:tracking-widest [&>tbody>tr>td:first-child]:wrap-break-word [&>tbody>tr>td:first-child]:whitespace-nowrap [&>tbody>tr>td:first-child]:uppercase',
    },
  },
});

const MiniTable = ({
  rows = [],
  wide = false,
  rotated = false,
  className,
}: MiniTableProps) => {
  return (
    <table className={tableVariants({ wide, rotated, class: className })}>
      {!rotated && rows.length > 0 && (
        <thead>
          <tr key="0">
            {rows[0]?.map((column, m) => (
              <th key={`header-col-${m}`}>{column}</th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {[...(!rotated ? rows.slice(1) : rows)].map((row, n) => (
          <tr key={`row-${n}`}>
            {row.map((column, m) => (
              <td key={`col-${m}`}>{column}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default MiniTable;
