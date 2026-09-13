import { screen, waitFor } from '@testing-library/react';
import { type ComponentType, type ReactNode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import BuilderSection from '../../sections/BuilderSection.tsx';
import type {
  StageEditorActions,
  StageSectionsStore,
} from '../../stage-editor-contract.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { REQUIRED } from '../requiredField.ts';
import { focusStageSection } from '../stageSections.ts';

/**
 * The seam this file is about: what a HOST is handed, read exactly where a
 * host is handed it.
 *
 * The package draws no list of the sections — Architect and Studio own where
 * one belongs on their own pages — so what is left to test here is the store
 * itself: that it says what is true of the form, that its identity holds still
 * however often the editor re-renders, and that it says so again whenever
 * something that could change an answer changes.
 */
const SUBMIT_LABEL = 'Finished editing';

function captureSections() {
  const handed: StageSectionsStore[] = [];
  const actions: StageEditorActions = ({ formId, sections }) => {
    handed.push(sections);
    return <SubmitButton form={formId}>{SUBMIT_LABEL}</SubmitButton>;
  };
  return {
    actions,
    /** Every store the slot was called with, in the order it was called. */
    handed,
    store: (): StageSectionsStore => {
      const store = handed.at(-1);
      if (store === undefined) {
        throw new Error(
          'the action slot was never called, so no sections store was published',
        );
      }
      return store;
    },
  };
}

const initialFields: SectionDoc = {
  label: 'Welcome',
  title: 'Welcome to the study',
  items: [],
};

/**
 * A control that decides for ITSELF that it is invalid, the way one resolving
 * its value against the rest of the protocol does — without the form being
 * told anything.
 */
const JudgesItselfInvalid = (() => {
  const [invalid, setInvalid] = useState(false);
  return (
    <button
      type="button"
      aria-invalid={invalid ? true : undefined}
      onClick={() => setInvalid(true)}
    >
      Refuse my own value
    </button>
  );
}) as ComponentType<Record<string, unknown>>;

/** Mounts a whole section on demand, from a control outside it. */
function Revealable({ children }: Readonly<{ children: ReactNode }>) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setShown(true)}>
        Reveal the second section
      </button>
      {shown && children}
    </>
  );
}

const twoSections = (
  <>
    <BuilderSection title="Page content">
      <Field
        name="title"
        label="Page heading"
        component={InputField}
        required={REQUIRED}
      />
    </BuilderSection>
    <BuilderSection title="Interviewer guidance">
      <Field name="interviewScript" label="Script" component={InputField} />
    </BuilderSection>
  </>
);

function renderEditor(sections: ReactNode, fields: SectionDoc = initialFields) {
  const probe = captureSections();
  const harness = renderStageEditor({
    stage: { type: 'Information', fields },
    sections,
    actions: probe.actions,
    submitLabel: SUBMIT_LABEL,
  });
  return { harness, probe };
}

const titlesOf = (store: StageSectionsStore): string[] =>
  store.getSnapshot().map((section) => section.title);

