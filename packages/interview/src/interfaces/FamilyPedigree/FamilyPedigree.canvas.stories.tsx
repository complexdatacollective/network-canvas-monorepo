import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';
import { buildInterview, type Family } from './FamilyPedigree.stories';

/**
 * The family tree's canvas: what stays in view, and where, as the family is
 * built, panned and zoomed; and where keyboard focus goes. The stage is
 * rendered at the story viewport's size, or in a frame of the given size.
 */
function CanvasStory({
  family,
  frame,
  nominationPrompts,
  framing,
}: {
  family: Family;
  /** Who chooses the words unnamed relatives are described by. */
  framing?: 'participantPreference';
  /** A screen of this size in place of the whole story viewport. */
  frame?: { width: number; height: number };
  /** Prompts after the family's own, asking who in it something applies
   * to. */
  nominationPrompts?: { text: string }[];
}) {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildInterview({ family, nominationPrompts, framing }),
      ),
    [family, nominationPrompts, framing],
  );
  return (
    <div
      className={frame ? 'flex' : 'flex h-dvh w-full'}
      style={frame ? { width: frame.width, height: frame.height } : undefined}
    >
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

const meta: Meta = {
  title: 'Interfaces/FamilyPedigree/Canvas',
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj;

type Box = { left: number; top: number; right: number; bottom: number };

const boxOf = (element: Element): Box => {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
};

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const inside = (inner: Box, outer: Box) =>
  inner.left >= outer.left - 0.5 &&
  inner.right <= outer.right + 0.5 &&
  inner.top >= outer.top - 0.5 &&
  inner.bottom <= outer.bottom + 0.5;

const isDisabled = (button: HTMLElement) =>
  button.getAttribute('aria-disabled') === 'true' ||
  (button as HTMLButtonElement).disabled;

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

/** Waits for the canvas to stop moving: the same transform for five frames. */
async function settled(canvasElement: HTMLElement) {
  const content = within(canvasElement).getByTestId('pedigree-canvas')
    .lastElementChild as HTMLElement;
  let last = '';
  let steady = 0;
  for (let frame = 0; frame < 300 && steady < 5; frame++) {
    await nextFrame();
    const now = getComputedStyle(content).transform;
    steady = now === last ? steady + 1 : 0;
    last = now;
  }
}

const personSymbol = (canvasElement: HTMLElement, personId: string) => {
  const person = canvasElement.querySelector(
    `[data-testid="pedigree-person"][data-person-id="${personId}"]`,
  );
  const symbol = person?.querySelector('button');
  if (!symbol) throw new Error(`No symbol for ${personId}`);
  return symbol;
};

const toolbarBox = (canvasElement: HTMLElement) =>
  boxOf(
    within(canvasElement).getByRole('toolbar', { name: 'Family tree tools' }),
  );

const canvasBox = (canvasElement: HTMLElement) =>
  boxOf(within(canvasElement).getByTestId('pedigree-canvas'));

/** Moves keyboard focus back from the toolbar to the family's tab stop. */
async function tabIntoFamily(canvasElement: HTMLElement) {
  await userEvent.click(
    within(canvasElement).getByRole('button', {
      name: 'Show the whole family',
    }),
  );
  for (let press = 0; press < 6; press++) {
    await userEvent.tab({ shift: true });
    const focused = canvasElement.ownerDocument.activeElement;
    if (focused?.closest('[data-testid="pedigree-person"]')) return;
  }
  throw new Error('Focus did not reach the family');
}

const menuButtons = (canvasElement: HTMLElement) =>
  ['parent', 'sibling', 'partner', 'child'].map((relation) =>
    within(canvasElement).getByTestId(`pedigree-menu-${relation}`),
  );

/** A straight line of mothers: the participant, their mother, her mother
 * and hers, each with a partner. */
const fourGenerations: Family = {
  people: [
    { id: 'ego', name: 'Ana', gender: 'woman', sex: 'female', ego: true },
    { id: 'mum', name: 'Rosa', gender: 'woman', sex: 'female' },
    { id: 'dad', name: 'Luis', gender: 'man', sex: 'male' },
    { id: 'gran', name: 'Elena', gender: 'woman', sex: 'female' },
    { id: 'grandad', name: 'Jorge', gender: 'man', sex: 'male' },
    { id: 'greatGran', name: 'Carmen', gender: 'woman', sex: 'female' },
    { id: 'greatGrandad', name: 'Pablo', gender: 'man', sex: 'male' },
  ],
  links: [
    { from: 'mum', to: 'dad', kind: 'partner' },
    { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
    { from: 'dad', to: 'ego', kind: 'biological' },
    { from: 'gran', to: 'grandad', kind: 'partner' },
    { from: 'gran', to: 'mum', kind: 'biological', carrier: true },
    { from: 'grandad', to: 'mum', kind: 'biological' },
    { from: 'greatGran', to: 'greatGrandad', kind: 'partner' },
    { from: 'greatGran', to: 'gran', kind: 'biological', carrier: true },
    { from: 'greatGrandad', to: 'gran', kind: 'biological' },
  ],
};

/**
 * Showing the whole family leaves room for the add menu: the top row's
 * Parent buttons clear of the prompt, and the bottom row's Child buttons
 * clear of the toolbar, where they can be clicked.
 */
export const TheWholeFamilyLeavesRoomForTheAddMenu: Story = {
  render: () => <CanvasStory family={fourGenerations} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /^You/ });
    await userEvent.click(
      canvas.getByRole('button', { name: 'Show the whole family' }),
    );
    await settled(canvasElement);

    await userEvent.hover(personSymbol(canvasElement, 'ego'));
    const child = await canvas.findByTestId('pedigree-menu-child');
    await expect(
      overlaps(boxOf(child), toolbarBox(canvasElement)),
      'Child clear of the toolbar',
    ).toBe(false);
    await expect(
      inside(boxOf(child), canvasBox(canvasElement)),
      'Child on the canvas',
    ).toBe(true);

    const heading = canvas.getByRole('heading', { name: /^Add the members/ });
    for (const topRow of ['greatGran', 'greatGrandad']) {
      await userEvent.hover(personSymbol(canvasElement, topRow));
      await waitFor(() =>
        expect(
          personSymbol(canvasElement, topRow).parentElement?.querySelector(
            '[data-testid="pedigree-menu-parent"]',
          ),
        ).not.toBeNull(),
      );
      const parent = canvas.getByTestId('pedigree-menu-parent');
      await expect(
        overlaps(boxOf(parent), boxOf(heading)),
        `${topRow}'s Parent clear of the prompt`,
      ).toBe(false);
    }
  },
};

/** Adds a parent to someone through their add menu, as a woman. */
async function addMother(canvasElement: HTMLElement, childId: string) {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.hover(personSymbol(canvasElement, childId));
  await userEvent.click(await canvas.findByTestId('pedigree-menu-parent'));
  await userEvent.click(await body.findByRole('radio', { name: 'Woman' }));
  await userEvent.click(await body.findByRole('radio', { name: 'Female' }));
  await userEvent.click(await body.findByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(
      canvasElement.ownerDocument.querySelector(
        '[data-testid="pedigree-person-panel"]',
      ),
    ).toBeNull(),
  );
  // Away from everyone, so no menu is left open.
  await userEvent.unhover(personSymbol(canvasElement, childId));
  await settled(canvasElement);
}

