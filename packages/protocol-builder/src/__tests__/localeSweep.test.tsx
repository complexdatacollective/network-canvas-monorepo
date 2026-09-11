import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import BoundaryOptionsSection from '../editors/family-pedigree/sections/BoundaryOptionsSection.tsx';
import CensusPromptSection from '../editors/family-pedigree/sections/CensusPromptSection.tsx';
import FramingConfigSection from '../editors/family-pedigree/sections/FramingConfigSection.tsx';
import NominationPromptsSection from '../editors/family-pedigree/sections/NominationPromptsSection.tsx';
import PedigreeEdgeConfigurationSection from '../editors/family-pedigree/sections/PedigreeEdgeConfigurationSection.tsx';
import PedigreeNodeConfigurationSection from '../editors/family-pedigree/sections/PedigreeNodeConfigurationSection.tsx';
import {
  TestItemEditor,
  TestItemPreview,
  TestPromptEditor,
  TestPromptPreview,
} from '../sections/__tests__/rowFixtures.tsx';
import FormFieldsSection from '../sections/form-fields/FormFieldsSection.tsx';
import InterviewerGuidanceSection from '../sections/interviewer-guidance/InterviewerGuidanceSection.tsx';
import IntroductionSection from '../sections/introduction/IntroductionSection.tsx';
import NetworkFilterSection from '../sections/network-filter/NetworkFilterSection.tsx';
import PageContentSection from '../sections/page-content/PageContentSection.tsx';
import PromptsSection from '../sections/PromptsSection.tsx';
import SkipLogicSection from '../sections/skip-logic/SkipLogicSection.tsx';
import StageNameSection from '../sections/stage-heading/StageNameSection.tsx';
import SubjectSection from '../sections/subject-picker/SubjectSection.tsx';
import {
  expectNoLocaleLeaks,
  localeLeaks,
  protocolStrings,
} from '../testing/localeSweep.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../testing/renderStageEditor.tsx';

/**
 * The labels the row-editor stand-ins put on screen.
 *
 * `rowFixtures.tsx` names a family's fields in English on purpose — the tests
 * around it read those names back — and one real area now happens to have
 * chosen the same words for a label of its own. See `SweepAllowances`.
 */
const FIXTURE_ROW_EDITOR_WORDS = [
  'Prompt text',
  'Negative label',
  'Block type',
  'Block text',
] as const;

/**
 * Everything on screen that belongs to the researcher rather than to this
 * package: the WHOLE protocol the harness is mounted over, the stage's own
 * seeded fields, and the codebook the sections read type and attribute names
 * out of.
 *
 * The whole protocol, not this stage and the codebook: a section can show a
 * researcher's words from anywhere in it. A narrative pedigree lists the
 * pedigree stages it may read BY THEIR OWN LABELS, and the fixture protocol
 * names one of them "Family Pedigree" — which is also what
 * `protocolBuilder.interface.familyPedigree` says in English, so a sweep
 * reading only this stage reports a researcher's own stage name as a
 * translation defect.
 *
 * Read out of the documents the harness mounts rather than listed by hand, so
 * a fixture that gains a stage or an attribute cannot quietly widen the
 * sweep's blind spot — or start failing it.
 */
const researcherWords = (harness: StageEditorHarness) =>
  protocolStrings(
    harness.protocolSections(),
    harness.seeded.fields,
    harness.hostCodebook(),
  );

/** The first row's own control, where every row carries the same one. */
const firstButton = (name: string) => {
  const [button] = screen.getAllByRole('button', { name });
  if (button === undefined) throw new Error(`There is no "${name}".`);
  return button;
};

/**
 * What a Spanish researcher actually reads.
 *
 * Every other locale test in this package is POSITIVE: it names a Spanish
 * sentence and finds it. A positive test says nothing about the words beside
 * it, which is how "Cancel" and "Select an attribute…" sat inside otherwise
 * translated dialogs — each was somebody else's file, and nobody's test named
 * it. This asks the opposite question of a whole rendered surface: is there
 * anything here a translator has already answered for that the reader is
 * getting in English anyway?
 *
 * The sweep is blind to a string no descriptor has ever stood behind —
 * `src/__tests__/copyInJsxAttributes.test.ts` is the structural half that
 * catches those, and the two are meant to be read together.
 */
