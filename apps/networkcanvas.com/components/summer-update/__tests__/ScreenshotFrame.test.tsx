import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ScreenshotFrame } from '../ScreenshotFrame';

vi.mock('next/image', () => ({
  default: ({
    alt,
    className,
    src,
  }: {
    alt: string;
    className?: string;
    src: string;
  }) => <img src={src} alt={alt} className={className} />,
}));

describe('ScreenshotFrame', () => {
  it('contains screenshots in a 7:5 frame by default', () => {
    render(
      <ScreenshotFrame
        address="example.com"
        alt="Example screenshot"
        src="/example.png"
      />,
    );

    const screenshot = screen.getByRole('img', {
      name: 'Example screenshot',
    });

    expect(screenshot).toHaveClass('object-contain');
    expect(screenshot.parentElement).toHaveClass('aspect-7/5', 'bg-white');
  });

  it('supports source images authored at 4:3', () => {
    render(
      <ScreenshotFrame
        address="example.com"
        alt="Four by three screenshot"
        aspectRatio="4:3"
        src="/example.png"
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Four by three screenshot' })
        .parentElement,
    ).toHaveClass('aspect-4/3');
  });
});