/**
 * Building the family upwards, one parent at a time, moves the view to show
 * each new person without pushing anyone who was in view under the toolbar
 * or the prompt.
 */
export const AddingAncestorsKeepsEveryoneClear: Story = {
  render: () => (
    <CanvasStory
      family={{
        people: [
          { id: 'ego', name: 'Ana', gender: 'woman', sex: 'female', ego: true },
        ],
        links: [],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /^You/ });
    let childId = 'ego';
    for (let generation = 0; generation < 4; generation++) {
      const before = new Set(
        canvas
          .getAllByTestId('pedigree-person')
          .map((person) => person.dataset.personId),
      );
      await addMother(canvasElement, childId);
      const added = canvas
        .getAllByTestId('pedigree-person')
        .map((person) => person.dataset.personId ?? '')
        .find((id) => !before.has(id));
      if (!added) throw new Error('No one was added');
      const toolbar = toolbarBox(canvasElement);
      const heading = boxOf(
        canvas.getByRole('heading', { name: /^Add the members/ }),
      );
      for (const person of canvas.getAllByTestId('pedigree-person')) {
        const symbol = boxOf(person.querySelector('button') as Element);
        await expect(
          overlaps(symbol, toolbar),
          `${person.dataset.personId} clear of the toolbar`,
        ).toBe(false);
        await expect(
          overlaps(symbol, heading),
          `${person.dataset.personId} clear of the prompt`,
        ).toBe(false);
        await expect(
          inside(symbol, canvasBox(canvasElement)),
          `${person.dataset.personId} on the canvas`,
        ).toBe(true);
      }
      childId = added;
    }
  },
};

/** Drags the canvas by (dx, dy) with the mouse, in ten steps. */
function dragCanvas(viewport: HTMLElement, dx: number, dy: number) {
  const box = viewport.getBoundingClientRect();
  const start = {
    x: box.left + box.width * 0.2,
    y: box.top + box.height * 0.3,
  };
  const at = (step: number) => ({
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: start.x + (dx * step) / 10,
    clientY: start.y + (dy * step) / 10,
  });
  fireEvent.pointerDown(viewport, { ...at(0), buttons: 1 });
  for (let step = 1; step <= 10; step++) {
    fireEvent.pointerMove(viewport, { ...at(step), buttons: 1 });
  }
  fireEvent.pointerUp(viewport, at(10));
}

/** How much of anyone's symbol is inside the box, at most, in pixels of
 * width and height. */
function mostVisible(canvasElement: HTMLElement, area: Box) {
  let best = { width: 0, height: 0 };
  for (const person of within(canvasElement).getAllByTestId(
    'pedigree-person',
  )) {
    const symbol = boxOf(person.querySelector('button') as Element);
    const width =
      Math.min(symbol.right, area.right) - Math.max(symbol.left, area.left);
    const height =
      Math.min(symbol.bottom, area.bottom) - Math.max(symbol.top, area.top);
    if (width > 0 && height > 0 && width * height > best.width * best.height) {
      best = { width, height };
    }
  }
  return best;
}

const threePeople: Family = {
  people: [
    { id: 'ego', name: 'Ana', gender: 'woman', sex: 'female', ego: true },
    { id: 'mum', name: 'Rosa', gender: 'woman', sex: 'female' },
    { id: 'dad', name: 'Luis', gender: 'man', sex: 'male' },
  ],
  links: [
    { from: 'mum', to: 'dad', kind: 'partner' },
    { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
    { from: 'dad', to: 'ego', kind: 'biological' },
  ],
};

/**
 * However far the canvas is dragged, at any zoom, some of the family stays
 * on screen, clear of the prompt and the toolbar.
 */
export const TheFamilyCannotBeDraggedOutOfSight: Story = {
  render: () => <CanvasStory family={threePeople} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const viewport = canvas.getByTestId('pedigree-canvas');
    await canvas.findByRole('button', { name: /^You/ });
    const clearArea = () => {
      const box = canvasBox(canvasElement);
      return {
        ...box,
        top: boxOf(canvas.getByRole('heading', { name: /^Add the members/ }))
          .bottom,
        bottom: toolbarBox(canvasElement).top,
      };
    };
    const dragFar = async (dx: number, dy: number) => {
      for (let time = 0; time < 4; time++) dragCanvas(viewport, dx, dy);
      await settled(canvasElement);
    };
    const expectSomeoneInView = () => {
      const seen = mostVisible(canvasElement, clearArea());
      expect(seen.width, 'someone in view, across').toBeGreaterThan(20);
      expect(seen.height, 'someone in view, down').toBeGreaterThan(20);
    };

    await dragFar(2000, 1500);
    expectSomeoneInView();
    await dragFar(-4000, -3000);
    expectSomeoneInView();

    const zoomIn = canvas.getByRole('button', { name: 'Zoom in' });
    while (!isDisabled(zoomIn)) {
      await userEvent.click(zoomIn);
      await settled(canvasElement);
    }
    await dragFar(3000, 2000);
    expectSomeoneInView();
    await dragFar(-6000, -4000);
    expectSomeoneInView();
  },
};

/** A sibling drawn at the right-hand end of the family. */
const withBrother: Family = {
  ...threePeople,
  people: [
    ...threePeople.people,
    { id: 'brother', name: 'Tomasz', gender: 'man', sex: 'male' },
  ],
  links: [
    ...threePeople.links,
    { from: 'mum', to: 'brother', kind: 'biological', carrier: true },
    { from: 'dad', to: 'brother', kind: 'biological' },
  ],
};

/**
 * On a phone, the add menu opened from the keyboard around someone at the
 * edge of the screen is moved fully into view.
 */
export const TheAddMenuOpensInView: Story = {
  render: () => (
    <CanvasStory family={withBrother} frame={{ width: 390, height: 844 }} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /^You/ });
    await tabIntoFamily(canvasElement);
    await settled(canvasElement);
    // Every person in turn. Focus moved from someone focused by the
    // keyboard shows as keyboard focus too.
    for (const id of ['ego', 'brother', 'mum', 'dad']) {
      personSymbol(canvasElement, id).focus();
      await settled(canvasElement);
      const area = canvasBox(canvasElement);
      const toolbar = toolbarBox(canvasElement);
      for (const button of menuButtons(canvasElement)) {
        await expect(
          inside(boxOf(button), area),
          `${id}: ${button.textContent} on the canvas`,
        ).toBe(true);
        await expect(
          overlaps(boxOf(button), toolbar),
          `${id}: ${button.textContent} clear of the toolbar`,
        ).toBe(false);
      }
    }
  },
};

/**
 * Zoomed all the way out, the add menu's buttons keep a target of at least
 * 24 pixels.
 */