describe('the stage sections under es, at rest', () => {
  it('sweeps a sociogram', async () => {
    const harness = renderStageEditor({
      stageId: 'sociogram-1',
      locale: 'es',
      sections: (
        <>
          <StageNameSection />
          <IntroductionSection />
          <SubjectSection entity="node" />
          <PromptsSection
            PromptEditor={TestPromptEditor}
            PromptPreview={TestPromptPreview}
            requiresSubject={false}
          />
          <InterviewerGuidanceSection />
          <NetworkFilterSection />
          <SkipLogicSection />
        </>
      ),
    });
    await screen.findAllByRole('textbox');

    expectNoLocaleLeaks('sociogram at rest', researcherWords(harness));
  });

  it('sweeps an alter form', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      locale: 'es',
      sections: (
        <>
          <StageNameSection />
          <FormFieldsSection subject="node" hasTitle />
        </>
      ),
    });
    await screen.findAllByRole('textbox');

    expectNoLocaleLeaks('alter form at rest', researcherWords(harness));
  });

  it('sweeps an information page', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      locale: 'es',
      sections: (
        <>
          <StageNameSection />
          <PageContentSection
            ItemEditor={TestItemEditor}
            ItemPreview={TestItemPreview}
          />
        </>
      ),
    });
    await screen.findAllByRole('textbox');

    expectNoLocaleLeaks('information page at rest', researcherWords(harness));
  });
});

describe('the row dialogs under es', () => {
  it('sweeps a prompt list through add, edit and remove', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      locale: 'es',
      sections: (
        <PromptsSection
          PromptEditor={TestPromptEditor}
          PromptPreview={TestPromptPreview}
          requiresSubject={false}
        />
      ),
    });
    await screen.findAllByRole('button');
    expectNoLocaleLeaks('prompt list at rest', researcherWords(harness));

    await harness.user.click(
      await screen.findByRole('button', { name: 'Crear nueva pregunta' }),
    );
    await screen.findByRole('dialog');
    expectNoLocaleLeaks('the add-a-prompt dialog', researcherWords(harness), {
      fixtureWords: FIXTURE_ROW_EDITOR_WORDS,
    });

    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await harness.user.click(
      await screen.findByRole('button', { name: /^Editar pregunta$/ }),
    );
    await screen.findByRole('dialog');
    expectNoLocaleLeaks('the edit-a-prompt dialog', researcherWords(harness), {
      fixtureWords: FIXTURE_ROW_EDITOR_WORDS,
    });

    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await harness.user.click(
      await screen.findByRole('button', { name: /^Eliminar pregunta$/ }),
    );
    await screen.findByRole('dialog');
    expectNoLocaleLeaks(
      'the remove-a-prompt confirmation',
      researcherWords(harness),
      {
        fixtureWords: FIXTURE_ROW_EDITOR_WORDS,
      },
    );
  });

  /**
   * Every state of the form-field row dialog, because they are four different
   * surfaces rather than one: the dialog that adds a field, the same dialog
   * once the picker's last option — the attribute that does not exist yet — is
   * chosen and half a codebook variable is asked for, the dialog that edits a
   * field, and the confirmation that removes one.
   *
   * The three beyond the first were swept by nothing, and each carries copy the
   * others never render: the kind-of-answer list, the name of an attribute
   * being invented and the words on the codebook's own doors are drawn only
   * under the sentinel, and the edit and remove surfaces are titled by
   * `editTitle` and by the shared row confirmation.
   *
   * The dirty state is left until last on purpose: dismissing a dialog the
   * researcher has changed asks them first, so an Escape after the sentinel
   * would sweep a confirmation instead of closing.
   */
  it('sweeps the form-fields dialog through add, invent, edit and remove', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      locale: 'es',
      sections: <FormFieldsSection subject="node" hasTitle />,
    });
    await screen.findAllByRole('button');

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Crear nuevo campo de formulario',
      }),
    );
    await screen.findByRole('dialog');
    await waitFor(() =>
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0),
    );

    expectNoLocaleLeaks(
      'the add-a-form-field dialog',
      researcherWords(harness),
    );

    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await harness.user.click(firstButton('Editar campo'));
    await screen.findByRole('dialog');
    expectNoLocaleLeaks(
      'the edit-a-form-field dialog',
      researcherWords(harness),
    );

    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await harness.user.click(firstButton('Eliminar campo'));
    await screen.findByRole('dialog');
    expectNoLocaleLeaks(
      'the remove-a-form-field confirmation',
      researcherWords(harness),
    );

    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Crear nuevo campo de formulario',
      }),
    );
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Atributo' }),
      '#create-new-attribute',
    );
    await screen.findByRole('combobox', { name: 'Tipo de respuesta' });

    expectNoLocaleLeaks(
      'the form-field dialog inventing an attribute',
      researcherWords(harness),
    );
  });

  it('sweeps the page-content dialog', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      locale: 'es',
      sections: (
        <PageContentSection
          ItemEditor={TestItemEditor}
          ItemPreview={TestItemPreview}
        />
      ),
    });
    await screen.findAllByRole('button');

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Crear nuevo elemento de contenido',
      }),
    );
    await screen.findByRole('dialog');

    expectNoLocaleLeaks(
      'the add-a-content-block dialog',
      researcherWords(harness),
    );
  });
});

