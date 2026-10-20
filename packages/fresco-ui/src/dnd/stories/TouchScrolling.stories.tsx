import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ReactNode, useMemo, useState } from 'react';

import { Collection } from '../../collection/components/Collection';
import { useDragAndDrop } from '../../collection/dnd/useDragAndDrop';
import { InlineGridLayout } from '../../collection/layout/InlineGridLayout';
import type { ItemProps } from '../../collection/types';
import Node from '../../Node';
import { ScrollArea } from '../../ScrollArea';
import { withDndStoreProvider } from '../../storybook-support/withDndStoreProvider';
import Heading from '../../typography/Heading';
import { type DragMetadata, useDragSource, useDropTarget } from '../dnd';
import { SCROLL_AXIS_DRAG_HOLD } from '../useScrollAwareDrag';

type Person = { id: string; name: string };

const NAMES = [
  'Ada',
  'Bo',
  'Cyrus',
  'Dee',
  'Eli',
  'Fay',
  'Gus',
  'Hana',
  'Ines',
  'Jo',
  'Kai',
  'Lou',
  'Mae',
  'Ned',
  'Oona',
  'Pia',
  'Quin',
  'Rui',
  'Sol',
  'Tam',
  'Uma',
  'Vic',
  'Wren',
  'Xia',
  'Yusuf',
  'Zoe',
];

const makePeople = (count: number, prefix: string): Person[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: NAMES[index % NAMES.length] ?? `Person ${index + 1}`,
  }));

const PERSON = 'person';

function Instructions({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-surface-1 text-surface-1-contrast publish-colors shrink-0 rounded p-4 text-sm">
      <Heading level="h4" margin="none">
        {title}
      </Heading>
      <ul className="mt-2 list-disc pl-6">{children}</ul>
    </div>
  );
}

/** A bin node, wired the way the Sociogram's drawer wires its nodes. */
function BinNode({ person }: { person: Person }) {
  const { dragProps } = useDragSource({
    type: PERSON,
    metadata: { id: person.id },
    announcedName: person.name,
  });
  return <Node label={person.name} size="sm" {...dragProps} />;
}

function Canvas({
  placed,
  onDrop,
}: {
  placed: Person[];
  onDrop: (metadata?: DragMetadata) => void;
}) {
  const { dropProps, isOver, willAccept } = useDropTarget({
    id: 'touch-scrolling-canvas',
    accepts: [PERSON],
    announcedName: 'Canvas',
    onDrop,
  });

  return (
    <div
      {...dropProps}
      className={`publish-colors flex min-h-0 flex-1 flex-wrap content-start gap-4 rounded p-6 transition-colors ${
        willAccept
          ? isOver
            ? 'bg-success text-success-contrast'
            : 'bg-surface-2 text-surface-2-contrast'
          : 'bg-surface-1 text-surface-1-contrast'
      }`}
    >
      {placed.length === 0 ? (
        <p className="m-auto opacity-70">Drop people here</p>
      ) : (
        placed.map((person) => (
          <Node key={person.id} label={person.name} size="xs" presentational />
        ))
      )}
    </div>
  );
}

function SociogramBinExample({ count }: { count: number }) {
  const [bin, setBin] = useState(() => makePeople(count, 'bin'));
  const [placed, setPlaced] = useState<Person[]>([]);

  const handleDrop = (metadata?: DragMetadata) => {
    const person = bin.find((candidate) => candidate.id === metadata?.id);
    if (!person) return;
    setBin((current) => current.filter((p) => p.id !== person.id));
    setPlaced((current) => [...current, person]);
  };

  return (
    <div className="flex h-dvh flex-col gap-4 p-4">
      <Instructions title="Sociogram: a bin under the canvas">
        <li>Drag a person straight up: it should pick up immediately.</li>
        <li>
          Drag a person diagonally up and to the left or right, towards a corner
          of the canvas: it should pick up, not scroll the bin. (On an iPad
          especially, please report if the bin scrolls or the person snaps
          back.)
        </li>
        <li>
          When the bin is wider than the screen, swipe sideways across the
          people (within about 30° of level): the bin should scroll and nobody
          should be picked up.
        </li>
        <li>
          Hold a person still for {SCROLL_AXIS_DRAG_HOLD}ms (it brightens), then
          drag sideways: it should pick up instead of scrolling.
        </li>
        <li>
          When everyone fits in the bin, a drag in any direction picks up
          immediately.
        </li>
      </Instructions>
      <Canvas placed={placed} onDrop={handleDrop} />
      <div className="bg-surface-1 publish-colors shrink-0 rounded">
        <ScrollArea
          orientation="horizontal"
          viewportClassName="flex items-center gap-4 p-4"
        >
          {bin.map((person) => (
            <BinNode key={person.id} person={person} />
          ))}
        </ScrollArea>
      </div>
    </div>
  );
}