export const AddButtonsKeepTheirSizeWhenZoomedOut: Story = {
  render: () => <CanvasStory family={fourGenerations} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /^You/ });
    const zoomOut = canvas.getByRole('button', { name: 'Zoom out' });
    while (!isDisabled(zoomOut)) {
      await userEvent.click(zoomOut);
      await settled(canvasElement);
    }
    await userEvent.hover(personSymbol(canvasElement, 'ego'));
    await canvas.findByTestId('pedigree-menu-child');
    for (const button of menuButtons(canvasElement)) {
      const { width, height } = button.getBoundingClientRect();
      await expect(
        width,
        `${button.textContent} wide enough`,
      ).toBeGreaterThanOrEqual(24);
      await expect(
        height,
        `${button.textContent} tall enough`,
      ).toBeGreaterThanOrEqual(24);
    }
  },
};

/**
 * Zooming in from the keyboard with someone focused keeps them, and their add
 * menu, on screen.
 */
export const ZoomingKeepsTheFocusedPersonInView: Story = {
  render: () => <CanvasStory family={fourGenerations} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /^You/ });
    // Into the family from the toolbar, then up to the top row.
    await tabIntoFamily(canvasElement);
    await settled(canvasElement);
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard('{ArrowUp}');
    const top = canvasElement.ownerDocument.activeElement as HTMLElement;
    await expect(
      ['greatGran', 'greatGrandad'].includes(
        top.closest<HTMLElement>('[data-testid="pedigree-person"]')?.dataset
          .personId ?? '',
      ),
    ).toBe(true);
    const zoomIn = canvas.getByRole('button', { name: 'Zoom in' });
    while (!isDisabled(zoomIn)) {
      await userEvent.keyboard('+');
      await settled(canvasElement);
      await expect(
        canvasElement.ownerDocument.activeElement,
        'focus kept',
      ).toBe(top);
      const area = canvasBox(canvasElement);
      await expect(
        inside(boxOf(top), area),
        'focused person on the canvas',
      ).toBe(true);
      for (const button of menuButtons(canvasElement)) {
        await expect(
          inside(boxOf(button), area),
          `${button.textContent} on the canvas`,
        ).toBe(true);
      }
    }
  },
};

/** What the stage's live region holds, for screen readers to announce. */
const liveRegionText = (canvasElement: HTMLElement) => {
  const stage = within(canvasElement)
    .getByTestId('pedigree-canvas')
    .closest('.relative.flex.h-full');
  const region = stage?.querySelector(':scope > [aria-live="polite"]');
  if (!region) throw new Error('No live region');
  // Without the soft hyphens long words are drawn with.
  return (region.textContent ?? '').replaceAll('\u00ad', '');
};

const HEART_PROMPT = 'Who in your family has had heart disease?';

/** The participant, their mother Linda and their partner Kim. */
const lindaAndKim: Family = {
  people: [
    { id: 'ego', name: 'Ana', gender: 'woman', sex: 'female', ego: true },
    { id: 'linda', name: 'Linda', gender: 'woman', sex: 'female' },
    { id: 'kim', name: 'Kim', gender: 'man', sex: 'male' },
  ],
  links: [
    { from: 'linda', to: 'ego', kind: 'biological', carrier: true },
    { from: 'ego', to: 'kim', kind: 'partner' },
  ],
};

/**
 * What the connect and disconnect tools last said is taken back as soon as
 * connecting or disconnecting ends, however it ends, so a screen reader
 * browsing the page never comes across an instruction that no longer
 * applies, here or on a later prompt.
 */
