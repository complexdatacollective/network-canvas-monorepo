import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { hostBarsStyle } from '@codaco/protocol-builder/fields/assetBlocks/settingsPlacement';
import { ACTION_TOOLBAR_REACH_VARIABLE } from '~/utils/actionToolbarReach';
import { NAV_BAR_REACH_VARIABLE } from '~/utils/navHeight';

import StageEditorScroller from '../StageEditorScroller';

describe('what the stage editor’s page scrolls in', () => {
  it('tells the editor how much of the page the navigation bar and the action toolbar cover', () => {
    const { container } = render(
      <StageEditorScroller>
        <p>The editor</p>
      </StageEditorScroller>,
    );
    const scroller = container.firstElementChild;
    if (!(scroller instanceof HTMLElement)) throw new Error('No scroller');
    const expected = Object.entries(
      hostBarsStyle({
        top: `var(${NAV_BAR_REACH_VARIABLE})`,
        bottom: `var(${ACTION_TOOLBAR_REACH_VARIABLE})`,
      }),
    );
    expect(expected).toHaveLength(2);
    for (const [property, value] of expected) {
      expect(scroller.style.getPropertyValue(property)).toBe(value);
    }
  });
});
