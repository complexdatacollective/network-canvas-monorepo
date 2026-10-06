import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@codaco/protocol-builder/interfaces/StageTypeImage', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('wouter', async () => {
  const actual = await vi.importActual<typeof import('wouter')>('wouter');
  return { ...actual, useLocation: () => ['/protocol', vi.fn()] };
});

beforeAll(() => {
  // jsdom does not implement scrollIntoView, which the highlight effect calls.
  Element.prototype.scrollIntoView = vi.fn();
});

import { getInterfaceTypes } from './interfaceOptions';
import NewStageScreen from './NewStageScreen';

const renderScreen = (experiments?: { encryptedVariables?: boolean }) => {
  const store = configureStore({
    reducer: {
      activeProtocol: (
        state = {
          past: [],
          present: {
            name: 'Test',
            localization: { defaultLocale: 'en', locales: ['en'] },
            experiments,
          },
          future: [],
        },
      ) => state,
    },
  });
  render(
    <Provider store={store}>
      <NewStageScreen insertAtIndex={0} open onOpenChange={vi.fn()} />
    </Provider>,
  );
};

const capabilityFilter = (name: string) =>
  within(
    screen.getByRole('group', { name: 'Interface capability filters' }),
  ).getByRole('button', { name });

// The cards are the dialog's only buttons named by an interface title alone.
const offeredInterfaces = () =>
  getInterfaceTypes()
    .map(({ title }) => title)
    .filter((title) => screen.queryByRole('button', { name: title }) !== null);

describe('New Stage screen capability filters', () => {
  // A stage with no capability disappears as soon as any filter is pressed,
  // which is how the Language Chooser went missing from every filter.
  it('gives every interface at least one capability', () => {
    for (const { type, tags } of getInterfaceTypes()) {
      expect({ type, tags: tags.length > 0 }).toEqual({ type, tags: true });
    }
  });

  it('finds Information and the Language Chooser under Utilities', () => {
    renderScreen();

    fireEvent.click(capabilityFilter('Utilities'));

    expect(capabilityFilter('Utilities')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(offeredInterfaces()).toEqual(['Information', 'Language Chooser']);
  });

  it('lists Anonymisation under Utilities when its experiment is on', () => {
    renderScreen({ encryptedVariables: true });

    fireEvent.click(capabilityFilter('Utilities'));

    expect(offeredInterfaces()).toEqual([
      'Information',
      'Language Chooser',
      'Anonymisation Interface',
    ]);
  });

  it('no longer lists Anonymisation as capturing node attributes', () => {
    renderScreen({ encryptedVariables: true });

    fireEvent.click(capabilityFilter('Capture Node Attributes'));

    expect(offeredInterfaces()).not.toContain('Anonymisation Interface');
    expect(offeredInterfaces()).toContain('Per Alter Form');
  });
});
