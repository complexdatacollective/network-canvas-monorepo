import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ResourceInspection } from '../../types.ts';
import ResourceSummary from '../ResourceSummary.tsx';

const filedUnder = (digit: string, extension: string): string =>
  `${digit.repeat(64)}${extension}`;

function stagedImage(source: string): ResourceInspection {
  return {
    descriptor: {
      id: 'staged-image',
      kind: 'image',
      name: 'portrait.png',
      status: 'staged',
      source,
      byteLength: 2048,
      contentType: 'image/png',
    },
  };
}

describe('the file a summary names', () => {
  it('never reads back a name worked out from the bytes', () => {
    const source = filedUnder('d', '.png');

    render(<ResourceSummary inspection={stagedImage(source)} />);

    expect(screen.getByText('portrait.png')).toBeVisible();
    expect(document.body.textContent ?? '').not.toContain(source);
    expect(screen.queryByText('File')).not.toBeInTheDocument();
  });

  it('names the file a host kept the researcher’s own name for', () => {
    render(<ResourceSummary inspection={stagedImage('holiday snap.png')} />);

    expect(screen.getByText('File')).toBeVisible();
    expect(screen.getByText('holiday snap.png')).toBeVisible();
  });
});
