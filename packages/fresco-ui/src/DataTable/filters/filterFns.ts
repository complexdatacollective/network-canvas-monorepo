import { type Row } from '@tanstack/react-table';

import {
  type DateFilterValue,
  type OperatorFilterValue,
  type RangeFilterValue,
} from './types';

export function rangeFilterFn<TData>(
  row: Row<TData>,
  columnId: string,
  filterValue: RangeFilterValue,
): boolean {
  const value = row.getValue<number>(columnId);
  return value >= filterValue.min && value <= filterValue.max;
}

export function dateFilterFn<TData>(
  row: Row<TData>,
  columnId: string,
  filterValue: DateFilterValue,
): boolean {
  const date = row.getValue<Date>(columnId);
  if (!date) return false;
  const from = new Date(filterValue.from);
  const to = new Date(filterValue.to);
  to.setHours(23, 59, 59, 999);
  return date >= from && date <= to;
}

export function booleanFilterFn<TData>(
  row: Row<TData>,
  columnId: string,
  filterValue: boolean,
): boolean {
  const value = row.getValue(columnId);
  return filterValue ? !!value : !value;
}

export function textFilterFn<TData>(
  row: Row<TData>,
  columnId: string,
  filterValue: string,
): boolean {
  const query = filterValue.trim().toLowerCase();
  if (query.length === 0) return true;
  const cell = row.getValue(columnId);
  if (cell == null) return false;
  return String(cell).toLowerCase().includes(query);
}

export function facetedFilterFn<TData>(
  row: Row<TData>,
  columnId: string,
  filterValue: string[],
): boolean {
  const value = row.getValue<string>(columnId);
  return filterValue.includes(value);
}

export function operatorFilterFn<
  TData extends {
    network: {
      nodes: { type: string; count: number }[];
      edges: { type: string; count: number }[];
    };
  },
>(
  row: Row<TData>,
  _columnId: string,
  filterValue: OperatorFilterValue,
): boolean {
  const network = row.original.network;

  return filterValue.conditions.every((cond) => {
    const entries = network[cond.entityKind];
    const entry = entries.find((e) => e.type === cond.entityType);
    const count = entry?.count ?? 0;

    switch (cond.operator) {
      case 'eq':
        return count === cond.value;
      case 'gt':
        return count > cond.value;
      case 'lt':
        return count < cond.value;
      case 'gte':
        return count >= cond.value;
      case 'lte':
        return count <= cond.value;
      default:
        return true;
    }
  });
}
