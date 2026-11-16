import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';

import DropOverlay from './DropOverlay';

describe('the roster drop overlay', () => {
  it('says what dropping does, and offers no control with no name', () => {
    render(
      <DndStoreProvider>
        <DropOverlay
          dropTargetId="roster"
          nodeColor="node-color-seq-1"
          message="Drop here to add this person"
        />
      </DndStoreProvider>,
    );

    expect(
      screen.getByText('Drop here to add this person'),
    ).toBeInTheDocument();
    // The person drawn above the message is a picture, not a button.
    expect(screen.queryByRole('button')).toBeNull();
  });
});
