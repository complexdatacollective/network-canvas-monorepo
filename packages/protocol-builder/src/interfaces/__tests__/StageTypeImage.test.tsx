import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { STAGE_TYPES } from '../../stage-types.ts';
import StageTypeImage, { defaultStageImage } from '../StageTypeImage.tsx';

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
    expect(img.getAttribute('width')).toBe(String(defaultStageImage.width));
    expect(img.getAttribute('height')).toBe(String(defaultStageImage.height));
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('resolves the placeholder to a real asset URL', () => {
    // A build that failed to emit the file would leave this empty, and every
    // unknown stage type would render a broken image rather than a
    // placeholder.
    expect(defaultStageImage.src).toMatch(/stage--Default[^/]*\.webp$/);
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