/**
 * The interface families this package edits, swept the same way.
 *
 * Each family owns a directory of its own and one `*Messages.ts` in it,
 * and each is swept once because a family is the unit a leak belongs to: the
 * sentences one family writes for itself are declared together, translated
 * together, and are exactly the words no OTHER family's sweep would ever
 * render. Sweeping one of a family's stage editors would leave the other
 * family's message file with nothing looking at it at all.
 *
 * The sections mounted are the family-owned ones from that family's editor,
 * without the shared sections above them — those are swept by the stages at
 * the top of this file, and leaving them out is what makes a failure here name
 * the family that caused it.
 */
describe('the interface families under es, at rest', () => {
  const settled = async (harness: StageEditorHarness) => {
    await waitFor(() => expect(harness.outline().length).toBeGreaterThan(0));
    return harness;
  };

  it('sweeps a family pedigree', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      locale: 'es',
      sections: (
        <>
          <FramingConfigSection />
          <BoundaryOptionsSection />
          <PedigreeNodeConfigurationSection />
          <PedigreeEdgeConfigurationSection />
          <CensusPromptSection />
          <NominationPromptsSection />
        </>
      ),
    });
    await settled(harness);

    expectNoLocaleLeaks('family pedigree at rest', researcherWords(harness));
  });
});

describe('the sweep itself', () => {
  /**
   * A sweep that cannot fail is worse than no sweep: it is a green tick over
   * every surface it walks. These are the three leaks it exists to name, put
   * into the document by hand so the reading is proved rather than assumed.
   */
  it('names English that has a Spanish translation behind it', () => {
    document.body.innerHTML = '<button type="button">Cancel</button>';

    expect(localeLeaks()).toEqual([
      'common.cancel rendered in English: Cancel',
    ]);
  });

  /**
   * The half a whole-message comparison cannot see. A message carrying an ICU
   * argument is never rendered as its pattern, so nothing matched
   * `Content type changed to {kind}. Nothing has been entered for {kind}
   * yet.` — and an announcement rebuilt by hand around that pattern was
   * reported by nothing at all. What survives formatting is the text between
   * the arguments, so that is what is compared.
   */
  it('names a run of English from inside a message that takes an argument', () => {
    document.body.innerHTML =
      '<p>Kind changed to Image. Nothing has been entered for Image yet.</p>';

    expect(localeLeaks()).toEqual([
      'protocolBuilder.contentBlock.kindChangedEmpty rendered in English: . Nothing has been entered for',
    ]);
  });

  it('names an encoded message nobody decoded', () => {
    document.body.innerHTML =
      '<p>@codaco/app-i18n/error/v1:{"id":"protocolBuilder.arrayField.rowReplacedRefusal"}</p>';

    expect(localeLeaks()).toEqual([
      'undecoded message: @codaco/app-i18n/error/v1:{"id":"protocolBuilder.arrayField.rowReplacedRefusal"}',
    ]);
  });

  it('names an ICU argument nothing filled in', () => {
    document.body.innerHTML = '<p>Pregunta sobre {relative} en este orden.</p>';

    expect(localeLeaks()).toEqual([
      'unformatted placeholder: Pregunta sobre {relative} en este orden.',
    ]);
  });

  it('says nothing about a surface that is properly translated', () => {
    document.body.innerHTML =
      '<button type="button">Cancelar</button><p>Escribe las preguntas que hace esta etapa.</p>';

    expect(localeLeaks()).toEqual([]);
  });

  /**
   * Protocol content is not chrome. A researcher's own words are stored in the
   * protocol and rendered verbatim to the participant, so the sweep must not
   * report one that happens to read like a message this package owns.
   *
   * "Sociogram" is exactly that collision, and not a hypothetical one: it is
   * the English of `protocolBuilder.interface.sociogram`, the name this
   * package gives that interface — and it is also what a researcher calls the
   * stage, because the package suggested it. "Enter the text for this
   * block..." is the same collision one layer down: it is the English of
   * `protocolBuilder.contentBlock.textPlaceholder`, the placeholder a text
   * block's own content box shows, and a researcher can leave that block
   * reading exactly that. So both are passed as content, which is how every
   * real sweep gets them: read out of the protocol the harness is mounted
   * over rather than listed here. The other two need no help; the
   * four-letter floor keeps "Age" and "No" out on their own.
   */
  it('says nothing about a researcher’s own English', () => {
    document.body.innerHTML =
      '<p>Enter the text for this block...</p><p>Sociogram</p><p>Age</p><p>No</p>';

    expect(
      localeLeaks(new Set(['Sociogram', 'Enter the text for this block...'])),
    ).toEqual([]);
  });

  /**
   * The other half of the same rule, which is what makes the exclusions above
   * mean something: each is reported when the protocol does NOT hold it,
   * because then a Spanish reader is looking at this package's English rather
   * than at their own writing.
   */
  it('names that same word when it is the package’s own', () => {
    document.body.innerHTML = '<p>Sociogram</p>';

    expect(localeLeaks()).toEqual([
      'protocolBuilder.interface.sociogram rendered in English: Sociogram',
    ]);
  });

  it('names that same sentence when it is the package’s own', () => {
    // A sentence no other id shares, so the report names one id rather than
    // whichever of several carrying the same words the sweep reached first.
    document.body.innerHTML =
      '<p>Use assigned values in skip logic or stage filtering rules.</p>';

    expect(localeLeaks()).toEqual([
      'protocolBuilder.nameGeneratorPrompts.assignmentsHint rendered in English: Use assigned values in skip logic or stage filtering rules.',
    ]);
  });

  /**
   * `SweepAllowances.fixtureWords` is the one thing a call site may forgive by
   * name, and until this case it forgave nothing that could be measured: none
   * of the four words in `FIXTURE_ROW_EDITOR_WORDS` is declared by an id, so
   * deleting the argument from every call site changed nothing. Proved here on
   * a word that IS declared, so the mechanism is shown working rather than
   * assumed to be waiting.
   */
  it('forgives exactly the fixture word it is given, and nothing beside it', () => {
    document.body.innerHTML = '<p>Sociogram</p><p>Cancel</p>';

    // Both are reported while nothing is forgiven.
    expect(localeLeaks()).toEqual([
      'common.cancel rendered in English: Cancel',
      'protocolBuilder.interface.sociogram rendered in English: Sociogram',
    ]);

    // `fixtureWords` is what carries the word into the allowance, and it
    // carries only that one: the assertion still fails, and it fails naming
    // the OTHER leak.
    let reported: unknown;
    try {
      expectNoLocaleLeaks('a fixture', new Set(), {
        fixtureWords: ['Sociogram'],
      });
    } catch (failure) {
      reported =
        failure instanceof Error && 'actual' in failure
          ? failure.actual
          : failure;
    }

    expect(reported).toEqual(['common.cancel rendered in English: Cancel']);
  });
});

