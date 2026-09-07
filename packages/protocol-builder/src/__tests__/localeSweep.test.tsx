import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  TestItemEditor,
  TestItemPreview,
  TestPromptEditor,
  TestPromptPreview,
} from '../sections/__tests__/rowFixtures.tsx';
import FormFieldsSection from '../sections/FormFieldsSection.tsx';
import InterviewerGuidanceSection from '../sections/InterviewerGuidanceSection.tsx';
import IntroductionSection from '../sections/IntroductionSection.tsx';
import NetworkFilterSection from '../sections/NetworkFilterSection.tsx';
import PageContentSection from '../sections/PageContentSection.tsx';
import PromptsSection from '../sections/PromptsSection.tsx';
import SkipLogicSection from '../sections/SkipLogicSection.tsx';
import StageNameSection from '../sections/StageNameSection.tsx';
import SubjectSection from '../sections/SubjectSection.tsx';
import { expectNoLocaleLeaks, localeLeaks } from '../testing/localeSweep.ts';
import { renderStageEditor } from '../testing/renderStageEditor.tsx';

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
          <NetworkFilterSection subject="node" />
          <SkipLogicSection />
        </>
      ),
    });
    await screen.findAllByRole('textbox');

    expectNoLocaleLeaks('sociogram at rest', harness);
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

    expectNoLocaleLeaks('alter form at rest', harness);
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

    expectNoLocaleLeaks('information page at rest', harness);
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
    expectNoLocaleLeaks('prompt list at rest', harness);

    await harness.user.click(
      await screen.findByRole('button', { name: 'Crear nueva pregunta' }),
    );
    await screen.findByRole('dialog');
    expectNoLocaleLeaks('the add-a-prompt dialog', harness);

    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await harness.user.click(
      await screen.findByRole('button', { name: /^Editar pregunta$/ }),
    );
    await screen.findByRole('dialog');
    expectNoLocaleLeaks('the edit-a-prompt dialog', harness);

    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await harness.user.click(
      await screen.findByRole('button', { name: /^Eliminar pregunta$/ }),
    );
    await screen.findByRole('dialog');
    expectNoLocaleLeaks('the remove-a-prompt confirmation', harness);
  });

  it('sweeps the form-fields dialog, where the attribute picker lives', async () => {
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

    expectNoLocaleLeaks('the add-a-form-field dialog', harness);
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
        name: 'Crear nuevo bloque de contenido',
      }),
    );
    await screen.findByRole('dialog');

    expectNoLocaleLeaks('the add-a-content-block dialog', harness);
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
   * "Who are the people you know?" is exactly that collision, and no longer a
   * hypothetical one: it is the English of
   * `protocolBuilder.nameGeneratorPrompts.textPlaceholder`, the placeholder
   * the name generator's own prompt field shows — a sentence this package
   * suggests BECAUSE it is the sentence a researcher writes. So it is passed
   * as content, which is how every real sweep gets it: read out of the stage
   * the harness is mounted over rather than listed here. The short ones need
   * no help; the four-letter floor keeps "Age" and "No" out on their own.
   */
  it('says nothing about a researcher’s own English', () => {
    document.body.innerHTML =
      '<p>Who are the people you know?</p><p>Age</p><p>No</p>';

    expect(localeLeaks(new Set(['Who are the people you know?']))).toEqual([]);
  });

  /**
   * The other half of the same rule, which is what makes the exclusion above
   * mean something: the sentence is reported when the protocol does NOT hold
   * it, because then a Spanish reader is looking at this package's English
   * placeholder rather than at their own writing.
   */
  it('names that same sentence when it is the package’s own', () => {
    document.body.innerHTML = '<p>Who are the people you know?</p>';

    expect(localeLeaks()).toEqual([
      'protocolBuilder.nameGeneratorPrompts.textPlaceholder rendered in English: Who are the people you know?',
    ]);
  });
});