export const ConnectTextEndsWithConnecting: Story = {
  render: () => (
    <CanvasStory
      family={lindaAndKim}
      nominationPrompts={[{ text: HEART_PROMPT }]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole('button', { name: /^You/ });
    const pointer = canvas.getByTestId('pedigree-tool-pointer');
    const connect = canvas.getByTestId('pedigree-tool-connect');

    // A: a first person picked, then back to adding and editing.
    await userEvent.click(connect);
    await userEvent.click(personSymbol(canvasElement, 'linda'));
    await waitFor(() =>
      expect(liveRegionText(canvasElement)).toContain('Linda'),
    );
    await userEvent.click(pointer);
    await waitFor(() => expect(liveRegionText(canvasElement)).toBe(''));

    // B: someone already connected to the first person cannot be picked.
    await userEvent.click(connect);
    await userEvent.click(personSymbol(canvasElement, 'linda'));
    await waitFor(() =>
      expect(liveRegionText(canvasElement)).toContain('Linda'),
    );
    await expect(personSymbol(canvasElement, 'ego')).toBeDisabled();
    await userEvent.click(pointer);
    await waitFor(() => expect(liveRegionText(canvasElement)).toBe(''));

    // C: the relationship menu cancelled.
    await userEvent.click(connect);
    await userEvent.click(personSymbol(canvasElement, 'linda'));
    await userEvent.click(personSymbol(canvasElement, 'kim'));
    await userEvent.click(
      await page.findByRole('menuitem', { name: 'Cancel' }),
    );
    await waitFor(() => expect(liveRegionText(canvasElement)).toBe(''));

    // Escape lets go of the first person picked.
    await userEvent.click(personSymbol(canvasElement, 'linda'));
    await waitFor(() =>
      expect(liveRegionText(canvasElement)).toContain('Linda'),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(liveRegionText(canvasElement)).toBe(''));

    // Moving on to the next prompt mid-way.
    await userEvent.click(personSymbol(canvasElement, 'linda'));
    await waitFor(() =>
      expect(liveRegionText(canvasElement)).toContain('Linda'),
    );
    await userEvent.click(canvas.getByTestId('next-button'));
    await canvas.findByText(HEART_PROMPT);
    await waitFor(() => expect(liveRegionText(canvasElement)).toBe(''));
  },
};

/**
 * A connection that changes how someone unnamed is related to the
 * participant is announced in their new words, as the canvas shows them.
 */
export const AConnectionIsAnnouncedInItsNewWords: Story = {
  render: () => (
    <CanvasStory
      family={{
        people: [
          { id: 'ego', name: 'Ana', gender: 'woman', sex: 'female', ego: true },
          { id: 'ravi', name: 'Ravi', gender: 'man', sex: 'male' },
          { id: 'grandad', gender: 'man', sex: 'male' },
          { id: 'partner', gender: 'woman', sex: 'female' },
        ],
        links: [
          { from: 'ravi', to: 'ego', kind: 'biological' },
          { from: 'grandad', to: 'ravi', kind: 'biological' },
          { from: 'grandad', to: 'partner', kind: 'partner' },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole('button', { name: /^Step-grandmother/ });
    await userEvent.click(canvas.getByTestId('pedigree-tool-connect'));
    await userEvent.click(personSymbol(canvasElement, 'partner'));
    await userEvent.click(personSymbol(canvasElement, 'ravi'));
    await userEvent.click(
      await page.findByTestId('pedigree-connect-parent-partner'),
    );
    await userEvent.click(
      await page.findByTestId('pedigree-connect-kind-biological-carrier'),
    );
    await canvas.findByRole('button', { name: /^Paternal grandmother/ });
    await waitFor(() =>
      expect(liveRegionText(canvasElement)).toContain('Paternal grandmother'),
    );
    await expect(liveRegionText(canvasElement)).not.toContain('partner');
  },
};

/**
 * Once the second person is picked, the hint stops asking for one: the menu,
 * or the confirmation, asks its own question.
 */
export const TheHintStopsAskingOnceAPairIsPicked: Story = {
  render: () => (
    <CanvasStory
      family={{
        people: [
          { id: 'ego', name: 'Ana', gender: 'woman', sex: 'female', ego: true },
          { id: 'lisa', name: 'Lisa', gender: 'woman', sex: 'female' },
          { id: 'mark', name: 'Mark', gender: 'man', sex: 'male' },
          { id: 'tomasz', name: 'Tomasz', gender: 'man', sex: 'male' },
        ],
        // Lisa and Mark are not partners; Lisa is also Tomasz's mother, so
        // her connection to the participant can be removed.
        links: [
          { from: 'lisa', to: 'ego', kind: 'biological', carrier: true },
          { from: 'mark', to: 'ego', kind: 'biological' },
          { from: 'lisa', to: 'tomasz', kind: 'biological', carrier: true },
          { from: 'mark', to: 'tomasz', kind: 'biological' },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole('button', { name: /^You/ });
    const hint = () => canvas.queryByTestId('pedigree-connect-hint');

    await userEvent.click(canvas.getByTestId('pedigree-tool-connect'));
    await userEvent.click(personSymbol(canvasElement, 'lisa'));
    await expect(hint()).toHaveTextContent(
      'Select a person, then select another',
    );
    await userEvent.click(personSymbol(canvasElement, 'mark'));
    await page.findByRole('menu');
    await expect(hint()).toBeNull();
    await userEvent.click(
      await page.findByRole('menuitem', { name: 'Cancel' }),
    );
    await waitFor(() =>
      expect(hint()).toHaveTextContent('Select a person, then select another'),
    );

    await userEvent.click(canvas.getByTestId('pedigree-tool-disconnect'));
    await userEvent.click(personSymbol(canvasElement, 'ego'));
    await userEvent.click(personSymbol(canvasElement, 'lisa'));
    await page.findByRole('dialog');
    await expect(hint()).toBeNull();
  },
};

const FRAMING_TITLE = 'How should we describe your family?';

const focused = (canvasElement: HTMLElement) =>
  canvasElement.ownerDocument.activeElement;

const personPanel = (canvasElement: HTMLElement) =>
  canvasElement.ownerDocument.querySelector<HTMLElement>(
    '[data-testid="pedigree-person-panel"]',
  );

/**
 * Until the wording is chosen, the family cannot be used. Selecting someone
 * before the question has opened asks it at once, and no panel opens. While
 * the question is held open, every person and the connect tools are
 * disabled. Once a wording is chosen, the family can be used again.
 */
export const TheFamilyWaitsForTheWording: Story = {
  render: () => (
    <CanvasStory family={threePeople} framing="participantPreference" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    // Selected before the question opens by itself, a person asks it.
    await userEvent.click(await canvas.findByRole('button', { name: /^You/ }));
    await body.findByText(FRAMING_TITLE, {}, { timeout: 500 });
    await expect(personPanel(canvasElement)).toBeNull();

    for (const id of ['ego', 'mum', 'dad']) {
      await expect(personSymbol(canvasElement, id)).toBeDisabled();
    }
    await expect(canvas.getByTestId('pedigree-tool-connect')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.click(personSymbol(canvasElement, 'mum'), {
      pointerEventsCheck: 0,
    });
    await expect(personPanel(canvasElement)).toBeNull();
    await expect(canvas.queryByTestId('pedigree-menu-parent')).toBeNull();

    await userEvent.click(
      body.getByRole('option', { name: /Mother, Father, Sister, Brother/ }),
    );
    await waitFor(() => expect(body.queryByText(FRAMING_TITLE)).toBeNull());
    await expect(personSymbol(canvasElement, 'mum')).toBeEnabled();
    await userEvent.click(personSymbol(canvasElement, 'mum'));
    await waitFor(() => expect(personPanel(canvasElement)).not.toBeNull());
  },
};

/**
 * Opened again once a wording is chosen, the question closes as any popover
 * does when focus leaves it, and leaves the family usable while it is open.
 */
export const TheWordingOpenedAgainClosesOnFocusLoss: Story = {
  render: () => (
    <CanvasStory family={threePeople} framing="participantPreference" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await body.findByText(FRAMING_TITLE, {}, { timeout: 5000 });
    await userEvent.click(
      body.getByRole('option', { name: /Mother, Father, Sister, Brother/ }),
    );
    await waitFor(() => expect(body.queryByText(FRAMING_TITLE)).toBeNull());

    const trigger = canvas.getByRole('button', { name: 'Wording' });
    await userEvent.click(trigger);
    await body.findByText(FRAMING_TITLE);
    await expect(personSymbol(canvasElement, 'mum')).toBeEnabled();
    await userEvent.tab();
    await userEvent.tab();
    await waitFor(() => expect(body.queryByText(FRAMING_TITLE)).toBeNull());
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  },
};

/**
 * Choosing the wording returns focus to its toolbar button, even after focus
 * has been away while the question waited for an answer.
 */
export const ChoosingTheWordingReturnsFocusToItsButton: Story = {
  render: () => (
    <CanvasStory family={threePeople} framing="participantPreference" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await body.findByText(FRAMING_TITLE, {}, { timeout: 5000 });
    const trigger = canvas.getByRole('button', { name: 'Wording' });
    // Out to the rest of the toolbar, and back into the question.
    canvas.getByRole('button', { name: 'Zoom in' }).focus();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const [first] = body.getAllByRole('option');
    first?.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(body.queryByText(FRAMING_TITLE)).toBeNull());
    await waitFor(() => expect(focused(canvasElement)).toBe(trigger));
  },
};

/** Watches for the given time, failing the moment the check does. */
async function holdsFor(ms: number, check: () => void) {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    check();
    await nextFrame();
  }
  check();
}

/**
 * Answered before it would have opened by itself, the wording question does
 * not open again uninvited, and takes no focus from what the participant
 * goes on to do.
 */
export const TheWordingQuestionOpensOnceOnly: Story = {
  render: () => (
    <CanvasStory family={threePeople} framing="participantPreference" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    // Selecting someone asks the question at once, and it is answered.
    await userEvent.click(await canvas.findByRole('button', { name: /^You/ }));
    await userEvent.click(
      await body.findByRole('option', {
        name: /Mother, Father, Sister, Brother/,
      }),
    );
    await waitFor(() => expect(body.queryByText(FRAMING_TITLE)).toBeNull());
    const trigger = canvas.getByRole('button', { name: 'Wording' });
    // Well past the moment it would have opened by itself.
    await holdsFor(1800, () => {
      expect(body.queryByText(FRAMING_TITLE), 'the question again').toBeNull();
      expect(focused(canvasElement), 'focus kept').toBe(trigger);
    });
  },
};

/**
 * While the wording question is held open, Tab still reaches its choices,
 * even after focus has left it and Escape has been pressed.
 */
export const TheHeldWordingQuestionStaysInTheTabOrder: Story = {
  render: () => (
    <CanvasStory family={threePeople} framing="participantPreference" />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await body.findByText(FRAMING_TITLE, {}, { timeout: 5000 });
    const options = () => body.getAllByRole('option');
    await waitFor(() => expect(options()).toContain(focused(canvasElement)));
    // Out of the question and past its button, Escape, and round again.
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await userEvent.keyboard('{Escape}');
    await expect(body.getByText(FRAMING_TITLE)).toBeInTheDocument();
    let reached = false;
    for (let press = 0; press < 12 && !reached; press++) {
      await userEvent.tab();
      reached = options().includes(focused(canvasElement) as HTMLElement);
    }
    await expect(reached, 'Tab reached a choice').toBe(true);
  },
};

/** A touch at the point given, as a phone's tap. */
function tapAt(document: Document, x: number, y: number) {
  const target = document.elementFromPoint(x, y);
  if (!target) throw new Error('Nothing at the point tapped');
  const init = {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: x,
    clientY: y,
    bubbles: true,
  };
  fireEvent.pointerDown(target, { ...init, buttons: 1 });
  fireEvent.pointerUp(target, init);
  fireEvent.click(target, { clientX: x, clientY: y, detail: 1 });
}

/**
 * On a phone held sideways the wording question fits the screen, scrolling
 * rather than running off the top, so its heading can be read. A tap aimed
 * at the participant, landing on the question as it opens over them,
 * chooses nothing.
 */
export const TheWordingQuestionFitsAPhoneOnItsSide: Story = {
  parameters: {
    viewport: {
      options: {
        phoneLandscape: {
          name: 'Phone (landscape)',
          styles: { width: '844px', height: '390px' },
          type: 'mobile',
        },
      },
    },
  },
  globals: { viewport: { value: 'phoneLandscape', isRotated: false } },
  render: () => (
    <CanvasStory family={threePeople} framing="participantPreference" />
  ),
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const body = within(document.body);
    const you = await within(canvasElement).findByRole('button', {
      name: /^You/,
    });
    const youBox = boxOf(you);
    await body.findByText(FRAMING_TITLE, {}, { timeout: 5000 });
    tapAt(
      document,
      (youBox.left + youBox.right) / 2,
      (youBox.top + youBox.bottom) / 2,
    );
    await expect(body.getByText(FRAMING_TITLE)).toBeInTheDocument();
    for (const option of body.getAllByRole('option')) {
      await expect(option).toHaveAttribute('aria-selected', 'false');
    }
    await settled(canvasElement);
    await waitFor(() =>
      expect(
        boxOf(body.getByText(FRAMING_TITLE)).top,
        'the heading below the top of the screen',
      ).toBeGreaterThanOrEqual(0),
    );
  },
};

/**
 * Changing the wording renames everyone shown by a label, and says so.
 */
export const ChangingTheWordingIsAnnounced: Story = {
  render: () => (
    <CanvasStory family={threePeople} framing="participantPreference" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole(
        'option',
        { name: /Mother, Father, Sister, Brother/ },
        { timeout: 5000 },
      ),
    );
    await waitFor(() =>
      expect(liveRegionText(canvasElement)).toContain('mother, father'),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Wording' }));
    await userEvent.click(
      await body.findByRole('option', {
        name: /Egg parent, Sperm parent, Sibling/,
      }),
    );
    await waitFor(() =>
      expect(liveRegionText(canvasElement)).toContain('egg parent'),
    );
  },
};

/** Drags the canvas with the mouse from a point, in ten steps. */
function dragFrom(element: Element, dx: number, dy: number) {
  const box = element.getBoundingClientRect();
  const start = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const at = (step: number) => ({
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    bubbles: true,
    clientX: start.x + (dx * step) / 10,
    clientY: start.y + (dy * step) / 10,
  });
  fireEvent.pointerDown(element, { ...at(0), buttons: 1 });
  for (let step = 1; step <= 10; step++) {
    fireEvent.pointerMove(element, { ...at(step), buttons: 1 });
  }
  fireEvent.pointerUp(element, at(10));
}

/**
 * The add menu shown around the participant on a first visit goes once the
 * mouse is used, here to drag the canvas from the participant's symbol:
 * from then on the menu follows the pointer, and does not come back (and
 * pull the view back to the participant) whenever the pointer is over no
 * one.
 */
export const TheFirstVisitMenuGoesOnceTheMouseIsUsed: Story = {
  render: () => (
    <CanvasStory
      family={{
        people: [
          { id: 'ego', name: 'Ana', gender: 'woman', sex: 'female', ego: true },
        ],
        links: [],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const you = await canvas.findByRole('button', { name: /^You/ });
    await canvas.findByTestId('pedigree-menu-parent');
    dragFrom(you, 120, 40);
    await settled(canvasElement);
    await waitFor(() =>
      expect(canvas.queryByTestId('pedigree-menu-parent')).toBeNull(),
    );
  },
};

/**
 * The add menu follows the mouse alone, in every browser. Moving the pointer
 * from a person's menu into the panel it opened leaves the person, though
 * the browser may say nothing of it (the menu button the pointer was on went
 * when the panel opened), so once the panel closes after a click in it, no
 * menu shows until the pointer is over someone again.
 */
export const TheMenuDoesNotOutstayThePointer: Story = {
  render: () => (
    <CanvasStory
      family={{
        people: [
          { id: 'ego', name: 'Ana', gender: 'woman', sex: 'female', ego: true },
        ],
        links: [],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(await canvas.findByRole('button', { name: /^You/ }));
    await userEvent.click(await canvas.findByTestId('pedigree-menu-parent'));
    await waitFor(() => expect(personPanel(canvasElement)).not.toBeNull());
    const panel = within(personPanel(canvasElement) as HTMLElement);
    await userEvent.click(panel.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(personPanel(canvasElement)).toBeNull());
    await waitFor(() =>
      expect(canvas.queryByTestId('pedigree-menu-parent')).toBeNull(),
    );
    // Over someone again, the pointer shows their menu.
    await userEvent.hover(canvas.getByRole('button', { name: /^You/ }));
    await canvas.findByTestId('pedigree-menu-parent');
  },
};

/** A tap, as a touch screen sends it. */
function tap(element: Element) {
  const box = element.getBoundingClientRect();
  const init = {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: box.left + box.width / 2,
    clientY: box.top + box.height / 2,
    bubbles: true,
  };
  fireEvent.pointerDown(element, { ...init, buttons: 1 });
  fireEvent.pointerUp(element, init);
  fireEvent.click(element, { ...init, detail: 1 });
}

/**
 * On a phone held sideways, a child added from the participant's add menu
 * by touch can be tapped once the panel closes: bringing the participant's
 * menu back into view does not push the child under the toolbar.
 */
export const AChildAddedByTouchCanBeTapped: Story = {
  parameters: {
    viewport: {
      options: {
        phoneLandscape: {
          name: 'Phone (landscape)',
          styles: { width: '844px', height: '320px' },
          type: 'mobile',
        },
      },
    },
  },
  globals: { viewport: { value: 'phoneLandscape', isRotated: false } },
  render: () => (
    <CanvasStory
      family={{
        people: [
          { id: 'ego', name: 'Ana', gender: 'woman', sex: 'female', ego: true },
        ],
        links: [],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /^You/ });
    // Alone on a first visit, the participant's menu is showing.
    tap(await canvas.findByTestId('pedigree-menu-child'));
    await waitFor(() => expect(personPanel(canvasElement)).not.toBeNull());
    const panel = within(personPanel(canvasElement) as HTMLElement);
    await userEvent.type(
      panel.getByRole('textbox', { name: 'Name (optional)' }),
      'Emma',
    );
    for (const answer of [
      'Woman',
      'Female',
      'No other parent',
      'A biological child',
    ]) {
      tap(panel.getByRole('radio', { name: answer }));
    }
    const carried = panel.queryByRole('radiogroup', {
      name: 'Who carried the pregnancy?',
    });
    if (carried) tap(within(carried).getByRole('radio', { name: /^You/ }));
    tap(panel.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(personPanel(canvasElement)).toBeNull());
    await settled(canvasElement);
    const emma = canvas.getByRole('button', { name: 'Emma' });
    await expect(
      overlaps(boxOf(emma), toolbarBox(canvasElement)),
      'Emma clear of the toolbar',
    ).toBe(false);
    await expect(
      inside(boxOf(emma), canvasBox(canvasElement)),
      'Emma on the canvas',
    ).toBe(true);
  },
};

/**
 * On a portrait tablet, opening the panel to add a parent of Ivy keeps Ivy
 * in view beside the panel, with the parent being added.
 */
export const ThePersonAddedToStaysInViewBesideThePanel: Story = {
  parameters: {
    viewport: {
      options: {
        tabletPortrait: {
          name: 'Tablet (portrait)',
          styles: { width: '768px', height: '1024px' },
          type: 'tablet',
        },
      },
    },
  },
  globals: { viewport: { value: 'tabletPortrait', isRotated: false } },
  render: () => (
    <CanvasStory
      family={{
        people: [
          { id: 'ego', name: 'Ana', gender: 'woman', sex: 'female', ego: true },
          { id: 'beth', name: 'Beth', gender: 'woman', sex: 'female' },
          { id: 'carmen', name: 'Carmen', gender: 'woman', sex: 'female' },
          { id: 'ivy', name: 'Ivy', gender: 'woman', sex: 'female' },
        ],
        links: [
          { from: 'beth', to: 'carmen', kind: 'partner' },
          { from: 'beth', to: 'ego', kind: 'biological', carrier: true },
          { from: 'carmen', to: 'ego', kind: 'social' },
          { from: 'beth', to: 'ivy', kind: 'biological', carrier: true },
          { from: 'carmen', to: 'ivy', kind: 'social' },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /^You/ });
    await settled(canvasElement);
    await userEvent.hover(personSymbol(canvasElement, 'ivy'));
    await userEvent.click(await canvas.findByTestId('pedigree-menu-parent'));
    await waitFor(() => expect(personPanel(canvasElement)).not.toBeNull());
    await settled(canvasElement);
    const panel = boxOf(personPanel(canvasElement) as HTMLElement);
    const strip = { ...canvasBox(canvasElement), right: panel.left };
    await expect(
      inside(boxOf(personSymbol(canvasElement, 'ivy')), strip),
      'Ivy beside the panel',
    ).toBe(true);
  },
};

/** Drags the canvas by (dx, dy) with the mouse, slowly: in many small
 * steps. */
function dragSlowly(viewport: HTMLElement, dx: number, dy: number) {
  const box = viewport.getBoundingClientRect();
  const steps = 25;
  const start = {
    x: box.left + box.width * 0.5,
    y: box.top + box.height * 0.5,
  };
  const at = (step: number) => ({
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: start.x + (dx * step) / steps,
    clientY: start.y + (dy * step) / steps,
  });
  fireEvent.pointerDown(viewport, { ...at(0), buttons: 1 });
  for (let step = 1; step <= steps; step++) {
    fireEvent.pointerMove(viewport, { ...at(step), buttons: 1 });
  }
  fireEvent.pointerUp(viewport, at(steps));
}

const phoneLandscape = {
  parameters: {
    viewport: {
      options: {
        phoneLandscape: {
          name: 'Phone (landscape)',
          styles: { width: '844px', height: '390px' },
          type: 'mobile',
        },
      },
    },
  },
  globals: { viewport: { value: 'phoneLandscape', isRotated: false } },
};

/** Linda and Robert, and their children: the participant and Bea. */
const twoGenerations: Family = {
  people: [
    { id: 'ego', name: 'Ana', gender: 'woman', sex: 'female', ego: true },
    { id: 'linda', name: 'Linda', gender: 'woman', sex: 'female' },
    { id: 'robert', name: 'Robert', gender: 'man', sex: 'male' },
    { id: 'bea', name: 'Bea', gender: 'woman', sex: 'female' },
  ],
  links: [
    { from: 'linda', to: 'robert', kind: 'partner' },
    { from: 'linda', to: 'ego', kind: 'biological', carrier: true },
    { from: 'robert', to: 'ego', kind: 'biological' },
    { from: 'linda', to: 'bea', kind: 'biological', carrier: true },
    { from: 'robert', to: 'bea', kind: 'biological' },
  ],
};

/**
 * Zoomed all the way in on a phone held sideways, where one row is further
 * from the next than the canvas is tall, a slow drag still moves from the
 * parents' row to the children's: the drag is not caught in the gap
 * between them.
 */
export const ASlowDragCrossesBetweenGenerations: Story = {
  ...phoneLandscape,
  render: () => <CanvasStory family={twoGenerations} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /^You/ });
    const viewport = canvas.getByTestId('pedigree-canvas');
    const zoomIn = canvas.getByRole('button', { name: 'Zoom in' });
    while (!isDisabled(zoomIn)) {
      fireEvent.click(zoomIn);
      await settled(canvasElement);
    }
    const clear = () => ({
      ...canvasBox(canvasElement),
      top: boxOf(canvas.getByRole('heading', { name: /^Add the members/ }))
        .bottom,
      bottom: toolbarBox(canvasElement).top,
    });
    // Down to the parents' row first.
    for (let drag = 0; drag < 6; drag++) dragSlowly(viewport, 0, 280);
    await settled(canvasElement);
    await expect(
      overlaps(boxOf(personSymbol(canvasElement, 'linda')), clear()),
      'Linda in view',
    ).toBe(true);
    // Then slowly up, as far as it takes, to the children's.
    for (let drag = 0; drag < 6; drag++) {
      dragSlowly(viewport, 0, -280);
      await settled(canvasElement);
      if (overlaps(boxOf(personSymbol(canvasElement, 'ego')), clear())) break;
    }
    await expect(
      overlaps(boxOf(personSymbol(canvasElement, 'ego')), clear()),
      'the participant in view',
    ).toBe(true);
  },
};

/**
 * + and − zoom with keyboard focus on the toolbar, after choosing a tool, as
 * they do with focus in the family.
 */
export const ZoomKeysWorkFromTheToolbar: Story = {
  render: () => <CanvasStory family={threePeople} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /^You/ });
    await settled(canvasElement);
    const width = () =>
      boxOf(personSymbol(canvasElement, 'ego')).right -
      boxOf(personSymbol(canvasElement, 'ego')).left;
    const before = width();
    canvas.getByTestId('pedigree-tool-connect').focus();
    await userEvent.keyboard('-');
    await settled(canvasElement);
    await expect(width(), 'zoomed out').toBeLessThan(before - 1);
    canvas.getByRole('button', { name: 'Zoom in' }).focus();
    for (let press = 0; press < 2; press++) {
      await userEvent.keyboard('+');
      await settled(canvasElement);
    }
    await expect(width(), 'zoomed in').toBeGreaterThan(before + 1);
  },
};

/** The size on screen, in pixels, of the smallest name drawn in a symbol. */
function smallestNameOnScreen(canvasElement: HTMLElement) {
  let smallest = Number.POSITIVE_INFINITY;
  for (const person of within(canvasElement).getAllByTestId(
    'pedigree-person',
  )) {
    const symbol = person.querySelector('button') as HTMLElement;
    const scale = symbol.getBoundingClientRect().width / symbol.offsetWidth;
    for (const text of symbol.querySelectorAll('span')) {
      if (!text.textContent?.trim()) continue;
      smallest = Math.min(
        smallest,
        Number.parseFloat(getComputedStyle(text).fontSize) * scale,
      );
    }
  }
  return smallest;
}

const phonePortrait = {
  parameters: {
    viewport: {
      options: {
        phonePortrait: {
          name: 'Phone (portrait)',
          styles: { width: '390px', height: '844px' },
          type: 'mobile',
        },
      },
    },
  },
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
};

/**
 * On a phone, each prompt opens with every name drawn at least as large as
 * the smallest legible size, on the family's own prompt (here a family too
 * wide to show whole at that size, which opens on the participant) and on
 * a nomination prompt, where relatives are chosen by name.
 */
export const NamesOpenLegibleOnAPhone: Story = {
  ...phonePortrait,
  render: () => (
    <CanvasStory
      family={fourGenerations}
      nominationPrompts={[{ text: HEART_PROMPT }]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /^You/ });
    await settled(canvasElement);
    await expect(
      smallestNameOnScreen(canvasElement),
      'names on the family prompt',
    ).toBeGreaterThanOrEqual(11.9);
    await expect(
      inside(
        boxOf(personSymbol(canvasElement, 'ego')),
        canvasBox(canvasElement),
      ),
      'the participant in view',
    ).toBe(true);
    await userEvent.click(canvas.getByTestId('next-button'));
    await canvas.findByText(HEART_PROMPT);
    await settled(canvasElement);
    await expect(
      smallestNameOnScreen(canvasElement),
      'names on the nomination prompt',
    ).toBeGreaterThanOrEqual(11.9);
  },
};

/**
 * On a nomination prompt, where no add menu is shown, showing the whole
 * family leaves no room for one, so a small family is drawn at its natural
 * size on a phone, names legible.
 */
export const TheWholeFamilyOnANominationPromptLeavesNoMenuRoom: Story = {
  ...phonePortrait,
  render: () => (
    <CanvasStory
      family={twoGenerations}
      nominationPrompts={[{ text: HEART_PROMPT }]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /^You/ });
    await userEvent.click(canvas.getByTestId('next-button'));
    await canvas.findByText(HEART_PROMPT);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Show the whole family' }),
    );
    await settled(canvasElement);
    await expect(smallestNameOnScreen(canvasElement)).toBeGreaterThanOrEqual(
      11.9,
    );
  },
};

/**
 * Once the second person is picked, the instruction to pick them is taken
 * back from what a screen reader can find, as it is from the screen: the
 * menu asks its own question.
 */
export const TheConnectInstructionIsTakenBackOncePicked: Story = {
  render: () => <CanvasStory family={lindaAndKim} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole('button', { name: /^You/ });
    await userEvent.click(canvas.getByTestId('pedigree-tool-connect'));
    await userEvent.click(personSymbol(canvasElement, 'linda'));
    await waitFor(() =>
      expect(liveRegionText(canvasElement)).toContain('Now select'),
    );
    await userEvent.click(personSymbol(canvasElement, 'kim'));
    await page.findByRole('menu');
    await expect(liveRegionText(canvasElement)).not.toContain('Now select');
  },
};