/**
 * What the sweep counts as the researcher's own words, which is the same list
 * as what it will forgive anywhere on that surface.
 *
 * Every entry is a message id the sweep can no longer see regress, so the
 * reading has to be narrow — and it was not. Reading every key at every depth
 * excused `promptsSection.itemNoun`, the noun spliced into "Editar pregunta"
 * and the exact string #1720's first round found frozen in English, because a
 * form-field row has a `prompt` key; counting schema tokens stored as values
 * excused two whole messages whose English is one of those tokens.
 */
describe('what the sweep treats as protocol content', () => {
  const alterForm = {
    title: 'Add a person',
    fields: [{ variable: 'name', prompt: 'What is their name?' }],
    items: [{ id: 'block-1', type: 'text', content: 'Read this.' }],
  };
  const codebook = {
    node: {
      person: {
        name: 'Person',
        variables: {
          relationship_to_ego: {
            name: 'Relationship to ego',
            type: 'text',
            component: 'Text',
          },
          alive: { name: 'Alive', type: 'boolean', component: 'Boolean' },
        },
      },
    },
  };

  it('reads the names a researcher gave their types and attributes', () => {
    const content = protocolStrings(alterForm, codebook);

    expect(content.has('Person')).toBe(true);
    expect(content.has('Relationship to ego')).toBe(true);
    // The keys the codebook indexes by are ids the editors show as well.
    expect(content.has('relationship_to_ego')).toBe(true);
    expect(content.has('person')).toBe(true);
    // And the sentences they wrote.
    expect(content.has('What is their name?')).toBe(true);
    expect(content.has('Add a person')).toBe(true);
  });

  it('does not read a row’s own field names as words a researcher chose', () => {
    const content = protocolStrings(alterForm, codebook);

    for (const key of ['prompt', 'fields', 'items', 'content', 'title']) {
      expect(content.has(key), `"${key}" is a schema key`).toBe(false);
    }
  });

  it('does not read a schema token stored as a value as their words either', () => {
    const content = protocolStrings(alterForm, codebook);

    for (const token of ['Text', 'Boolean', 'text', 'boolean', 'block-1']) {
      expect(content.has(token), `"${token}" is a schema token`).toBe(false);
    }
  });
});
