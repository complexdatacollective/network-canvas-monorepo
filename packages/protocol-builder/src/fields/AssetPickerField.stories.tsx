import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import { expect, screen, userEvent, within } from 'storybook/test';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import StageEditorShell from '../form/StageEditorShell.tsx';
import { ProtocolBuilder } from '../ProtocolBuilder.tsx';
import { ResourceClientProvider } from '../resources/client.tsx';
import {
  createStoryHost,
  IMAGE_RESOURCE,
  PROTOCOL_RESOURCES,
  ROSTER_RESOURCE,
  skylineImageFile,
  type StoryResource,
  type StoryStage,
} from '../resources/components/storyFixtures.ts';
import BuilderSection from '../sections/BuilderSection.tsx';
import { StageEditSession } from '../stageEdit.tsx';
import AssetPickerField from './AssetPickerField.tsx';

/** Which stage the picker under the researcher's cursor is a field of. */
type StagePreset =
  /** An information screen showing one image. */
  | 'welcome-screen'
  /** An information screen showing two, which may be the same image. */
  | 'two-image-items'
  /** A roster name generator, whose data source is a network resource. */
  | 'roster';

type StageScenario = Readonly<{ stage: StoryStage; children: ReactNode }>;

/**
 * The id and type of an information screen's item, mounted so the stage draft
 * the picker asks "is anything else using this?" of is a real one.
 *
 * The form replaces `items` wholesale with the paths that are mounted, and an
 * item without its `type` is not on the schema's asset branch — so a picker
 * inside an item whose type was left behind would find no references at all,
 * including its own. They carry nothing a researcher decides, so they are
 * mounted out of sight rather than put on screen.
 */
function itemIdentityFields(index: number): ReactNode {
  return (
    <div className="hidden">
      <Field
        component={InputField}
        name={`items[${index}].id`}
        nameMode="path"
        label={`Item ${index + 1} id`}
        labelHidden
      />
      <Field
        component={InputField}
        name={`items[${index}].type`}
        nameMode="path"
        label={`Item ${index + 1} type`}
        labelHidden
      />
    </div>
  );
}

function imageItemPicker(index: number, label: string): ReactNode {
  return (
    <Field
      component={AssetPickerField}
      name={`items[${index}].content`}
      nameMode="path"
      label={label}
      kind="image"
    />
  );
}

function assetItem(index: number, holding: string): SectionDoc {
  return { id: `item-${index + 1}`, type: 'asset', content: holding };
}

/**
 * Keyed by preset rather than switched on it, so a preset added above without
 * a stage to open it on fails to compile.
 */
const STAGE_SCENARIOS: Readonly<
  Record<StagePreset, (holding: string | undefined) => StageScenario>
> = {
  'welcome-screen': (holding) => ({
    stage: {
      stageId: 'welcome-screen',
      type: 'Information',
      fields: {
        label: 'Welcome',
        title: 'Welcome to the study',
        items: [assetItem(0, holding ?? '')],
      },
    },
    children: (
      <>
        {itemIdentityFields(0)}
        {imageItemPicker(0, 'Welcome image')}
      </>
    ),
  }),
  'two-image-items': (holding) => ({
    stage: {
      stageId: 'welcome-screen',
      type: 'Information',
      fields: {
        label: 'Welcome',
        title: 'Welcome to the study',
        items: [assetItem(0, holding ?? ''), assetItem(1, holding ?? '')],
      },
    },
    children: (
      <>
        {itemIdentityFields(0)}
        {imageItemPicker(0, 'First image')}
        {itemIdentityFields(1)}
        {imageItemPicker(1, 'Second image')}
      </>
    ),
  }),
  'roster': (holding) => ({
    stage: {
      stageId: 'roster',
      type: 'NameGeneratorRoster',
      fields: {
        label: 'People you know',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'prompt-1', text: 'Choose the people you know' }],
        ...(holding === undefined ? {} : { dataSource: holding }),
      },
    },
    children: (
      <Field
        component={AssetPickerField}
        name="dataSource"
        label="Roster data file"
        kind="network"
      />
    ),
  }),
};

type ResourcePickerHostProps = Readonly<{
  /** The stage the picker is a field of, and therefore what it may hold. */
  stage: StagePreset;
  /** The resources this protocol already contains. */
  resources: readonly StoryResource[];
  /** The resource id the stage draft opens on, if it opens on one. */
  holding?: string;
  /** Someone else holds the stage, so this editor opens read-only. */
  readOnly?: boolean;
  /** Whether the host can answer `inspect` for the resource a field holds. */
  hostCanInspect?: boolean;
}>;

/**
 * The contract served from memory, one stage opened over it, and a stage
 * editor whose fields are pickers.
 *
 * The host is built once, so a control changed after the story has rendered
 * does not rebuild the protocol underneath it — the same thing the stage
 * editor shell's own story does, and for the same reason: a host is a thing an
 * application supplies, not a prop.
 */
function ResourcePickerHost({
  stage,
  resources,
  holding,
  readOnly = false,
  hostCanInspect = true,
}: ResourcePickerHostProps) {
  const [scenario] = useState(() => STAGE_SCENARIOS[stage](holding));
  const [host] = useState(() => {
    const built = createStoryHost({
      resources,
      stage: scenario.stage,
      // A story is a state a researcher is looking at, so the state has to
      // hold still — including when they use the retry it offers.
      ...(hostCanInspect
        ? {}
        : { refuses: { procedure: 'inspect', forever: true } as const }),
    });
    if (readOnly) built.takeTheStage();
    return built;
  });

  return (
    <DialogProvider>
      <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
        <ResourceClientProvider>
          <StageEditSession target={{ sectionId: host.sectionId }}>
            <main className="mx-auto max-w-6xl p-6">
              <StageEditorShell>
                <BuilderSection
                  title="Resources"
                  description="What this stage shows the participant, or reads its people from."
                >
                  {scenario.children}
                </BuilderSection>
              </StageEditorShell>
            </main>
          </StageEditSession>
        </ResourceClientProvider>
      </ProtocolBuilder>
    </DialogProvider>
  );
}

