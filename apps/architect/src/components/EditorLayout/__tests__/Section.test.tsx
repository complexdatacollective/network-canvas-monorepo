import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Section from '../Section';

/**
 * A stage editor stacks a dozen of these. Every toggle used to carry the same
 * hard-coded `title` ("Turn this feature on or off"), so a researcher listing
 * the page's switches heard one control repeated — and the Experiments page's
 * switch, carrying no `title` at all, had no name whatsoever.
 */
describe('<Section /> toggle', () => {
  it('takes its accessible name from the section heading', () => {
    render(
      <Section toggleable title="Skip Logic">
        <p>Contents</p>
      </Section>,
    );

    expect(screen.getByRole('switch', { name: 'Skip Logic' })).toBeVisible();
  });

  it('gives two sections on one page two different switches', () => {
    render(
      <>
        <Section toggleable title="Skip Logic">
          <p>One</p>
        </Section>
        <Section toggleable title="Filter">
          <p>Two</p>
        </Section>
      </>,
    );

    expect(
      screen
        .getAllByRole('switch')
        .map((toggle) => toggle.getAttribute('aria-labelledby')),
    ).toHaveLength(2);
    expect(screen.getByRole('switch', { name: 'Skip Logic' })).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Filter' })).toBeVisible();
    expect(
      screen.queryByRole('switch', { name: /feature on or off/ }),
    ).toBeNull();
  });

  it('names the switch by the heading alone, without the required marker', () => {
    // `required` renders a "*" beside a non-toggleable section's title. A
    // toggleable one is optional by construction, so the marker is absent and
    // the name is exactly the heading — pinned so a future change to that
    // markup cannot quietly append "*" to every switch's name.
    render(
      <Section toggleable title="Validation" required>
        <p>Contents</p>
      </Section>,
    );

    expect(screen.getByRole('switch').getAttribute('aria-label')).toBeNull();
    expect(screen.getByRole('switch', { name: 'Validation' })).toBeVisible();
  });

  it('carries no switch when the section is not toggleable', () => {
    render(
      <Section title="Node Type">
        <p>Contents</p>
      </Section>,
    );

    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('<Section /> content', () => {
  it('renders the fieldset only while the section is open', () => {
    const { container, rerender } = render(
      <Section toggleable title="Skip Logic" startExpanded={false}>
        <p>Contents</p>
      </Section>,
    );

    expect(container.querySelector('fieldset')).toBeNull();
    expect(screen.queryByText('Contents')).toBeNull();

    rerender(
      <Section toggleable title="Skip Logic" startExpanded>
        <p>Contents</p>
      </Section>,
    );

    expect(container.querySelector('fieldset')).not.toBeNull();
    expect(screen.getByText('Contents')).toBeVisible();
  });

  it('shows the disabled message without rendering a fieldset', () => {
    const { container } = render(
      <Section
        disabled
        disabledMessage="Select a node type above to configure this section."
        startExpanded={false}
        title="Prompts"
        toggleable
      >
        <p>Contents</p>
      </Section>,
    );

    expect(container.querySelector('fieldset')).toBeNull();
    expect(
      screen.getByText('Select a node type above to configure this section.'),
    ).toBeVisible();
  });
});