/**
 * Cancelling the confirmation to remove someone, with the button or with
 * Escape, returns focus to them: nothing was removed.
 */
export const CancellingARemovalReturnsFocusToThePerson: Story = {
  render: () => <CanvasStory family={lindaAndKim} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await within(canvasElement).findByRole('button', { name: /^You/ });
    for (const dismiss of ['button', 'escape'] as const) {
      await userEvent.click(personSymbol(canvasElement, 'kim'));
      await waitFor(() => expect(personPanel(canvasElement)).not.toBeNull());
      await userEvent.click(
        within(personPanel(canvasElement) as HTMLElement).getByRole('button', {
          name: 'Delete',
        }),
      );
      const dialog = await body.findByRole('dialog', { name: /^Remove/ });
      if (dismiss === 'button') {
        await userEvent.click(
          within(dialog).getByRole('button', { name: 'Cancel' }),
        );
      } else {
        await userEvent.keyboard('{Escape}');
      }
      await waitFor(() =>
        expect(body.queryByRole('dialog', { name: /^Remove/ })).toBeNull(),
      );
      await waitFor(() =>
        expect(focused(canvasElement), dismiss).toBe(
          personSymbol(canvasElement, 'kim'),
        ),
      );
    }
  },
};

/**
 * Removing someone from the keyboard leaves focus on a person still in the
 * family, not on nothing.
 */