describe('the sections a stage editor publishes to its host', () => {
  it('hands the host the same store however often the editor re-renders', async () => {
    const { harness, probe } = renderEditor(twoSections);
    await waitFor(() => expect(probe.store().getSnapshot()).toHaveLength(2));

    // A save re-renders the whole form body several times over — the document
    // it is rebased onto, and `isSubmitting` either side of it — so the slot is
    // called again and again.
    expect(await harness.submit()).not.toBeNull();

    expect(probe.handed.length).toBeGreaterThan(1);
    const [first] = probe.handed;
    for (const store of probe.handed) expect(store).toBe(first);
  });

  it('tells a subscriber when a control judges itself invalid', async () => {
    const { harness, probe } = renderEditor(
      <BuilderSection title="Page content">
        <Field
          name="title"
          label="Page heading"
          component={JudgesItselfInvalid}
        />
      </BuilderSection>,
    );
    await waitFor(() => expect(probe.store().getSnapshot()).toHaveLength(1));
    expect(probe.store().getSnapshot()[0]?.status).toBe('complete');

    const notified = vi.fn();
    const unsubscribe = probe.store().subscribe(notified);

    await harness.user.click(
      screen.getByRole('button', { name: 'Refuse my own value' }),
    );

    // The form was told nothing: the flip is read off the page, so the store
    // hears about it through the editor's own observer rather than through any
    // value changing.
    await waitFor(() => expect(notified).toHaveBeenCalled());
    expect(probe.store().getSnapshot()[0]?.status).toBe('error');
    unsubscribe();
  });

  it('tells a subscriber when a section arrives on the page', async () => {
    const { harness, probe } = renderEditor(
      <>
        <BuilderSection title="Page content">
          <Field name="title" label="Page heading" component={InputField} />
        </BuilderSection>
        <Revealable>
          <BuilderSection title="Interviewer guidance">
            <Field
              name="interviewScript"
              label="Script"
              component={InputField}
            />
          </BuilderSection>
        </Revealable>
      </>,
    );
    await waitFor(() =>
      expect(titlesOf(probe.store())).toEqual(['Page content']),
    );

    const notified = vi.fn();
    const unsubscribe = probe.store().subscribe(notified);

    await harness.user.click(
      screen.getByRole('button', { name: 'Reveal the second section' }),
    );

    await waitFor(() => expect(notified).toHaveBeenCalled());
    await waitFor(() =>
      expect(titlesOf(probe.store())).toEqual([
        'Page content',
        'Interviewer guidance',
      ]),
    );
    unsubscribe();
  });

  it('tells a subscriber when the form’s own errors change', async () => {
    const { harness, probe } = renderEditor(twoSections, {
      label: 'Welcome',
      title: '',
      items: [],
    });
    await waitFor(() => expect(probe.store().getSnapshot()).toHaveLength(2));
    expect(probe.store().getSnapshot()[0]?.status).toBe('incomplete');

    const notified = vi.fn();
    const unsubscribe = probe.store().subscribe(notified);

    // A refused save is what puts a required field's own message on screen.
    expect(await harness.submit()).toBeNull();

    expect(notified).toHaveBeenCalled();
    expect(probe.store().getSnapshot()[0]?.status).toBe('error');
    unsubscribe();
  });
});

describe('moving to a section the host’s list was asked for', () => {
  it('takes focus to it and brings it into view', async () => {
    const { probe } = renderEditor(twoSections);
    await waitFor(() => expect(probe.store().getSnapshot()).toHaveLength(2));
    const guidance = probe.store().getSnapshot()[1];
    if (guidance === undefined) throw new Error('there is no second section.');

    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    focusStageSection(guidance.id);

    // The section is a region named by its own heading, so arriving there
    // announces which section it is.
    expect(document.activeElement).toHaveAccessibleName('Interviewer guidance');
    expect(scrolled).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    scrolled.mockRestore();
  });

  it('arrives without a journey for a reader who asked for less motion', async () => {
    const { probe } = renderEditor(twoSections);
    await waitFor(() => expect(probe.store().getSnapshot()).toHaveLength(2));
    const guidance = probe.store().getSnapshot()[1];
    if (guidance === undefined) throw new Error('there is no second section.');

    // Stubbed rather than spied on: jsdom implements no `matchMedia` at all,
    // which is why asking is guarded — and why this is the only way to be a
    // reader who has asked for less motion.
    const asked = vi.fn(
      (query: string) =>
        ({ matches: query.includes('reduce') }) as MediaQueryList,
    );
    vi.stubGlobal('matchMedia', asked);
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');

    focusStageSection(guidance.id);

    expect(document.activeElement).toHaveAccessibleName('Interviewer guidance');
    expect(asked).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(scrolled).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    scrolled.mockRestore();
    vi.unstubAllGlobals();
  });

  it('does nothing for a section that is no longer on the page', () => {
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    expect(() => focusStageSection('a-section-that-has-gone')).not.toThrow();
    expect(scrolled).not.toHaveBeenCalled();
    scrolled.mockRestore();
  });
});
