import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import IntroPanel from '../IntroPanel';

const renderPanel = (panel: Parameters<typeof IntroPanel>[0]) =>
  render(
    <InterviewI18nProvider requestedLocale="en">
      <TestProtocolLocalization>
        <IntroPanel {...panel} />
      </TestProtocolLocalization>
    </InterviewI18nProvider>,
  );

describe('IntroPanel', () => {
  it('shows the title and the text beneath it', () => {
    renderPanel({
      title: { en: 'About your contacts' },
      text: { en: 'A few questions about each person.' },
    });

    expect(
      screen.getByRole('heading', { level: 1, name: 'About your contacts' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A few questions about each person.'),
    ).toBeInTheDocument();
  });

  // A panel's text is optional: published protocols show only a title.
  it('shows only the title when the panel has no text', () => {
    const { container } = renderPanel({ title: { en: 'Wave 2' } });

    const heading = screen.getByRole('heading', { level: 1, name: 'Wave 2' });
    expect(heading.parentElement?.children).toHaveLength(1);
    expect(container).toHaveTextContent(/^Wave 2$/);
  });
});
