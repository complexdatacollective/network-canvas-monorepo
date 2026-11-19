import {
  type AssetBlockUrlProblem,
  assetBlocksInMessage,
  isAssetBlockKind,
} from '../../localization/assetBlock.ts';
import type { LocalizedStringHit } from '../../utils/collectLocalizedStrings.ts';

type AssetBlockProblem = Readonly<{
  message: string;
  path: (string | number)[];
}>;

type AssetManifest = Readonly<Record<string, Readonly<{ type: string }>>>;

const describeUrlProblem = (problem: AssetBlockUrlProblem): string => {
  if (problem.kind === 'noAsset') {
    return 'A file shown in this text does not name an asset.';
  }
  if (problem.kind === 'unknownSetting') {
    return `A file shown in this text has a setting "${problem.setting}", which is not one a file can have.`;
  }
  return `A file shown in this text has "${problem.value}" for its setting "${problem.setting}", which that setting cannot be.`;
};

/**
 * What is wrong with the files a protocol's text shows as blocks (see
 * `AssetBlock`): a file that is not among the protocol's assets, one that is
 * not an image, audio or video, and an address written with a setting or a
 * value no block has. Each language is checked on its own, since each holds
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
                message: describeUrlProblem(problem),
                path,
              }));
              if (block.assetId === '') return found;
              const asset = assetManifest?.[block.assetId];
              if (asset === undefined) {
                return [
                  ...found,
                  {
                    message: `This text shows the file "${block.assetId}", which is not an asset in the manifest.`,
                    path,
                  },
                ];
              }
              if (!isAssetBlockKind(asset.type)) {
                return [
                  ...found,
                  {
                    message: `This text shows the file "${block.assetId}", which must be an 'image', 'audio' or 'video' asset, but is of type "${asset.type}".`,
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
