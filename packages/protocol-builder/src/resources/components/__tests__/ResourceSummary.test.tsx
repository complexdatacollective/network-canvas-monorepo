import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ResourceInspection } from '../../types.ts';
import ResourceSummary from '../ResourceSummary.tsx';

function image(
  status: 'staged' | 'committed',
  source: string,
): ResourceInspection {
  return {
    descriptor: {
      id: 'image',
      kind: 'image',
      name: 'portrait.png',
      status,
      source,
      byteLength: 2048,
      contentType: 'image/png',
    },
  };
}

describe('the file a summary names', () => {
  it('names the file a staged import was picked as', () => {
    render(
      <ResourceSummary inspection={image('staged', 'holiday snap.png')} />,
    );

    expect(screen.getByText('File')).toBeVisible();
    expect(screen.getByText('holiday snap.png')).toBeVisible();
  });

  it('keeps the name a host files committed bytes under to itself', () => {
    const source = `${'d'.repeat(64)}.png`;

    render(<ResourceSummary inspection={image('committed', source)} />);

    expect(screen.getByText('portrait.png')).toBeVisible();
    expect(document.body.textContent ?? '').not.toContain(source);
    expect(screen.queryByText('File')).not.toBeInTheDocument();
  });
});
