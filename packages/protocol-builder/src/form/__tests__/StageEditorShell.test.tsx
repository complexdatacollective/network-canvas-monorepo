import { fireEvent, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import BuilderSection from '../../sections/BuilderSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import { fixtureMessage } from '../../testing/i18n.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { REQUIRED } from '../requiredField.ts';
import { createStageDraftProbe } from './stageDraftProbe.tsx';

const initialFields: SectionDoc = {
  label: 'Welcome',
  title: 'Welcome to the study',
  items: [],
};

/** A host's own save control, which is how a host reaches the stage form. */
const SUBMIT_LABEL = 'Finished editing';
const hostActions = ({
  formId,
  readOnly,
}: Readonly<{ formId: string; readOnly: boolean }>) => (
  <SubmitButton form={formId} disabled={readOnly}>
    {SUBMIT_LABEL}
  </SubmitButton>
);

const scriptCapability = {
  fields: ['interviewScript'],
  confirmClear: {
    title: fixtureMessage('This will clear your interview script'),
    description: fixtureMessage('The text you entered will be deleted.'),
    confirmLabel: fixtureMessage('Clear script'),
  },
};

const skipLogicCapability = {
  fields: ['skipLogic'],
  confirmClear: {
    title: fixtureMessage('This will clear your skip logic'),
    description: fixtureMessage('The rules you created will be deleted.'),
    confirmLabel: fixtureMessage('Clear skip logic'),
  },
};

const settingsCapability = {
  fields: ['settings.enabled'],
  confirmClear: {
    title: fixtureMessage('This will clear your advanced settings'),
    description: fixtureMessage('The settings you chose will be deleted.'),
    confirmLabel: fixtureMessage('Clear settings'),
  },
};

const threeSections = (pageContentTitle = 'Page content') => (
  <>
    <StageNameSection position={{ index: 1, total: 3 }} />
    <BuilderSection title={pageContentTitle}>
      <Field
        name="title"
        label="Page heading"
        component={InputField}
        required={REQUIRED}
      />
    </BuilderSection>
    <BuilderSection title="Interviewer guidance" capability={scriptCapability}>
      <Field
        name="interviewScript"
        label="Interviewer script text"
        component={InputField}
      />
    </BuilderSection>
  </>
);

function renderEditor(
  options: Readonly<{
    fields?: SectionDoc;
    sections?: ReactNode;
    readOnly?: boolean;
  }> = {},
) {
  return renderStageEditor({
    stage: { type: 'Information', fields: options.fields ?? initialFields },
    sections: options.sections ?? threeSections(),
    actions: hostActions,
    submitLabel: SUBMIT_LABEL,
    ...(options.readOnly === true ? { readOnly: true } : {}),
  });
}

/** A control that shows and replaces one property of the object it is given. */
function CompoundControl({
  value,
  onChange,
  ...rest
}: {
  value?: Record<string, unknown>;
  onChange?: (next: Record<string, unknown>) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <input
      {...rest}
      type="text"
      value={typeof value?.enabled === 'string' ? value.enabled : ''}
      onChange={(event) => onChange?.({ enabled: event.target.value })}
    />
  );
}

/** Mounts and unmounts its children on demand, from a control of its own. */
function Toggleable({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  const [shown, setShown] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setShown((was) => !was)}>
        {label}
      </button>
      {shown && children}
    </>
  );
}

/**
 * The same control, with its state held OUTSIDE the section it hides part of.
 *
 * A capability switched off unmounts the section's children, which resets any
 * state they hold: a toggle living inside would come back believing the hidden
 * part was on screen, and the click meant to bring it back would take it away
 * instead.
 */
function WithHiddenPart({
  label,
  children,
}: Readonly<{
  label: string;
  children: (parts: { shown: boolean; toggle: ReactNode }) => ReactNode;
}>) {
  const [shown, setShown] = useState(true);
  return children({
    shown,
    toggle: (
      <button type="button" onClick={() => setShown((was) => !was)}>
        {label}
      </button>
    ),
  });
}