const meta = {
  title: 'Protocol Builder/Resources/Resource picker',
  component: ResourcePickerHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Chooses the resource a stage field refers to. The field holds the asset id, exactly as the protocol format spells a resource reference, and everything the control knows — the resource list, what it is, what it looks like, whether it is saved or only imported — comes from the host contract. These stories run over the in-memory host, seeded with one protocol containing an image, a video, an audio file, a roster and an API key.',
      },
    },
  },
  args: {
    stage: 'welcome-screen',
    resources: PROTOCOL_RESOURCES,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ResourcePickerHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A field holding nothing, which is where every resource field starts. */
export const Empty: Story = {};

/**
 * A resource the protocol already contains, with the host's own reading of it
 * above a preview drawn from a URL the host resolved.
 */
export const Chosen: Story = {
  args: { holding: IMAGE_RESOURCE.id },
};

/**
 * Where a researcher chooses one: everything the protocol already holds of
 * this kind, everything imported since the stage was opened, and the way to
 * add another. Left open, because that is the state it is looked at in.
 */
export const TheResourceBrowser: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason; the ones after it
    // are about what the researcher just did.
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Select an image' }),
    );

    // The dialog is portalled out of the story root, so it is reached through
    // the document rather than the canvas.
    const dialog = await screen.findByRole('dialog');
    await expect(
      within(dialog).getByRole('list', { name: 'Resources in this protocol' }),
    ).toBeInTheDocument();
    await expect(
      within(dialog).getByRole('button', { name: IMAGE_RESOURCE.name }),
    ).toBeEnabled();
  },
};

/**
 * Choosing one: the browser lists what the protocol holds and what has been
 * imported since the stage was opened, and choosing closes it.
 */
export const ChoosingOne: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Select an image' }),
    );
    // The browser is portalled out of the story root; the field it reports
    // back to is inside the canvas.
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: IMAGE_RESOURCE.name }),
    );

    await expect(
      await canvas.findByRole('img', { name: IMAGE_RESOURCE.name }),
    ).toBeInTheDocument();
  },
};

/**
 * A file imported for this edit and not yet saved. It takes its asset id the
 * moment it is staged, so the field can point at it before the stage is
 * finished — and until then it is the researcher's to discard.
 */
export const ImportingAFile: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Select an image' }),
    );
    await userEvent.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      skylineImageFile(),
    );

    await expect(
      await canvas.findByText('Imported, not yet saved'),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Discard this resource' }),
    ).toBeInTheDocument();
  },
};

/**
 * A data file, whose summary is what a roster is chosen on: how many entries
 * it holds and which attributes it carries, read by the host from the bytes
 * themselves rather than recorded in the manifest.
 */
export const ARosterTheHostHasRead: Story = {
  args: { stage: 'roster', holding: ROSTER_RESOURCE.id },
};

/**
 * Two fields on the same stage naming one imported file. Discarding drops it
 * for the whole edit, so the field that asks is refused and offered the thing
 * it can always do instead: let go of it.
 */
export const SharedWithAnotherField: Story = {
  args: { stage: 'two-image-items', resources: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const first = await canvas.findByRole('group', { name: 'First image' });
    const second = canvas.getByRole('group', { name: 'Second image' });

    await userEvent.click(
      within(first).getByRole('button', { name: 'Select an image' }),
    );
    await userEvent.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      skylineImageFile(),
    );
    await within(first).findByText('Imported, not yet saved');

    // The second field is pointed at the very same import, which the browser
    // offers because it lists everything staged in this edit.
    await userEvent.click(
      within(second).getByRole('button', { name: 'Select an image' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'skyline.svg' }),
    );
    await within(second).findByText('Imported, not yet saved');

    await userEvent.click(
      within(first).getByRole('button', { name: 'Discard this resource' }),
    );

    await expect(await within(first).findByRole('alert')).toHaveTextContent(
      'This resource is still used elsewhere on this stage, so it was not discarded.',
    );
    await expect(
      within(first).getByRole('button', { name: 'Remove this resource' }),
    ).toBeEnabled();
  },
};

/**
 * A resource the protocol no longer has. Nothing can be said about it, so the
 * card says what the field is still doing and offers the one way off it: the
 * reference is cleared, and nothing is deleted.
 */
export const AResourceTheProtocolLost: Story = {
  // An id no seed above claims: the resource was removed from the protocol
  // after this stage was pointed at it.
  args: { holding: 'image-removed' },
};

/**
 * The host cannot answer for the resource the field holds. Repeating the ask
 * is offered, because a host that is unreachable now may not be in a moment —
 * and the reference is still clearable meanwhile.
 */
export const TheHostCannotAnswer: Story = {
  args: { holding: IMAGE_RESOURCE.id, hostCanInspect: false },
};

/** Someone else holds the stage: the field can be read and nothing else. */
export const Spectating: Story = {
  args: { holding: IMAGE_RESOURCE.id, readOnly: true },
};
