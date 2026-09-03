import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StageSequenceRail } from '~/components/protocol-gallery/StageSequenceRail';
import type { ProtocolDownload } from '~/lib/protocolGallery';
import { renderWithIntl } from '~/test/renderWithIntl';

function download(wave: number, labels: string[]): ProtocolDownload {
  return {
    wave,
    protocolFilename: `wave${wave}.netcanvas`,
    protocolPath: `/wave${wave}.netcanvas`,
    codebookFilename: `wave${wave}.pdf`,
    codebookPath: `/wave${wave}.pdf`,
    stages: labels.map((label) => ({ type: 'Information', label })),
  };
}

describe('StageSequenceRail', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a single wave without a tab rail', () => {
    renderWithIntl(
      <StageSequenceRail downloads={[download(1, ['Welcome'])]} />,
    );

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByText('Welcome')).toBeInTheDocument();
  });

  it('switches between waves with tabs', () => {
    renderWithIntl(
      <StageSequenceRail
        downloads={[
          download(1, ['Baseline intro']),
          download(2, ['Follow-up intro']),
        ]}
      />,
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Wave 1', 'Wave 2']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Baseline intro')).toBeInTheDocument();
    expect(screen.queryByText('Follow-up intro')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Wave 2' }));

    expect(screen.getByRole('tab', { name: 'Wave 2' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Follow-up intro')).toBeInTheDocument();
    expect(screen.queryByText('Baseline intro')).toBeNull();
  });
});
