import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import BackgroundLights from '../BackgroundLights/BackgroundLights';

describe('BackgroundLights component', () => {
  it('renders one DOM light per configured blob count', () => {
    const { container } = render(
      <BackgroundLights
        large={1}
        medium={2}
        small={3}
        colors={['#ff0000']}
        blendMode="color-dodge"
      />,
    );

    const root = container.querySelector('[aria-hidden="true"]');
    expect(root).not.toBeNull();
    expect(root?.children).toHaveLength(6);

    const lights = [...(root?.children ?? [])] as HTMLElement[];
    for (const light of lights) {
      expect(light.style.background).toContain('radial-gradient');
      expect(light.style.background).toContain('rgb(255, 0, 0)');
      expect(light.style.mixBlendMode).toBe('color-dodge');
    }
  });

  it('renders no light elements when all layer counts are zero', () => {
    const { container } = render(
      <BackgroundLights large={0} medium={0} small={0} />,
    );

    const root = container.querySelector('[aria-hidden="true"]');
    expect(root).not.toBeNull();
    expect(root?.children).toHaveLength(0);
  });
});
