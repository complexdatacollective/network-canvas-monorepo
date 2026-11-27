import {
  type AssetBlockProblem as AssetBlockWritingProblem,
  assetBlocksInMessage,
  isAssetBlockKind,
} from '../../localization/assetBlock.ts';
import { assetInManifest } from '../../localization/assetBlockDisplay.ts';
import type { LocalizedStringHit } from '../../utils/collectLocalizedStrings.ts';

type AssetBlockProblem = Readonly<{
  message: string;
  path: (string | number)[];
}>;

type AssetManifest = Readonly<Record<string, Readonly<{ type: string }>>>;

const PLACEMENT_PROBLEMS = {
  notInParagraph:
    'A file in this document is written inside a heading, a link, a quotation or formatted words, where it cannot be shown. Write it in a paragraph or a list item.',
  byReference:
    'A file in this document is named through a reference, which cannot be shown. Write its address in the image itself.',
  holdsValue:
    'A file in this document has a value in its description or its address, where one cannot be shown.',
} as const;

const describeProblem = (problem: AssetBlockWritingProblem): string => {
  if (problem.kind === 'noAsset') {
    return 'A file in this document does not name an asset.';
  }
  if (problem.kind === 'unknownSetting') {
    return `A file in this document has a setting "${problem.setting}", which is not one a file can have.`;
  }
  if (problem.kind === 'invalidValue') {
    return `A file in this document has "${problem.value}" for its setting "${problem.setting}", which that setting cannot be.`;
  }
  return PLACEMENT_PROBLEMS[problem.kind];
};

/**
 * What is wrong with the files a protocol's text shows as blocks (see
 * `AssetBlock`): a file that is not among the protocol's assets, one that is
 * not an image, audio or video, an address written with a setting or a
 * value no block has, and a block written where none can be shown (see
 * `AssetBlockPlacementProblem`). Each language is checked on its own, since each holds
 * its own blocks.
 *
 * Only text declared to hold blocks is checked. An image written into any
 * other text is not shown, there as before, so it is not a reference to
 * anything.
 */
export const findAssetBlockProblems = (
  assetManifest: AssetManifest | undefined,
  localizedStrings: readonly LocalizedStringHit[],
): AssetBlockProblem[] =>
  localizedStrings.flatMap((hit) =>
    hit.assetBlocks === true
      ? Object.entries(hit.value).flatMap(([locale, message]) => {
          const path = [...hit.path, locale];
          return assetBlocksInMessage(message).flatMap(
            ({ block, problems }): AssetBlockProblem[] => {
              const found = problems.map((problem) => ({
                message: describeProblem(problem),
                path,
              }));
              if (block.assetId === '') return found;
              // An address holding a value names no file until it is shown.
              if (problems.some((problem) => problem.kind === 'holdsValue')) {
                return found;
              }
              const asset = assetInManifest(assetManifest, block.assetId);
              if (asset === undefined) {
                return [
                  ...found,
                  {
                    message: `This document shows the file "${block.assetId}", which is not an asset in the manifest.`,
                    path,
                  },
                ];
              }
              if (!isAssetBlockKind(asset.type)) {
                return [
                  ...found,
                  {
                    message: `This document shows the file "${block.assetId}", which must be an 'image', 'audio' or 'video' asset, but is of type "${asset.type}".`,
                    path,
                  },
                ];
              }
              return found;
            },
          );
        })
      : [],
  );
