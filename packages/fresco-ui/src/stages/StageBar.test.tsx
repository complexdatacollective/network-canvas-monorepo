import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { paletteColorStyles } from '../styles/palette';
import { StageBar } from './StageBar';
import { STAGE_TYPE_COLORS, UNKNOWN_STAGE_COLOR } from './stageTypes';

const stages = [
  { type: 'Information' },
  { type: 'NameGenerator' },
  { type: 'Sociogram' },
  { type: 'FutureInterface' },
];

describe('StageBar', () => {
  it('draws one segment per stage in the stage type colour', () => {
    const { container } = render(<StageBar stages={stages} />);

    const segments = [...container.querySelectorAll('span')];
    expect(segments).toHaveLength(stages.length);
    expect(segments[1]).toHaveStyle({
      backgroundColor:
        paletteColorStyles[STAGE_TYPE_COLORS.NameGenerator].color,
    });
    expect(segments[2]).toHaveStyle({
      backgroundColor: paletteColorStyles[STAGE_TYPE_COLORS.Sociogram].color,
    });
  });

  it('falls back to the unknown colour for a stage type it does not know', () => {
    const { container } = render(<StageBar stages={stages} />);

    const [, , , unknown] = container.querySelectorAll('span');
    expect(unknown).toHaveStyle({
      backgroundColor: paletteColorStyles[UNKNOWN_STAGE_COLOR].color,
    });
  });

  it('is decoration unless given a label', () => {
    const { container } = render(<StageBar stages={stages} />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('is exposed as a named image when given a label', () => {
    render(<StageBar stages={stages} label="4 stages: 1 sociogram" />);

    const bar = screen.getByRole('img', { name: '4 stages: 1 sociogram' });
    expect(bar).not.toHaveAttribute('aria-hidden');
  });

  it('renders on the server', () => {
    const markup = renderToStaticMarkup(<StageBar stages={stages} />);

    expect(markup).toMatch(/^<div[^>]*aria-hidden="true"/);
    expect(markup.match(/<span/g)).toHaveLength(stages.length);
  });
});
