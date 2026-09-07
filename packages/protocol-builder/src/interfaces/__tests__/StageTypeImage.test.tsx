import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import { STAGE_TYPES } from '../../stage-types.ts';
import { interfaceDisplayName } from '../interfaceNames.ts';
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
        `Preview of ${interfaceDisplayName(stageType)}`,
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
      name: 'Preview of SomeFutureInterface',
    });
    expect(img.getAttribute('src')).toBe(defaultStageImage.src);
    // Literal expected values, not `defaultStageImage.width/height` — those
    // are the same constants the component reads, so comparing against them
    // would pass no matter what they were set to. 448x307 is the actual
    // pixel size of packages/protocol-builder/src/interfaces/assets/stage--Default.webp
    // (verified with `file stage--Default.webp`), which is the source of
    // truth the constants exist to mirror.
    expect(img.getAttribute('width')).toBe('448');
    expect(img.getAttribute('height')).toBe('307');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('resolves the placeholder to an absolute asset URL', () => {
    // `new URL('./assets/stage--Default.webp', import.meta.url)` must
    // actually resolve — if it silently fell back to the bare relative
    // specifier, this would still end in the filename (an unresolved
    // `./assets/stage--Default.webp` matches a suffix-only pattern), but it
    // would not be an absolute URL, and every unknown stage type would
    // render a broken image rather than a placeholder.
    expect(defaultStageImage.src).toMatch(/^(file:|https?:)/);
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

it('updates localized preview names and preserves explicitly decorative images', () => {
  const view = (locale: string) => (
    <AppI18nProvider
      locale={locale}
      locales={ecosystemLocales}
      messages={protocolBuilderCatalogs[locale]}
    >
      <StageTypeImage type="NetworkComposer" />
      <StageTypeImage type="Information" alt="" />
    </AppI18nProvider>
  );
  const { rerender, container } = render(view('en'));
  expect(
    screen.getByRole('img', { name: 'Preview of Network Composer' }),
  ).toBeInTheDocument();
  rerender(view('es'));
  expect(
    screen.getByRole('img', { name: 'Vista previa de Compositor de redes' }),
  ).toBeInTheDocument();
  expect(container.querySelector('img[alt=""]')).toBeInTheDocument();
});