describe('StageEditorShell', () => {
  it('lists every mounted section in the order they appear on the page', async () => {
    const harness = renderEditor();

    await waitFor(() => expect(harness.outline()).toHaveLength(3));
    expect(harness.outline()).toEqual([
      { title: 'Stage name', state: 'Finished' },
      { title: 'Page content', state: 'Finished' },
      { title: 'Interviewer guidance', state: 'Switched off' },
    ]);
  });

  it('reports a section whose required field is empty as unfinished', async () => {
    const harness = renderEditor({
      fields: { label: '', title: '', items: [] },
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(3));
    expect(harness.outline()).toEqual([
      { title: 'Stage name', state: 'Not finished' },
      { title: 'Page content', state: 'Not finished' },
      { title: 'Interviewer guidance', state: 'Switched off' },
    ]);
  });

  it('moves focus to the section it was asked to jump to', async () => {
    const harness = renderEditor();
    await waitFor(() => expect(harness.outline()).toHaveLength(3));

    await harness.user.click(
      screen.getByRole('button', { name: /^Page content/ }),
    );

    // The section is a region named by its own heading, so arriving there
    // announces which section it is.
    expect(document.activeElement).toHaveAccessibleName('Page content');
  });

  it('hands the whole stage back when it is saved', async () => {
    const harness = renderEditor();

    await harness.user.clear(
      screen.getByRole('textbox', { name: 'Page heading' }),
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Page heading' }),
      'A new heading',
    );

    const written = await harness.submit();

    expect(written?.stageDocument).toEqual({
      id: harness.seeded.id,
      type: 'Information',
      label: 'Welcome',
      title: 'A new heading',
      items: [],
    });
  });

  it('removes a capability the researcher switched off', async () => {
    const harness = renderEditor({
      fields: { ...initialFields, interviewScript: 'Read this aloud' },
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Interviewer guidance' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Clear script' }),
    );

    const written = await harness.submit();

    // Absent, which is how the protocol schema spells "this stage has no
    // interviewer guidance" — not null, and not an empty string.
    expect(written).not.toBeNull();
    expect(Object.hasOwn(written?.stageDocument ?? {}, 'interviewScript')).toBe(
      false,
    );
  });

  it('reports a capability the researcher switched off as switched off', async () => {
    const harness = renderEditor({
      fields: { ...initialFields, interviewScript: 'Read this aloud' },
    });
    await waitFor(() => expect(harness.outline()).toHaveLength(3));
    expect(harness.outline()[2]).toEqual({
      title: 'Interviewer guidance',
      state: 'Finished',
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Interviewer guidance' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Clear script' }),
    );

    // The value the capability owned is gone, so the section is off — not
    // still reading as configured from the document it was opened with.
    await waitFor(() =>
      expect(harness.outline()[2]).toEqual({
        title: 'Interviewer guidance',
        state: 'Switched off',
      }),
    );
  });

  it('reads a null a stored protocol holds as nothing rather than throwing', () => {
    // `null` is not in `FieldValue`'s union, but stored protocol data holds it
    // — fresco-ui's own `fieldValueContract` names it as a shape every control
    // must render — so seeding a control cannot be the one place that throws
    // on it. A throw here is not cosmetic: the render never commits, and the
    // editor goes down over content the researcher did not write.
    renderEditor({ fields: { ...initialFields, title: null } });

    // Nothing is there, which this package spells `undefined` and shows as an
    // empty control — never as the word "null".
    expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
      '',
    );
  });

  it('keeps a section’s fields when only its title changes', async () => {
    function RenameableSection() {
      const [title, setTitle] = useState('Page content');
      return (
        <>
          <button type="button" onClick={() => setTitle('Screen content')}>
            Rename the section
          </button>
          <BuilderSection title={title}>
            <Field
              name="title"
              label="Page heading"
              component={InputField}
              required
            />
          </BuilderSection>
        </>
      );
    }
    const harness = renderEditor({
      fields: { label: 'Welcome', items: [] },
      sections: <RenameableSection />,
    });
    await waitFor(() =>
      expect(harness.outline()).toEqual([
        { title: 'Page content', state: 'Not finished' },
      ]),
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Rename the section' }),
    );

    // Renaming a section says nothing about what is inside it: its required
    // field is still empty, so it is still unfinished.
    await waitFor(() =>
      expect(harness.outline()).toEqual([
        { title: 'Screen content', state: 'Not finished' },
      ]),
    );
  });

  it('keeps a switched-off capability out of the way until it is asked for', async () => {
    const harness = renderEditor();

    await waitFor(() => expect(harness.outline()).toHaveLength(3));
    expect(
      screen.queryByRole('textbox', { name: 'Interviewer script text' }),
    ).toBeNull();
  });

  it('reports exactly one problem for a field that owns it', async () => {
    const harness = renderEditor({
      fields: { label: 'Welcome', items: [] },
    });

    expect(await harness.submit()).toBeNull();

    expect(
      screen.getAllByText('This field is required.', { exact: false }),
    ).toHaveLength(1);
  });

  it('clears a capability’s hidden fields when it is switched off', async () => {
    const harness = renderEditor({
      fields: {
        ...initialFields,
        interviewScript: 'Read this aloud',
        interviewScriptStyle: 'formal',
      },
      sections: (
        <BuilderSection
          title="Interviewer guidance"
          capability={{
            ...scriptCapability,
            fields: ['interviewScript', 'interviewScriptStyle'],
          }}
        >
          <Field
            name="interviewScript"
            label="Interviewer script text"
            component={InputField}
          />
          <Toggleable label="Hide advanced options">
            <Field
              name="interviewScriptStyle"
              label="Script style"
              component={InputField}
            />
          </Toggleable>
        </BuilderSection>
      ),
    });

    // Parked with its value intact, so closing the capability around it never
    // unmounts it again.
    await harness.user.click(
      screen.getByRole('button', { name: 'Hide advanced options' }),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Interviewer guidance' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Clear script' }),
    );
    await waitFor(() =>
      expect(harness.outline()[0]).toEqual({
        title: 'Interviewer guidance',
        state: 'Switched off',
      }),
    );

    const written = await harness.submit();

    expect(written?.stageDocument).toEqual({
      id: harness.seeded.id,
      type: 'Information',
      ...initialFields,
    });
  });

  it('does not call a whitespace-only answer finished', async () => {
    const harness = renderEditor({
      fields: { label: '   ', title: '  ', items: [] },
    });

    // Fresco's required validator trims, so a form that accepted this would
    // reject it on submit. The outline has to say the same thing the submit
    // will.
    await waitFor(() => expect(harness.outline()).toHaveLength(3));
    expect(harness.outline()).toEqual([
      { title: 'Stage name', state: 'Not finished' },
      { title: 'Page content', state: 'Not finished' },
      { title: 'Interviewer guidance', state: 'Switched off' },
    ]);
  });

  it('does not treat merely opening a capability as configuring it', async () => {
    // A capability that owns a CONTAINER path while its controls register the
    // parts inside it — the shape skip logic has.
    const harness = renderEditor({
      sections: (
        <BuilderSection title="Skip logic" capability={skipLogicCapability}>
          <Field
            name="skipLogic.action"
            label="What this stage does"
            component={InputField}
          />
          <Field
            name="skipLogic.destination"
            label="Where the interview continues"
            component={InputField}
          />
        </BuilderSection>
      ),
    });

    // Opening it mounts the controls, which is enough for the form to assemble
    // an object at the capability's own path — but nobody has entered anything.
    await harness.user.click(
      screen.getByRole('switch', { name: 'Skip logic' }),
    );
    await screen.findByRole('textbox', { name: 'What this stage does' });
    await harness.user.click(
      screen.getByRole('switch', { name: 'Skip logic' }),
    );

    // No confirmation, because there is nothing to lose.
    expect(
      screen.queryByRole('button', { name: 'Clear skip logic' }),
    ).toBeNull();
    await waitFor(() =>
      expect(harness.outline()[0]).toEqual({
        title: 'Skip logic',
        state: 'Switched off',
      }),
    );
  });

  it('clears a hidden part of a container capability for good', async () => {
    const harness = renderEditor({
      fields: {
        ...initialFields,
        skipLogic: { action: 'SKIP', destination: 'finish' },
      },
      sections: (
        <WithHiddenPart label="Toggle advanced options">
          {({ shown, toggle }) => (
            <BuilderSection title="Skip logic" capability={skipLogicCapability}>
              <Field
                name="skipLogic.action"
                label="What this stage does"
                component={InputField}
              />
              {toggle}
              {shown && (
                <Field
                  name="skipLogic.destination"
                  label="Where the interview continues"
                  component={InputField}
                />
              )}
            </BuilderSection>
          )}
        </WithHiddenPart>
      ),
    });

    // Parked with its value intact, inside the capability rather than at it —
    // so closing the capability around it never unmounts it, and a tombstone
    // left at the container path does not reach it.
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle advanced options' }),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Skip logic' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Clear skip logic' }),
    );

    await harness.user.click(
      screen.getByRole('switch', { name: 'Skip logic' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle advanced options' }),
    );

    // Bringing the hidden part back must not hand over content the researcher
    // has already confirmed deleting.
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', {
          name: 'Where the interview continues',
        }),
      ).toHaveValue(''),
    );
  });

  it('sees content a capability is holding out of sight', async () => {
    const harness = renderEditor({
      sections: (
        <BuilderSection title="Skip logic" capability={skipLogicCapability}>
          <Toggleable label="Toggle advanced options">
            <Field
              name="skipLogic.destination"
              label="Where the interview continues"
              component={InputField}
            />
          </Toggleable>
        </BuilderSection>
      ),
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Skip logic' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', {
        name: 'Where the interview continues',
      }),
      'finish',
    );
    // Now the only field carrying anything is parked out of sight: there is no
    // field at the capability's own path, and nothing was in the document this
    // stage was opened with.
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle advanced options' }),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Skip logic' }),
    );

    // The researcher is asked before it goes, because there is something to
    // lose — and switching off without asking would also skip the clearing,
    // leaving skip logic active in a stage that says it has none.
    await harness.user.click(
      await screen.findByRole('button', { name: 'Clear skip logic' }),
    );
    await waitFor(() =>
      expect(harness.outline()[0]).toEqual({
        title: 'Skip logic',
        state: 'Switched off',
      }),
    );
  });

  it('follows the page when a nested component reorders its sections', async () => {
    // The order lives in a component of its own, so reordering re-renders that
    // subtree and nothing else — the outline beside it is never told.
    function ReorderableSections() {
      const [reversed, setReversed] = useState(false);
      const sections = ['Introduction', 'Closing'];
      const shown = reversed ? [...sections].toReversed() : sections;
      return (
        <>
          <button type="button" onClick={() => setReversed(true)}>
            Reverse the sections
          </button>
          {shown.map((title) => (
            <BuilderSection key={title} title={title}>
              <Field
                name={title === 'Introduction' ? 'title' : 'label'}
                label={`${title} text`}
                component={InputField}
              />
            </BuilderSection>
          ))}
        </>
      );
    }
    const harness = renderEditor({ sections: <ReorderableSections /> });

    await waitFor(() =>
      expect(harness.outline()).toEqual([
        { title: 'Introduction', state: 'Finished' },
        { title: 'Closing', state: 'Finished' },
      ]),
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Reverse the sections' }),
    );

    await waitFor(() =>
      expect(harness.outline()).toEqual([
        { title: 'Closing', state: 'Finished' },
        { title: 'Introduction', state: 'Finished' },
      ]),
    );
  });

  it('asks again about content entered after a capability was cleared', async () => {
    const harness = renderEditor({
      fields: { ...initialFields, skipLogic: { action: 'SKIP' } },
      sections: (
        <BuilderSection title="Skip logic" capability={skipLogicCapability}>
          <Field
            name="skipLogic.action"
            label="What this stage does"
            component={InputField}
          />
        </BuilderSection>
      ),
    });

    // Clearing it parks a record at the capability's own path, holding
    // nothing.
    await harness.user.click(
      screen.getByRole('switch', { name: 'Skip logic' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Clear skip logic' }),
    );

    // What is typed now lives BENEATH that record, which has no standing to
    // say the capability is empty any more.
    await harness.user.click(
      screen.getByRole('switch', { name: 'Skip logic' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'What this stage does' }),
      'SHOW',
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Skip logic' }),
    );

    // Asked again, because there is something to lose again — and a switch-off
    // that skipped the question would skip the clearing with it.
    expect(
      await screen.findByRole('button', { name: 'Clear skip logic' }),
    ).toBeInTheDocument();
  });

  it('sees a capability filled in by a control that owns its parent', async () => {
    // One compound control owns `settings`; the capability owns a path inside
    // it, and no field is registered there.
    const harness = renderEditor({
      sections: (
        <BuilderSection
          title="Advanced settings"
          capability={settingsCapability}
        >
          <Field<typeof CompoundControl>
            name="settings"
            label="Settings"
            component={CompoundControl}
          />
        </BuilderSection>
      ),
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Advanced settings' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Settings' }),
      'yes',
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Advanced settings' }),
    );

    // The value reaches the capability's path from the control above it, so
    // there is something to lose and the researcher has to be asked.
    expect(
      await screen.findByRole('button', { name: 'Clear settings' }),
    ).toBeInTheDocument();
  });

  it('sees a capability carried by a control that is hidden above it', async () => {
    const harness = renderEditor({
      sections: (
        <WithHiddenPart label="Toggle the control">
          {({ shown, toggle }) => (
            <BuilderSection
              title="Advanced settings"
              capability={settingsCapability}
            >
              {toggle}
              {shown && (
                <Field<typeof CompoundControl>
                  name="settings"
                  label="Settings"
                  component={CompoundControl}
                />
              )}
            </BuilderSection>
          )}
        </WithHiddenPart>
      ),
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Advanced settings' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Settings' }),
      'yes',
    );
    // Parked whole, with the capability's value inside it.
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle the control' }),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Advanced settings' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Clear settings' }),
    ).toBeInTheDocument();

    // And confirming has to reach into that parked control, or the value it is
    // still holding is replayed into the stage on save.
    await harness.user.click(
      screen.getByRole('button', { name: 'Clear settings' }),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Advanced settings' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Toggle the control' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Settings' })).toHaveValue(''),
    );
  });

  it('clears a capability whose path is a name rather than a route', async () => {
    const harness = renderEditor({
      sections: (
        <WithHiddenPart label="Toggle the control">
          {({ shown, toggle }) => (
            <BuilderSection
              title="Prompt override"
              capability={{
                // A protocol-authored key, canonically formatted. It is one
                // name containing a space, not a route through anything.
                fields: ['["prompt text"]'],
                confirmClear: {
                  title: fixtureMessage('This will clear your prompt override'),
                  description: fixtureMessage(
                    'The text you entered will be deleted.',
                  ),
                  confirmLabel: fixtureMessage('Clear override'),
                },
              }}
            >
              {toggle}
              {shown && (
                <Field
                  name="prompt text"
                  nameMode="opaque"
                  label="Prompt text"
                  component={InputField}
                />
              )}
            </BuilderSection>
          )}
        </WithHiddenPart>
      ),
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Prompt override' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Ask about work',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle the control' }),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Prompt override' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Clear override' }),
    );

    await harness.user.click(
      screen.getByRole('switch', { name: 'Prompt override' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Toggle the control' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Prompt text' })).toHaveValue(
        '',
      ),
    );
  });

  it('saves no trace of a capability cleared out of the control above it', async () => {
    const harness = renderEditor({
      sections: (
        <BuilderSection
          title="Advanced settings"
          capability={settingsCapability}
        >
          <Toggleable label="Toggle the control">
            <Field<typeof CompoundControl>
              name="settings"
              label="Settings"
              component={CompoundControl}
            />
          </Toggleable>
        </BuilderSection>
      ),
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Advanced settings' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Settings' }),
      'yes',
    );
    // The capability's path is the only thing this parked control holds.
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle the control' }),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Advanced settings' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Clear settings' }),
    );

    // Emptying the control that carried it has to take the container with it.
    // An empty object left behind is not "no capability" to the schema — and
    // this stage would not be saveable at all with one.
    const written = await harness.submit();
    expect(written?.stageDocument).toEqual({
      id: harness.seeded.id,
      type: 'Information',
      ...initialFields,
    });
  });

  it('leaves an emptied row in the list when a capability inside it is cleared', async () => {
    function RowControl({
      value,
      onChange,
      ...rest
    }: {
      value?: Record<string, unknown>;
      onChange?: (next: Record<string, unknown>) => void;
      id?: string;
      disabled?: boolean;
    }) {
      return (
        <input
          {...rest}
          type="text"
          value={
            typeof value?.optionalSetting === 'string'
              ? value.optionalSetting
              : ''
          }
          onChange={(event) =>
            onChange?.({ optionalSetting: event.target.value })
          }
        />
      );
    }
    const { probe, draft } = createStageDraftProbe();
    const harness = renderEditor({
      sections: (
        <BuilderSection
          title="Row setting"
          capability={{
            fields: ['items[0].optionalSetting'],
            confirmClear: {
              title: fixtureMessage('This will clear the setting'),
              description: fixtureMessage(
                'The value you entered will be deleted.',
              ),
              confirmLabel: fixtureMessage('Clear setting'),
            },
          }}
        >
          {probe}
          <Toggleable label="Toggle the control">
            <Field<typeof RowControl>
              name="items[0]"
              label="First item"
              component={RowControl}
            />
          </Toggleable>
        </BuilderSection>
      ),
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Row setting' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'First item' }),
      'on',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle the control' }),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Row setting' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Clear setting' }),
    );

    // The row survives as an empty row. Removing its index would leave a hole
    // and renumber nothing, which is not what clearing a setting means. Read
    // from the document the editor is holding rather than from a save: an item
    // with no content is not a stage the protocol would take.
    await waitFor(() => expect(draft().items).toEqual([{}]));
  });

  it('empties a control elsewhere on the page when a capability is cleared', async () => {
    // The control carrying the capability's path lives in ANOTHER section, so
    // closing the capability does not unmount it — it stays registered,
    // holding whatever the clear left in it.
    const harness = renderEditor({
      sections: (
        <>
          <BuilderSection title="Details">
            <Field<typeof CompoundControl>
              name="settings"
              label="Settings"
              component={CompoundControl}
            />
          </BuilderSection>
          <BuilderSection
            title="Advanced settings"
            capability={settingsCapability}
          >
            <Field
              name="interviewScript"
              label="Notes"
              component={InputField}
            />
          </BuilderSection>
        </>
      ),
    });

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Settings' }),
      'yes',
    );

    // Open it, then switch it off: the capability's path is carried by the
    // control in the other section, so there is something to lose.
    await harness.user.click(
      screen.getByRole('switch', { name: 'Advanced settings' }),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Advanced settings' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Clear settings' }),
    );

    // The control is still on screen and still registered. Emptying it has to
    // take the container with it, or a blank `settings` reaches the stage.
    expect(screen.getByRole('textbox', { name: 'Settings' })).toHaveValue('');
    const written = await harness.submit();
    expect(written?.stageDocument).toEqual({
      id: harness.seeded.id,
      type: 'Information',
      ...initialFields,
    });
  });

  it('clears a hidden value that was never an answer', async () => {
    const harness = renderEditor({
      // Present, but not an answer: `hasAnswer` reads whitespace as blank, so
      // nothing will offer to confirm its deletion.
      fields: { ...initialFields, interviewScript: '   ' },
      sections: (
        <BuilderSection
          title="Interviewer guidance"
          capability={scriptCapability}
        >
          <Toggleable label="Toggle the control">
            <Field
              name="interviewScript"
              label="Interviewer script text"
              component={InputField}
            />
          </Toggleable>
        </BuilderSection>
      ),
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Interviewer guidance' }),
    );
    // Parked while the section is still open, so closing the section cannot
    // discard it.
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle the control' }),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Interviewer guidance' }),
    );

    // Nothing to confirm, because nothing there was an answer — but switching
    // it off still has to mean off.
    expect(screen.queryByRole('button', { name: 'Clear script' })).toBeNull();

    const written = await harness.submit();
    expect(written?.stageDocument).toEqual({
      id: harness.seeded.id,
      type: 'Information',
      ...initialFields,
    });
  });

  it('does not rebuild its own controls when it saves them', async () => {
    let mounts = 0;
    function MountCounter() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return null;
    }
    const harness = renderEditor({
      sections: (
        <BuilderSection title="Page content">
          <MountCounter />
          <Field
            name="title"
            label="Page heading"
            component={InputField}
            required
          />
        </BuilderSection>
      ),
    });
    await waitFor(() => expect(mounts).toBe(1));

    await harness.user.clear(
      screen.getByRole('textbox', { name: 'Page heading' }),
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Page heading' }),
      'A new heading',
    );
    expect(await harness.submit()).not.toBeNull();

    // Rebuilding the controls for a save would throw away focus and scroll
    // position every time the researcher saved.
    expect(mounts).toBe(1);
  });

  it('explains a prerequisite before it explains a switch', async () => {
    const harness = renderEditor({
      sections: (
        <BuilderSection
          title="Interviewer guidance"
          disabled
          capability={scriptCapability}
        >
          <Field
            name="interviewScript"
            label="Interviewer script text"
            component={InputField}
          />
        </BuilderSection>
      ),
    });

    // The researcher cannot switch this on until the thing it depends on is
    // chosen, so "switched off" would explain the wrong obstacle — and would
    // explain it differently depending only on whether content already exists.
    await waitFor(() =>
      expect(harness.outline()[0]).toEqual({
        title: 'Interviewer guidance',
        state: 'Not available yet',
      }),
    );
  });

  it('refuses to save a stage somebody else is holding', async () => {
    const harness = renderEditor({ readOnly: true });
    const stageSection = sectionId({
      kind: 'stage',
      stageId: harness.seeded.id,
    });
    const before = harness.protocolSections()[stageSection];

    // Awaited, because nothing tells the editor the section is somebody
    // else's until the host answers its acquire.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: SUBMIT_LABEL })).toBeDisabled(),
    );
    expect(
      screen.getByRole('textbox', { name: 'Page heading' }),
    ).toBeDisabled();
    // The stage name sits outside any section's fieldset, so nothing but the
    // field itself can refuse to be edited here.
    expect(screen.getByRole('textbox', { name: 'Stage name' })).toBeDisabled();
    // Read-only is not the same as switched off. A spectator still needs to
    // see how much of the stage is done.
    await waitFor(() =>
      expect(harness.outline()[1]).toEqual({
        title: 'Page content',
        state: 'Finished',
      }),
    );

    // A disabled button is the host's chrome, not the guarantee. Submitting
    // the form directly is what a keyboard, a stale render or another host's
    // own button can still do.
    const form = harness.container.querySelector('form');
    if (form === null) throw new Error('the editor rendered no form');
    fireEvent.submit(form);

    expect(
      await screen.findByText(
        'This stage is read-only, so your change was not made. Somebody else is editing it.',
      ),
    ).toBeInTheDocument();
    expect(harness.protocolSections()[stageSection]).toEqual(before);
  });
});
