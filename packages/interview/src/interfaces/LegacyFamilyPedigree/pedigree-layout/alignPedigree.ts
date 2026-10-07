import { sugiyamaLayout } from './sugiyamaLayout';
import type { Hints, PedigreeInput, PedigreeLayout } from './types';

export function alignPedigree(
  ped: PedigreeInput,
  _options: {
    packed?: boolean;
    width?: number;
    align?: boolean | number[];
    hints?: Hints;
  } = {},
): PedigreeLayout {
  return sugiyamaLayout(ped);
}
