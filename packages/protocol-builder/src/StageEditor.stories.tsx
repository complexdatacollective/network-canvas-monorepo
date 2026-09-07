import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import type { StageType } from '@codaco/protocol-validation';

import { INTERFACE_NAMES } from './interfaces/interfaceNames.ts';
import { STAGE_TYPES } from './stage-types.ts';
import StageEditor from './StageEditor.tsx';
import { fixtureStageOfType } from './testing/protocolFixture.ts';
import { StageEditorStoryHost } from './testing/StageEditorStoryHost.tsx';

/**
 * The dispatcher, opened on a stage of whichever interface the control names.
 *
 * The stage is found BY TYPE in the shared all-interfaces protocol rather than
 * named, which is what lets one control reach all nineteen: the page a
 * reviewer gets is a real editing session over a configured stage, the same
 * one each family's own story opens, and switching the control switches the
 * interface rather than the editor — nothing here names an editor at all.
 *
 * Keyed on the type, because the host opens its session once and holds it: a
 * new stage id alone would leave the previous session — and the previous
 * interface — on screen under the new label.
 */
function DispatchedStageEditor({ type }: Readonly<{ type: StageType }>) {
  return (
    <StageEditorStoryHost
      key={type}
      stageId={fixtureStageOfType(type)}
      renderEditor={({ controller, actions }) => (
        <StageEditor controller={controller} actions={actions} />
      )}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Stage editors/Dispatcher',
  component: DispatchedStageEditor,
  args: { type: 'Information' },
  argTypes: {
    type: {
      // Every interface the schema has, read from the package's own key set
      // rather than listed, so an interface added to the schema appears in
      // this control without anybody remembering to add it.
      control: 'select',
      options: [...STAGE_TYPES],
      description: 'The interface whose stage is opened.',
    },
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The generic stage editor: give it a session and it renders the editor for whatever interface the stage turns out to be. This is how a host opens a stage — Architect and Studio never name an editor — and the `type` control walks every interface the schema has, one page each. The stories below default to one interface per editor family; the control reaches the rest. An interface with no editor is not a page this can show: the registry it dispatches through has an entry for every stage type, and the compiler refuses to describe one that does not.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DispatchedStageEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * What every story here asserts, in the source language.
 *
 * Read against the ARGUMENTS rather than against literals for the interface's
 * own name, so the assertion still means something after a reviewer moves the
 * control: switching to Sociogram has to produce the sociogram editor's page,
 * not merely a page. The rest is the chrome every editor wears — the name
 * field it opens on and the link to the interface's documentation — which is
 * how a page that dispatched to nothing at all would be caught.
 *
 * English, deliberately: `en` is the source locale, every descriptor renders
 * its own `defaultMessage` there, and a play written against a translation
 * would fail the moment the toolbar's language changed. See `ID_MAP.md`.
 */
const showsTheInterface = async (
  type: StageType,
  canvasElement: HTMLElement,
) => {
  const canvas = within(canvasElement);
  await awaitPassiveEffects();

  await expect(
    canvas.getByRole('textbox', { name: 'Stage name' }),
  ).toBeInTheDocument();
  // `getAllBy`, because the fixture's stages are named after the interfaces
  // they are of: the badge under the name field says "Sociogram" and so, on
  // most of these stages, does the researcher's own label for it — which the
  // name field's own invisible sizing replica then ALSO renders, ahead of the
  // badge in the DOM. Filtered to the one match not hidden from assistive
  // technology, so this reads the badge whether the label happens to repeat
  // it or not.
  const [visibleMatch] = canvas
    .getAllByText(INTERFACE_NAMES[type])
    .filter((element) => element.closest('[aria-hidden="true"]') === null);
  await expect(visibleMatch).toBeVisible();
  await expect(
    canvas.getByRole('link', { name: 'Documentation' }),
  ).toBeInTheDocument();
};

/** A page the participant reads, from the forms family. */
export const Forms: Story = {
  args: { type: 'Information' },
  play: ({ args, canvasElement }) =>
    showsTheInterface(args.type, canvasElement),
};

/** Naming people with a form, from the name-generator family. */
export const NameGenerators: Story = {
  args: { type: 'NameGenerator' },
  play: ({ args, canvasElement }) =>
    showsTheInterface(args.type, canvasElement),
};

/** Sorting people into categories, from the census and bin family. */
export const CensusAndBins: Story = {
  args: { type: 'CategoricalBin' },
  play: ({ args, canvasElement }) =>
    showsTheInterface(args.type, canvasElement),
};

/** Drawing the network on a canvas, from the network and spatial family. */
export const NetworkAndSpatial: Story = {
  args: { type: 'Sociogram' },
  play: ({ args, canvasElement }) =>
    showsTheInterface(args.type, canvasElement),
};

/** A family genealogy, from the pedigree and anonymisation family. */
export const PedigreeAndAnonymisation: Story = {
  args: { type: 'FamilyPedigree' },
  play: ({ args, canvasElement }) =>
    showsTheInterface(args.type, canvasElement),
};
