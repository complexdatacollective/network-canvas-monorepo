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
 * The stage editor route, cut down to the part this is about: the gutter, the
 * query container the two columns are decided in, and the columns themselves.
 *
 * The same nesting as `pages/StageEditorPage`, because that nesting is what
 * the measurements below mean anything about — a container declared on the
 * wrong element, or a gutter inside the cap instead of outside it, changes the
 * width the title is answered about and nothing else would notice.
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
                    // The editor's HEADER slot: above the form element and
                    // inside the form's own provider, which is the pair a
                    // stage title needs — the name is a field of that form.
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
    // The host answers the acquire over a promise, so the editor — and the
    // title it draws from the slot — arrive a turn after the story mounts.
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
      The rhythm Architect's stage editor has always had between the top of the
      title and its first section — 3.5rem — measured rather than asserted
      about classes: a class list is the source written out twice, and jsdom
      resolves no Tailwind at all, so this only means anything in the browser
      the `storybook` project runs.

      The title is found through the relationship it declares rather than
      through a class or a position: it is the element that names itself by the
      heading inside it.
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
      And where the picture rail is allowed beside the name, which is a fact
      about the ROOM the title has rather than about the window: the title is
      drawn in the editor's header slot, so what answers its container query is
      the column the route gave the editor.

      The rail arrives at 48rem of that column, which is a floor under the
      NAME: the editor pads its own column by 24px a side, so 768 − 48 of
      gutter − 14rem of rail − 32 of gap leaves the name 464px. Narrower than
      that and the rail would be taking room the name has not got, so the title
      stacks and the name keeps the whole width.
    */
    const column = canvas.getByTestId('editor-column');
    const scroller = canvasElement.firstElementChild;
    if (!(scroller instanceof HTMLElement)) {
      throw new Error('the route wrapper is not there');
    }

    const initialWidth = scroller.style.width;
    /*
      The column is a grid track beside a 16rem rail inside a capped, guttered
      container, so the width to ASK the page for is not the width wanted. It
      is converged on instead: set a width, measure what the column became, and
      correct by the difference. Two passes settle it, because every step
      between the two is a fixed subtraction.
    */
    const atColumnWidth = async (width: number) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const measured = column.getBoundingClientRect().width;
        if (Math.abs(measured - width) < 0.5) break;
        const outer = scroller.getBoundingClientRect().width;
        scroller.style.width = `${outer + (width - measured)}px`;
        await new Promise(requestAnimationFrame);
      }
      // A container query is resolved in layout, so the frame after the write
      // is the first one that can have answered it.
      await new Promise(requestAnimationFrame);
      await expect(column.getBoundingClientRect().width).toBeCloseTo(width, 0);
      return {
        title: getComputedStyle(title).display,
        name: name.getBoundingClientRect().width,
      };
    };

    // One pixel below the threshold is still one column, and the name has all
    // of it bar the editor's own gutter.
    const narrow = await atColumnWidth(767);
    await expect(narrow.title).toBe('flex');
    await expect(narrow.name).toBeCloseTo(767 - 48, 0);

    // At the threshold the rail arrives and the name is at its floor.
    const atThreshold = await atColumnWidth(768);
    await expect(atThreshold.title).toBe('grid');
    await expect(atThreshold.name).toBeCloseTo(464, 0);

    // Left as the story draws itself, so what Chromatic photographs is the
    // page rather than the last width this measured.
    scroller.style.width = initialWidth;
  },
};

/**
 * A stage being created. It has no place in the interview to report yet, and
 * the name it opens on was proposed from what the stage collects rather than
 * typed by anybody.
 */
export const BeingCreated: Story = {
  args: { position: undefined, creating: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // Named from what the stage is, by the package, so the researcher opens an
    // editor with something to recognise the stage by rather than an empty
    // required field.
    const name = await canvas.findByRole('textbox', { name: 'Stage name' });
    await waitFor(async () => {
      await expect(name).toHaveValue('Information');
    });
    // And the cursor is already in it: naming the stage IS the next step.
    await expect(name).toHaveFocus();
    // Nothing to say about where it sits: the interview does not contain it.
    await expect(canvas.queryByText(/^Stage \d+ of \d+$/)).toBeNull();
  },
};
