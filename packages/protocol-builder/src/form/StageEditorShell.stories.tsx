import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, within } from 'storybook/test';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { interfaceDocumentationUrl } from '../interfaces/documentation.ts';
import { ProtocolBuilder } from '../ProtocolBuilder.tsx';
import { ResourceClientProvider } from '../resources/client.tsx';
import BuilderSection from '../sections/BuilderSection.tsx';
import InterviewerGuidanceSection from '../sections/interviewer-guidance/InterviewerGuidanceSection.tsx';
import StageNameSection from '../sections/stage-heading/StageNameSection.tsx';
import { StageEditSession } from '../stageEdit.tsx';
import { createInMemoryHost } from '../testing/host/createInMemoryHost.ts';
import { SeedProtocolCache } from '../testing/seedProtocolCache.tsx';
import { REQUIRED } from './requiredField.ts';
import StageEditorShell from './StageEditorShell.tsx';

const STAGE_ID = 'welcome-screen';
const STAGE_SECTION = sectionId({ kind: 'stage', stageId: STAGE_ID });

/** The other tab, so a spectator's editor can name who has the stage. */
const COLLABORATOR = {
  sessionId: 'collaborator-tab',
  userId: 'collaborator',
  displayName: 'Robin',
};

const CONFIGURED: SectionDoc = {
  label: 'Welcome',
  title: 'Welcome to the study',
  items: [],
  interviewScript: 'Read the welcome text aloud before continuing.',
};

/**
 * A host with no Redux, no router and no store of its own: it serves the
 * protocol over the package's own contract, renders the editor, and puts its
 * own button in the action slot.
 */
function StageEditorHost({
  readOnly,
  fields,
}: {
  readOnly: boolean;
  fields: SectionDoc;
}) {
  const [host] = useState(() => {
    const built = createInMemoryHost({
      sections: {
        [sectionId({ kind: 'settings' })]: {
          name: 'Protocol builder proof host',
          schemaVersion: 8,
        },
        [sectionId({ kind: 'stageOrder' })]: { stages: [STAGE_ID] },
        [sectionId({ kind: 'assets' })]: {},
        [STAGE_SECTION]: { id: STAGE_ID, type: 'Information', ...fields },
      },
    });
    if (readOnly) built.store.acquire(STAGE_SECTION, COLLABORATOR);
    return built;
  });

  return (
    <DialogProvider>
      <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
        <SeedProtocolCache store={host.store}>
          <ResourceClientProvider>
            <StageEditSession target={{ sectionId: STAGE_SECTION }}>
              <main className="mx-auto max-w-6xl p-6">
                <StageEditorShell
                  actions={({ formId, readOnly: locked }) => (
                    <div className="flex justify-end">
                      <SubmitButton form={formId} disabled={locked}>
                        Finished editing
                      </SubmitButton>
                    </div>
                  )}
                >
                  <StageNameSection
                    position={{ index: 1, total: 4 }}
                    documentationUrl={interfaceDocumentationUrl('information')}
                  />
                  <BuilderSection
                    title="Page content"
                    description="What this screen shows the participant."
                  >
                    <Field
                      name="title"
                      label="Page heading"
                      component={InputField}
                      required={REQUIRED}
                    />
                  </BuilderSection>
                  <InterviewerGuidanceSection />
                </StageEditorShell>
              </main>
            </StageEditSession>
          </ResourceClientProvider>
        </SeedProtocolCache>
      </ProtocolBuilder>
    </DialogProvider>
  );
}

