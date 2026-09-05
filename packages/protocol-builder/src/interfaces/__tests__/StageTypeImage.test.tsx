import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { STAGE_TYPES } from '../../stage-types.ts';
import StageTypeImage, { defaultStageImage } from '../StageTypeImage.tsx';

/**
 * The intrinsic size of the placeholder file, read out of its own WebP header.
 * `defaultStageImage` has to state its dimensions as literals — the asset
 * pipeline hands back a URL and nothing else — so this is the only thing that
 * keeps the shipped file and the box reserved for it from drifting apart.
 *
 * The path is joined from `import.meta.dirname` rather than resolved through
 * `new URL(…, import.meta.url)`, which the bundler would rewrite into the same
 * served asset URL the component gets, leaving nothing to read.
 */
function placeholderAssetSize() {
  const bytes = readFileSync(
    join(import.meta.dirname, '../assets/stage--Default.webp'),
  );

  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
  // Only the lossy form is read. A re-encode to VP8L or VP8X stops here rather
  // than being waved through, and whoever made it re-reads the numbers.
  expect(bytes.toString('ascii', 12, 16)).toBe('VP8 ');

  // VP8 keyframe header: a 3-byte start code at 23, then the 14-bit width and
  // height, each in the low bits of a little-endian 16-bit word.
  expect(bytes.toString('hex', 23, 26)).toBe('9d012a');
  return {
    width: bytes.readUInt16LE(26) & 0x3fff,
    height: bytes.readUInt16LE(28) & 0x3fff,
  };
}

describe('StageTypeImage', () => {
  it('renders the generated screenshot for every stage type', () => {
    expect(STAGE_TYPES.length).toBeGreaterThan(0);

    for (const stageType of STAGE_TYPES) {
      const { container, unmount } = render(
        <StageTypeImage type={stageType} ratio="4:3" />,
      );

      const source = container.querySelector('picture > source');
      expect(source, stageType).not.toBeNull();
      expect(source?.getAttribute('type'), stageType).toBe('image/webp');
      expect(source?.getAttribute('srcset'), stageType).toContain('.webp');

      const img = container.querySelector('img');
      expect(img?.getAttribute('src'), stageType).not.toBe(
        defaultStageImage.src,
      );
      expect(img?.getAttribute('alt'), stageType).toBe(
        `${stageType} interface`,
      );

      unmount();
    }
  });

  /**
   * A stage `type` read back out of a protocol is arbitrary text: an imported
   * `.netcanvas` authored against a newer schema can name an interface this
   * build has no screenshot for. Without the placeholder branch the manifest
   * lookup inside `InterfacePicture` throws and takes the whole screen down.
   */
  it('renders the placeholder for a stage type with no generated screenshot', () => {
    const { container } = render(
      <StageTypeImage type="SomeFutureInterface" ratio="4:3" />,
    );

    expect(container.querySelector('picture')).toBeNull();

    const img = screen.getByRole('img', {
      name: 'SomeFutureInterface interface',
    });
    expect(img.getAttribute('src')).toBe(defaultStageImage.src);
    // The file's own intrinsic size, as literals: `defaultStageImage`'s
    // numbers are what is under test here, and comparing them to themselves
    // passes for whatever they drift to. The attributes reserve the right box
    // while the image loads, so a grid of placeholders does not reflow once
    // they arrive.
    expect(img.getAttribute('width')).toBe('448');
    expect(img.getAttribute('height')).toBe('307');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('claims the size the placeholder file actually is', () => {
    expect(placeholderAssetSize()).toEqual({ width: 448, height: 307 });
    expect(defaultStageImage.width).toBe(448);
    expect(defaultStageImage.height).toBe(307);
  });

  it('resolves the placeholder to a real asset URL', () => {
    // The whole point of `new URL(…, import.meta.url)` is that the pipeline
    // REWRITES it to wherever the asset was emitted. A specifier that came
    // through unresolved still carries the file name, so matching the name
    // alone cannot tell the two apart — and a relative specifier would be
    // fetched relative to whatever document is on screen, so every unknown
    // stage type would render a broken image. Resolved first, then the name.
    expect(defaultStageImage.src).toMatch(/^(?:file|https?):\/\//);
    // A production build fingerprints the emitted file, so the stem is the
    // part that survives every pipeline.
    expect(new URL(defaultStageImage.src).pathname).toMatch(
      /\/stage--Default[^/]*\.webp$/,
    );
  });

  it('lets a caller name the placeholder and pass presentation through', () => {
    render(
      <StageTypeImage
        type="SomeFutureInterface"
        alt="Interface preview"
        className="rounded-sm"
        loading="eager"
      />,
    );

    const img = screen.getByRole('img', { name: 'Interface preview' });
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img).toHaveClass('rounded-sm');
  });

  it('lets a caller name a generated screenshot', () => {
    render(<StageTypeImage type="Sociogram" alt="Sociogram preview" />);

    expect(
      screen.getByRole('img', { name: 'Sociogram preview' }),
    ).toBeInTheDocument();
  });
});