const renderPerson = (person: Person, itemProps: ItemProps) => (
  <Node
    {...itemProps}
    label={person.name}
    size="sm"
    selected={itemProps['data-selected'] === true}
  />
);

function PersonPanel({
  title,
  people,
  onReceive,
}: {
  title: string;
  people: Person[];
  onReceive: (ids: string[]) => void;
}) {
  const { dragAndDropHooks } = useDragAndDrop<Person>({
    announcedName: title,
    getItems: (keys) => [{ type: PERSON, keys }],
    acceptTypes: [PERSON],
    // A drag of a selected person carries everyone selected with them.
    onDrop: ({ metadata }) => {
      if (metadata.keys instanceof Set) {
        onReceive([...metadata.keys].map(String));
      }
    },
  });

  const layout = useMemo(() => new InlineGridLayout<Person>(), []);

  return (
    <div className="bg-surface-1 text-surface-1-contrast publish-colors flex min-h-0 flex-1 flex-col gap-2 rounded p-4">
      <Heading level="h4" margin="none">
        {title}
      </Heading>
      <Collection<Person>
        items={people}
        dragAndDropHooks={dragAndDropHooks}
        renderItem={renderPerson}
        keyExtractor={(person) => person.id}
        textValueExtractor={(person) => person.name}
        layout={layout}
        aria-label={title}
        selectionMode="multiple"
        className="min-h-0 flex-1"
      >
        {(elements) => elements}
      </Collection>
    </div>
  );
}

function PanelsExample({ stacked }: { stacked: boolean }) {
  const [panels, setPanels] = useState(() => ({
    available: makePeople(40, 'panel'),
    added: [] as Person[],
  }));

  const moveTo = (target: 'available' | 'added') => (ids: string[]) => {
    setPanels((current) => {
      const source = target === 'added' ? 'available' : 'added';
      const moving = current[source].filter((p) => ids.includes(p.id));
      if (moving.length === 0) return current;
      return {
        ...current,
        [source]: current[source].filter((p) => !ids.includes(p.id)),
        [target]: [...current[target], ...moving],
      } as typeof current;
    });
  };

  return (
    <div className="flex h-dvh flex-col gap-4 p-4">
      <Instructions
        title={
          stacked
            ? 'Name generator on a small screen: stacked panels'
            : 'Roster or name generator: side-by-side panels'
        }
      >
        <li>Swipe up and down across the people: the panel should scroll.</li>
        {stacked ? (
          <li>
            Hold a person still for {SCROLL_AXIS_DRAG_HOLD}ms (it brightens),
            then drag it down into the lower panel.
          </li>
        ) : (
          <li>
            Drag a person sideways into the other panel: it should pick up
            immediately.
          </li>
        )}
        <li>
          Tap a person: it should toggle selection, not pick up. Dragging a
          selected person takes everyone selected with them.
        </li>
      </Instructions>
      <div
        className={`flex min-h-0 flex-1 gap-4 ${stacked ? 'flex-col' : 'flex-row'}`}
      >
        <PersonPanel
          title="Available to add"
          people={panels.available}
          onReceive={moveTo('available')}
        />
        <PersonPanel
          title="Added"
          people={panels.added}
          onReceive={moveTo('added')}
        />
      </div>
    </div>
  );
}

const meta: Meta = {
  title: 'Systems/DragAndDrop/TouchScrolling',
  decorators: [withDndStoreProvider],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
On a touch screen, a drag source inside a \`ScrollArea\` shares the gesture
with it. Movement along an axis the region can currently scroll scrolls it;
movement more than 30° off that axis drags. Nested regions combine, and a
region with nothing to scroll leaves every direction to the drag. Outside any
\`ScrollArea\` the page is assumed to scroll vertically. Holding still for ${SCROLL_AXIS_DRAG_HOLD}ms first
lets a drag travel along the scroll axis too.

These scenarios are for trying on a tablet or phone. With a mouse, every
direction drags immediately.
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

export const SociogramBin: Story = {
  name: 'Sociogram bin (overflowing)',
  render: () => <SociogramBinExample count={24} />,
};

export const SociogramBinThatFits: Story = {
  name: 'Sociogram bin (fits)',
  render: () => <SociogramBinExample count={3} />,
};

export const SidePanels: Story = {
  name: 'Side-by-side panels',
  render: () => <PanelsExample stacked={false} />,
};

export const StackedPanels: Story = {
  name: 'Stacked panels',
  render: () => <PanelsExample stacked />,
};