const meta = {
  title: 'Protocol Builder/Stage editor shell',
  component: StageEditorHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The one form every stage editor is built inside. It owns the form store, the register of which sections are mounted and how each one stands, and the submit that hands the whole section back; the host supplies only the action chrome and reads the form id from the slot. It draws one column and no list of the sections: the slot is handed a store of them — each with its title, its state, and anything the protocol refused that no field is already showing — for a host to draw wherever its own page has room.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editing: Story = {
  args: {
    readOnly: false,
    fields: { label: 'Welcome', title: '', items: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // The sections are there to be read…
    await expect(
      canvas.getByRole('textbox', { name: 'Page heading' }),
    ).toBeInTheDocument();
    // …and the editor lists none of them. Where a list of the sections belongs
    // on the page is the host's, so the shell is one column with no navigation
    // of its own; the sections are published on the action slot instead.
    await expect(canvas.queryByRole('navigation')).not.toBeInTheDocument();

    /*
      The rhythm Architect has always had, measured rather than asserted about
      classes — a class list is the source written out twice, and jsdom
      resolves no Tailwind at all, so this only means anything in the browser
      the `storybook` project runs.

      Architect draws the heading unwrapped and then `<div className="pt-14">`
      around the sections (`StageEditor.tsx:753-758`): 3.5rem below the stage
      title, and `Section`'s own `mb-10` — 2.5rem — between sections. The
      package put every section, heading included, flat inside one `<form>`
      with no gap, so the title sat hard against the first card.
    */
    const heading = canvas.getByRole('region', { name: 'Stage name' });
    const first = canvas.getByRole('region', { name: 'Page content' });
    const second = canvas.getByRole('region', { name: 'Interviewer guidance' });

    const titleToFirstSection =
      first.getBoundingClientRect().top -
      heading.getBoundingClientRect().bottom;
    await expect(titleToFirstSection).toBeCloseTo(56, 0);

    // Measured between sections as well, so spacing the title with a `gap-*`
    // on the form — which would push these apart too — fails here.
    const betweenSections =
      second.getBoundingClientRect().top - first.getBoundingClientRect().bottom;
    await expect(betweenSections).toBeCloseTo(40, 0);

    /*
      And the title is deliberately not in a card: it identifies the stage
      rather than configuring part of it. Nothing stands between it and the
      form, and it carries none of the surface a section does — asserted both
      ways round so the marker being renamed shows up as a failure rather than
      as a pass.
    */
    await expect(heading.parentElement).toBe(
      canvasElement.querySelector('form'),
    );
    await expect(heading.classList.contains('publish-colors')).toBe(false);
    await expect(first.classList.contains('publish-colors')).toBe(true);
  },
};

/** A stage that already has its optional interviewer guidance switched on. */
export const AlreadyConfigured: Story = {
  args: { readOnly: false, fields: CONFIGURED },
};

/** Someone else holds the lock: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true, fields: CONFIGURED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // The interviewer script is the one field here with a toolbar, and its
    // buttons used to be the only controls on the page that still looked and
    // read as available while the lock was held elsewhere.
    //
    // Each button's own state is read and compared rather than asserted with
    // `toBeDisabled`, which reports a pass here on a button that is not
    // disabled. Naming the offenders is also the more useful failure: it says
    // which control is still on offer.
    const toolbar = canvas.getByRole('toolbar');
    const buttons = within(toolbar).getAllByRole<HTMLButtonElement>('button');
    await expect(buttons.length).toBeGreaterThan(1);
    // A control is still on offer only when NEITHER mechanism has taken it
    // away, because either one alone makes it unavailable. The `||` this was
    // written with counted a button as available unless it carried BOTH — so
    // it could not pass wrongly, and would have started failing the day the
    // toolbar dropped the `aria-disabled` it puts on a natively disabled
    // button. It also said the opposite of the sentence above it, which is
    // how a check that agrees with its comment only by accident survives.
    const stillAvailable = buttons
      .filter(
        (button) =>
          !button.disabled && button.getAttribute('aria-disabled') !== 'true',
      )
      .map((button) => button.getAttribute('aria-label'));
    await expect(stillAvailable).toEqual([]);

    // Unavailable to edit, not unavailable to read.
    const script = canvas.getByRole('textbox', {
      name: 'Interviewer script text',
    });
    await expect(script.textContent).toBe(
      'Read the welcome text aloud before continuing.',
    );
  },
};
