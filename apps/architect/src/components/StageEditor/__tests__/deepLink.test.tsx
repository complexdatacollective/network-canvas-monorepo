import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SyntheticData from '~/components/sections/SyntheticData/SyntheticData';

import {
  STAGE_SECTION_SYNTHETIC,
  stageSectionHref,
  useStageSectionDeepLink,
} from '../deepLink';
import { asStage, renderStageForm } from './stageFormTestHarness';

/**
 * Opening a stage editor at one of its sections.
 *
 * The href and the section's marker are built from the same module, so what is
 * under test is that a real link lands a researcher IN the section — with
 * focus, not merely scroll, because a keyboard or screen-reader user who is
 * only scrolled to a section is still wherever they were.
 *
 * `scrollIntoView` is not implemented in jsdom, so it is stubbed; every
 * assertion below is about focus, which jsdom does implement.
 */

const SOCIOGRAM = {
  id: 'stage-1',
  type: 'Sociogram',
  label: 'Position people',
  subject: { entity: 'node', type: 'person' },
  background: { concentricCircles: 4, skewedTowardCenter: true },
  prompts: [
    {
      id: 'prompt-1',
      text: 'Link them',
      layout: { layoutVariable: 'layout' },
      edges: { create: 'friend' },
    },
  ],
};

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: { layout: { name: 'Layout', type: 'layout' } },
    },
  },
  edge: { friend: { name: 'Friend', color: 'edge-color-seq-1' } },
  ego: { variables: {} },
};

/** Stands for the stage editor, which runs the hook above its sections. */
const DeepLinkRunner = () => {
  useStageSectionDeepLink();
  return null;
};

const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

const renderEditor = (path: string) => {
  window.history.replaceState(null, '', path);
  const committedStage = asStage(SOCIOGRAM);

  return renderStageForm({
    committedStage,
    extraReducers: {
      activeProtocol: () => ({
        present: {
          name: 'Test protocol',
          schemaVersion: 8,
          codebook: CODEBOOK,
          assetManifest: {},
          stages: [committedStage],
        },
      }),
    },
    children: (
      <>
        <DeepLinkRunner />
        <SyntheticData
          stagePath="stages[0]"
          stagePosition={0}
          interfaceType="Sociogram"
        />
      </>
    ),
  });
};

const section = () =>
  document.querySelector<HTMLElement>('[data-stage-section="synthetic"]');

afterEach(() => {
  scrollIntoView.mockClear();
  window.history.replaceState(null, '', '/');
});

describe('opening a stage editor at its synthetic section', () => {
  it('scrolls to the section the link names and lands focus in it', async () => {
    renderEditor(stageSectionHref('stage-1', STAGE_SECTION_SYNTHETIC));

    const target = section();
    expect(target).not.toBeNull();

    await waitFor(() => {
      expect(target?.contains(document.activeElement)).toBe(true);
    });
    // The section's own control — its disclosure — so the next keystroke opens
    // the parameters the link was about.
    expect(document.activeElement).toBe(
      screen
        .getAllByRole('button')
        .find((button) => button.hasAttribute('aria-expanded')),
    );
    expect(scrollIntoView.mock.instances).toContain(target);
  });

  it('leaves a plain stage link alone', () => {
    renderEditor('/protocol/stage/stage-1');

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
    expect(section()).not.toBeNull();
  });

  it('does nothing for a section this stage does not render', () => {
    // Never a jump somewhere the link did not ask for.
    window.history.replaceState(
      null,
      '',
      '/protocol/stage/stage-1?section=no-such-section',
    );
    renderEditor('/protocol/stage/stage-1?section=no-such-section');

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });
});
