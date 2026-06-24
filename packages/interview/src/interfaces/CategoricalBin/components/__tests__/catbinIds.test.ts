import { describe, expect, it } from 'vitest';

import {
  getCatBinDropTargetId,
  getCatBinLayoutId,
  getCatBinListId,
} from '../CategoricalBinItem';

describe('CategoricalBin id derivation', () => {
  const stageId = 'stage-1';
  const promptId = 'prompt-1';

  // Two options sharing the same label but different values must not collide.
  it('derives distinct list ids for duplicate labels by index', () => {
    expect(getCatBinListId(stageId, promptId, 0)).not.toBe(
      getCatBinListId(stageId, promptId, 1),
    );
  });

  it('derives distinct layout ids for duplicate labels by index', () => {
    expect(getCatBinLayoutId(promptId, 0)).not.toBe(
      getCatBinLayoutId(promptId, 1),
    );
  });

  it('derives distinct drop-target ids for duplicate labels by index', () => {
    expect(getCatBinDropTargetId(stageId, promptId, 0)).not.toBe(
      getCatBinDropTargetId(stageId, promptId, 1),
    );
  });

  it('ids are stable for a given index regardless of label', () => {
    expect(getCatBinListId(stageId, promptId, 2)).toBe(
      getCatBinListId(stageId, promptId, 2),
    );
    expect(getCatBinLayoutId(promptId, 2)).toBe(getCatBinLayoutId(promptId, 2));
    expect(getCatBinDropTargetId(stageId, promptId, 2)).toBe(
      getCatBinDropTargetId(stageId, promptId, 2),
    );
  });
});