export const RemovingSomeoneKeepsFocusInTheFamily: Story = {
  render: () => <CanvasStory family={lindaAndKim} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await within(canvasElement).findByRole('button', { name: /^You/ });
    await tabIntoFamily(canvasElement);
    personSymbol(canvasElement, 'kim').focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(personPanel(canvasElement)).not.toBeNull());
    within(personPanel(canvasElement) as HTMLElement)
      .getByRole('button', { name: 'Delete' })
      .focus();
    await userEvent.keyboard('{Enter}');
    const dialog = await body.findByRole('dialog', { name: /^Remove/ });
    within(dialog).getByRole('button', { name: 'Delete' }).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-person-id="kim"]')).toBeNull(),
    );
    await waitFor(() =>
      expect(
        focused(canvasElement)?.closest('[data-testid="pedigree-person"]'),
      ).not.toBeNull(),
    );
  },
};

/**
 * The arrow keys move to the person drawn next in that direction, the same
 * at every zoom: up from Dana, the participant's partner, is Ana, the
 * participant's mother, one row up — not her parents two rows up.
 */
export const ArrowKeysMoveAlikeAtEveryZoom: Story = {
  render: () => (
    <CanvasStory
      family={{
        people: [
          { id: 'ego', name: 'Zoe', gender: 'woman', sex: 'female', ego: true },
          { id: 'ana', name: 'Ana', gender: 'woman', sex: 'female' },
          { id: 'ben', name: 'Ben', gender: 'man', sex: 'male' },
          { id: 'carl', name: 'Carl', gender: 'man', sex: 'male' },
          { id: 'dana', name: 'Dana', gender: 'woman', sex: 'female' },
          { id: 'eli', name: 'Eli', gender: 'man', sex: 'male' },
          { id: 'flo', name: 'Flo', gender: 'woman', sex: 'female' },
          { id: 'gus', name: 'Gus', gender: 'man', sex: 'male' },
        ],
        links: [
          { from: 'ana', to: 'ben', kind: 'partner' },
          { from: 'ana', to: 'ego', kind: 'biological', carrier: true },
          { from: 'ben', to: 'ego', kind: 'biological' },
          { from: 'ana', to: 'carl', kind: 'biological', carrier: true },
          { from: 'ben', to: 'carl', kind: 'biological' },
          { from: 'ego', to: 'dana', kind: 'partner' },
          { from: 'ego', to: 'eli', kind: 'biological', carrier: true },
          { from: 'dana', to: 'eli', kind: 'biological' },
          { from: 'flo', to: 'ana', kind: 'biological', carrier: true },
          { from: 'gus', to: 'ana', kind: 'biological' },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /^You/ });
    await tabIntoFamily(canvasElement);
    const zoomIn = canvas.getByRole('button', { name: 'Zoom in' });
    const zoomOut = canvas.getByRole('button', { name: 'Zoom out' });
    const upFromDana = async () => {
      personSymbol(canvasElement, 'dana').focus();
      await userEvent.keyboard('{ArrowUp}');
      return focused(canvasElement)?.closest<HTMLElement>(
        '[data-testid="pedigree-person"]',
      )?.dataset.personId;
    };
    const reached: (string | undefined)[] = [await upFromDana()];
    for (let step = 0; step < 3 && !isDisabled(zoomIn); step++) {
      fireEvent.click(zoomIn);
      await settled(canvasElement);
      reached.push(await upFromDana());
    }
    for (let step = 0; step < 6 && !isDisabled(zoomOut); step++) {
      fireEvent.click(zoomOut);
      await settled(canvasElement);
      reached.push(await upFromDana());
    }
    await expect(
      reached.every((id) => id === 'ana'),
      reached.join(),
    ).toBe(true);
  },
};

/**
 * Two relatives given the same name are each called by it exactly as typed,
 * wherever they are named: in their symbols and accessible names, their
 * panels' titles, the connect tool's announcements and the remove
 * confirmation.
 * Nothing is added to a typed name to tell them apart.
 */
export const NamesakesKeepTheirTypedNames: Story = {
  render: () => (
    <CanvasStory
      family={{
        people: [
          { id: 'ego', name: 'Ana', gender: 'woman', sex: 'female', ego: true },
          { id: 'dad', name: 'José García', gender: 'man', sex: 'male' },
          { id: 'grandad', name: 'José García', gender: 'man', sex: 'male' },
        ],
        links: [
          { from: 'dad', to: 'ego', kind: 'biological' },
          { from: 'grandad', to: 'dad', kind: 'biological' },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole('button', { name: /^You/ });
    // Both symbols show, and are read out as, the name alone.
    await expect(
      canvas.getAllByRole('button', { name: 'José García' }),
    ).toHaveLength(2);
    for (const id of ['dad', 'grandad']) {
      await expect(personSymbol(canvasElement, id)).toHaveTextContent(
        /^José García$/,
      );
    }

    // Each panel is titled by the name as typed.
    for (const id of ['dad', 'grandad']) {
      await userEvent.click(personSymbol(canvasElement, id));
      await waitFor(() => expect(personPanel(canvasElement)).not.toBeNull());
      const title = within(personPanel(canvasElement) as HTMLElement).getByRole(
        'heading',
        { level: 2 },
      ).textContent;
      await expect(title).toContain('José García');
      await expect(title).not.toMatch(/José García \d|José García \(/);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(personPanel(canvasElement)).toBeNull());
    }

    // Picking one to connect announces them as typed; the other, already
    // connected to them, cannot be picked.
    await userEvent.click(canvas.getByTestId('pedigree-tool-connect'));
    await userEvent.click(personSymbol(canvasElement, 'dad'));
    await waitFor(() =>
      expect(liveRegionText(canvasElement)).toContain('José García'),
    );
    await expect(liveRegionText(canvasElement)).not.toMatch(
      /José García \d|José García \(/,
    );
    await expect(personSymbol(canvasElement, 'grandad')).toBeDisabled();
    await userEvent.click(canvas.getByTestId('pedigree-tool-pointer'));

    // So is removing one of them.
    await userEvent.click(personSymbol(canvasElement, 'grandad'));
    await waitFor(() => expect(personPanel(canvasElement)).not.toBeNull());
    await userEvent.click(
      within(personPanel(canvasElement) as HTMLElement).getByRole('button', {
        name: 'Delete',
      }),
    );
    const dialog = await page.findByRole('dialog', { name: /^Remove/ });
    await expect(within(dialog).getByRole('heading').textContent).toBe(
      'Remove José García?',
    );
  },
};

/**
 * Someone drawn in brackets, as adopted, is announced as adopted, in their
 * symbol's description: the participant and their sister, both adopted by
 * Ruth. A typed name is read exactly as typed, with nothing added to it.
 */
export const AdoptionIsAnnounced: Story = {
  render: () => (
    <CanvasStory
      family={{
        people: [
          { id: 'ego', name: 'Sam', gender: 'man', sex: 'male', ego: true },
          { id: 'ruth', name: 'Ruth', gender: 'woman', sex: 'female' },
          { id: 'grace', name: 'Grace', gender: 'woman', sex: 'female' },
        ],
        links: [
          { from: 'ruth', to: 'ego', kind: 'adoptive' },
          { from: 'ruth', to: 'grace', kind: 'adoptive' },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const you = await canvas.findByRole('button', { name: /^You/ });
    await expect(you).toHaveAccessibleName('You');
    await expect(you).toHaveAccessibleDescription(/Adopted/);
    const grace = personSymbol(canvasElement, 'grace');
    await expect(grace).toHaveAccessibleName('Grace');
    await expect(grace).toHaveAccessibleDescription(/Adopted/);
    await expect(personSymbol(canvasElement, 'ruth')).toHaveAccessibleName(
      'Ruth',
    );
    await expect(
      personSymbol(canvasElement, 'ruth'),
    ).not.toHaveAccessibleDescription(/Adopted/);
  },
};
