import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { EnclosingHeadingLevel } from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { ProtocolBuilder } from '@codaco/protocol-builder/ProtocolBuilder';
import StageEditor from '@codaco/protocol-builder/StageEditor';
import { createInMemoryHost } from '@codaco/protocol-builder/testing/host/createInMemoryHost';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import StageTitle from './StageTitle';

const STAGE_ID = 'welcome-screen';
const STAGE_SECTION = sectionId({ kind: 'stage', stageId: STAGE_ID });

const STAGE: SectionDoc = {
  id: STAGE_ID,
  type: 'Information',
  label: 'Welcome to the study',
  title: 'Welcome',
  items: [],
};

/**
 * The stage editor route, cut down to the gutter, the query container the two
 * columns are decided in, and the columns. The same nesting as
 * `pages/StageEditorPage`, because that is what the measurements below mean
 * anything about: a container on the wrong element changes the width the title
 * is answered about and nothing else would notice.
 */
function StageTitleInTheRoute({
  position,
  creating = false,
}: Readonly<{
  position?: Readonly<{ index: number; total: number }>;
  /** Opens a stage the interview does not contain yet, as the create flow does. */
  creating?: boolean;
}>) {
  const [host] = useState(() =>
    createInMemoryHost({
      sections: {
        [sectionId({ kind: 'settings' })]: {
          name: 'Stage title proof host',
          schemaVersion: 8,
        },
        [sectionId({ kind: 'stageOrder' })]: { stages: [STAGE_ID] },
        [sectionId({ kind: 'assets' })]: {},
        [STAGE_SECTION]: STAGE,
      },
    }),
  );

  return (
    <div className="h-full overflow-y-auto pb-32">
      {/* The route's own heading, which the title's `h2` counts from. */}
      <Heading level="h1" className="sr-only">
        {String(STAGE.label)}
      </Heading>
      <div className="phone-landscape:px-6 px-4">
        <div className="@container mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 gap-6 @min-[60rem]:grid-cols-[16rem_minmax(0,1fr)] @min-[60rem]:gap-10">
            <div />
            <div
              className="phone-landscape:-mx-6 -mx-4"
              data-testid="editor-column"
            >
              <ProtocolBuilder
                client={host.client}
                protocolId={host.protocolId}
              >
                <EnclosingHeadingLevel level="h2">
                  <StageEditor
                    target={
                      creating
                        ? { stageType: 'Information', position: 1 }
                        : { sectionId: STAGE_SECTION }
                    }
                    formId="stage-form"
                    // Above the form element and inside its provider, which
                    // is the pair a stage title needs.
                    header={() => (
                      <StageTitle
                        {...(position === undefined ? {} : { position })}
                      />
                    )}
                  />
                </EnclosingHeadingLevel>
              </ProtocolBuilder>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: 'Architect/Stage editor/Stage title',
  component: StageTitleInTheRoute,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The stage being edited, at the top of its page: a picture of the interface, where the stage sits in the interview, its name at hero size, what kind of stage it is and where that interface is documented. Architect’s rather than the editor package’s — the package publishes the name as a field and the facts about the interface, and this decides what they look like. It is drawn in the editor’s header slot, above the form and inside the form’s own provider, because the name is a field of that form.',
      },
    },
  },
  args: { position: { index: 3, total: 19 } },
  tags: ['autodocs'],
} satisfies Meta<typeof StageTitleInTheRoute>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A stage the interview already contains, with the name the researcher gave it. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The acquire is answered over a promise, so the editor arrives a turn
    // after the story mounts.
    await awaitPassiveEffects();
    const name = await canvas.findByRole('textbox', { name: 'Stage name' });
    await expect(name).toHaveValue('Welcome to the study');
    await expect(canvas.getByText('Stage 3 of 19')).toBeInTheDocument();
    await expect(canvas.getByText('Information')).toBeInTheDocument();
    await expect(
      canvas.getByRole('link', { name: 'Documentation' }),
    ).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/information/',
    );

    /*
      3.5rem between the title and the first section, measured rather than
      asserted about classes — a class list is the source written out twice.
      The title is found through the relationship it declares: the element that
      names itself by the heading inside it.
    */
    const heading = canvas.getByRole('heading', {
      level: 2,
      name: 'Stage name',
    });
    const title = canvasElement.querySelector(
      `[aria-labelledby="${CSS.escape(heading.id)}"]`,
    );
    if (!(title instanceof HTMLElement)) {
      throw new Error('the title is not on the page');
    }
    const firstSection = canvas.getByRole('region', { name: 'Page content' });
    await expect(
      firstSection.getBoundingClientRect().top -
        title.getBoundingClientRect().bottom,
    ).toBeCloseTo(56, 0);

    /*
      Where the picture rail is allowed beside the name — a fact about the ROOM
      the title has, which is the column the route gave the editor. The rail
      arrives at 48rem of it, a floor of 768 − 48 of gutter − 14rem of rail −
      32 of gap = 464px under the name.
    */
    const column = canvas.getByTestId('editor-column');
    const scroller = canvasElement.firstElementChild;
    if (!(scroller instanceof HTMLElement)) {
      throw new Error('the route wrapper is not there');
    }

    const initialWidth = scroller.style.width;
    /*
      The column is a grid track inside a capped, guttered container, so the
      width to ASK for is not the width wanted: converged on instead, which two
      passes settle because every step between is a fixed subtraction.
    */
    const atColumnWidth = async (width: number) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const measured = column.getBoundingClientRect().width;
        if (Math.abs(measured - width) < 0.5) break;
        const outer = scroller.getBoundingClientRect().width;
        scroller.style.width = `${outer + (width - measured)}px`;
        await new Promise(requestAnimationFrame);
      }
      // A container query resolves in layout, so the frame after the write is
      // the first that can have answered it.
      await new Promise(requestAnimationFrame);
      await expect(column.getBoundingClientRect().width).toBeCloseTo(width, 0);
      return {
        title: getComputedStyle(title).display,
        name: name.getBoundingClientRect().width,
      };
    };

    // One pixel below the threshold is still one column.
    const narrow = await atColumnWidth(767);
    await expect(narrow.title).toBe('flex');
    await expect(narrow.name).toBeCloseTo(767 - 48, 0);

    // At the threshold the rail arrives and the name is at its floor.
    const atThreshold = await atColumnWidth(768);
    await expect(atThreshold.title).toBe('grid');
    await expect(atThreshold.name).toBeCloseTo(464, 0);

    // Left as the story draws itself, so Chromatic photographs the page.
    scroller.style.width = initialWidth;
  },
};

/**
 * A stage being created: no place in the interview to report yet, and a name
 * proposed from what it collects rather than typed by anybody — so there is
 * nothing for the researcher to be dropped into, and the title claims no
 * focus.
 */
export const BeingCreated: Story = {
  args: { position: undefined, creating: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // Named from what the stage is, so the editor opens with something to
    // recognise it by rather than an empty required field.
    const name = await canvas.findByRole('textbox', { name: 'Stage name' });
    await waitFor(async () => {
      await expect(name).toHaveValue('Information');
    });
    // And the cursor is NOT in it: the stage arrives named, so this is an
    // ordinary route arrival and the route's own heading keeps the focus.
    await expect(name).not.toHaveFocus();
    // Nothing to say about where it sits: the interview does not contain it.
    await expect(canvas.queryByText(/^Stage \d+ of \d+$/)).toBeNull();
  },
};
