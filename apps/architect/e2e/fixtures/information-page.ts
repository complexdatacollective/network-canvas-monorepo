import type { CurrentProtocol } from '@codaco/protocol-validation';

import { Timeline } from '../pageobjects/timeline.js';
import { test as base, gotoProtocol } from './architect-test.js';
import { emptyProtocol, type SeedAsset } from './seed.js';

// An Information stage's page is ONE rich text: a heading is a heading in it,
// and each image, audio recording or video is a block in it, saved as a
// markdown image whose address names a protocol resource
// (`![alt](asset:<id>?size=medium)`). These build a protocol whose first stage
// is such a page, and the files its blocks name.

/** The name of the Information stage `informationProtocol` makes. */
const INFORMATION_STAGE_NAME = 'About This Study';

const PHOTO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">
  <rect width="80" height="80" fill="#6ecae8" />
</svg>`;

const GARDEN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">
  <rect width="120" height="80" fill="#8fd18f" />
</svg>`;

/** One image among the protocol's resources. */
export const PHOTO_ASSET = {
  'photo-asset': {
    name: 'photo.svg',
    type: 'image' as const,
    source: 'photo.svg',
  },
};

// A second image, a recording and a video, for a page with more than one kind
// of file, or more than one file to choose between.
const MORE_ASSETS = {
  'garden-asset': {
    name: 'garden.svg',
    type: 'image' as const,
    source: 'garden.svg',
  },
  'clip-asset': {
    name: 'clip.mp4',
    type: 'video' as const,
    source: 'clip.mp4',
  },
};

/**
 * A protocol whose first stage is an Information stage named
 * `INFORMATION_STAGE_NAME` holding `content`, with `PHOTO_ASSET` among its
 * resources — and with `moreFiles`, a second image and a video as well.
 */
export function informationProtocol(
  content: string,
  { moreFiles = false }: { moreFiles?: boolean } = {},
): CurrentProtocol {
  return {
    ...emptyProtocol(),
    assetManifest: moreFiles ? { ...PHOTO_ASSET, ...MORE_ASSETS } : PHOTO_ASSET,
    stages: [
      {
        id: 'info-1',
        type: 'Information',
        label: { en: INFORMATION_STAGE_NAME },
        content: { en: content },
      },
      ...emptyProtocol().stages,
    ],
  };
}

/** The stored file of `PHOTO_ASSET`, with no kind, so it is not drawn. */
export const PHOTO_FILE: SeedAsset[] = [
  { assetId: 'photo-asset', name: 'photo.svg', data: PHOTO_SVG },
];

/** Every file `informationProtocol` can name, each stored as the kind it is, so it is drawn. */
export const DRAWN_FILES: SeedAsset[] = [
  {
    assetId: 'photo-asset',
    name: 'photo.svg',
    data: PHOTO_SVG,
    mediaType: 'image/svg+xml',
  },
  {
    assetId: 'garden-asset',
    name: 'garden.svg',
    data: GARDEN_SVG,
    mediaType: 'image/svg+xml',
  },
  { assetId: 'clip-asset', name: 'clip.mp4', data: 'not a video' },
];

type InformationPageFixtures = {
  /**
   * Seeds `protocol` with `files`, opens it, and opens its Information stage
   * (named `INFORMATION_STAGE_NAME`) in the stage editor.
   */
  openInformationPage: (
    protocol: CurrentProtocol,
    files: SeedAsset[],
  ) => Promise<void>;
};

export const test = base.extend<InformationPageFixtures>({
  openInformationPage: async ({ architectPage, seed }, use) => {
    await use(async (protocol, files) => {
      await seed(protocol, { assets: files });
      await gotoProtocol(architectPage);
      await new Timeline(architectPage).openStage(INFORMATION_STAGE_NAME);
    });
  },
});

export { expect, gotoProtocol } from './architect-test.js';
