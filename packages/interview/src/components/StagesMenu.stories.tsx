import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import InterfacePicture from '@codaco/interface-images/InterfacePicture';
import manifest, {
  type InterfaceType,
} from '@codaco/interface-images/manifest';

import StagesMenu, { type StageSummary } from './StagesMenu';

/**
 * Presentational stages menu shown when progress-bar navigation is enabled.
 * Lists every authored stage on a timeline, marks the current one,
 * de-emphasises stages skip logic would normally hide, and supports filtering
 * + keyboard listbox nav.
 *
 * The menu is pure (no Redux/dialog access); in the interview it is mounted in
 * the expanding panel the Navigation rail opens. Preview thumbnails are
 * injected by the host via `renderStagePreview`; this story supplies real
 * screenshots from `@codaco/interface-images` (a dev-only dependency).
 */
const stages: StageSummary[] = [
  { id: 's0', type: 'Information', label: 'Welcome' },
  { id: 's1', type: 'NameGenerator', label: 'About you' },
  { id: 's2', type: 'Sociogram', label: 'Your contacts' },
  { id: 's3', type: 'OrdinalBin', label: 'Your community' },
  { id: 's4', type: 'Information', label: 'Wrapping up' },
];

const isInterfaceType = (type: string): type is InterfaceType =>
  Object.hasOwn(manifest, type);

const renderStagePreview = (type: string) =>
  isInterfaceType(type) ? (
    <InterfacePicture
      type={type}
      ratio="16:9"
      sizes="8rem"
      alt=""
      className="size-full object-cover"
    />
  ) : null;

const meta: Meta<typeof StagesMenu> = {
  title: 'Components/StagesMenu',
  component: StagesMenu,
  parameters: {
    layout: 'centered',
  },
  args: {
    stages,
    currentStageIndex: 1,
    // The third stage is hidden by skip logic.
    skipMap: { 0: false, 1: false, 2: true, 3: false, 4: false },
    onSelect: fn(),
    renderStagePreview,
  },
  decorators: [
    (Story) => (
      <div className="bg-surface elevation-medium flex h-[34rem] w-96 flex-col overflow-hidden">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Drives the menu: verifies the active and skipped markers, that the filter
 * narrows the list, and that selecting an item (by click and by keyboard)
 * reports the right stage index.
 */
export const Interactions: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // All five stages are listed.
    await expect(canvas.getAllByRole('option')).toHaveLength(5);

    // The current stage is marked, and the skipped stage is flagged.
    const current = canvas.getByRole('option', { current: 'step' });
    await expect(current).toHaveTextContent('About you');
    await expect(canvas.getByText('Skipped')).toBeInTheDocument();

    // Filtering narrows the list to a single match…
    const filter = canvas.getByRole('searchbox', { name: /filter stages/i });
    await userEvent.type(filter, 'community');
    await expect(canvas.getAllByRole('option')).toHaveLength(1);

    // …and selecting it reports that stage's index (3).
    await userEvent.click(
      canvas.getByRole('option', { name: /your community/i }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith(3);

    // Clearing the filter restores the full list, and keyboard selection works.
    await userEvent.clear(filter);
    const welcome = canvas.getByRole('option', { name: /welcome/i });
    welcome.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onSelect).toHaveBeenCalledWith(0);
  },
};
