import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buttonVariants } from '@codaco/fresco-ui/Button';

import PedigreeNodeConfigurationSection from '../../editors/family-pedigree/sections/PedigreeNodeConfigurationSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

const classesOf = (className: string) =>
  new Set(className.split(/\s+/).filter(Boolean));

/**
 * What the design system's default-sized button wears that a small one does
 * not, and the other way round.
 *
 * Taken from the system rather than written out here: the two sizes differ by
 * a height and a text scale today, and a test naming those would pass a button
 * that had drifted onto a third size the day the scale changed.
 */
const DEFAULT_SIZE = classesOf(buttonVariants({ color: 'primary' }));
const SMALL_SIZE = classesOf(buttonVariants({ color: 'primary', size: 'sm' }));
const ONLY_DEFAULT = [...DEFAULT_SIZE].filter(
  (className) => !SMALL_SIZE.has(className),
);
const ONLY_SMALL = [...SMALL_SIZE].filter(
  (className) => !DEFAULT_SIZE.has(className),
);

/**
 * The controls for making and changing a codebook type are ordinary buttons on
 * the page, not a compact accessory to something else, so they are the size
 * every other button on the screen is. They shipped a size down, which read as
 * a different class of control from the buttons beside them.
 */
describe('the size of the type picker’s create and edit buttons', () => {
  it('tells the two sizes apart at all', () => {
    // Without this the assertions below would hold for a button of any size.
    expect(ONLY_DEFAULT.length).toBeGreaterThan(0);
    expect(ONLY_SMALL.length).toBeGreaterThan(0);
  });

  it.each(['Create new node type', 'Edit this node type'])(
    '“%s” is the system’s default button size',
    async (name) => {
      const harness = renderStageEditor({
        stageId: 'family-pedigree-1',
        sections: <PedigreeNodeConfigurationSection />,
      });
      await harness.opened();

      const trigger = await screen.findByRole('button', { name });

      expect(trigger).toHaveClass(...ONLY_DEFAULT);
      for (const className of ONLY_SMALL) {
        expect(trigger).not.toHaveClass(className);
      }
    },
  );
});
