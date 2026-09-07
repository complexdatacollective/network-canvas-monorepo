import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  TestItemEditor,
  TestItemPreview,
  TestPromptEditor,
  TestPromptPreview,
} from '../sections/__tests__/rowFixtures.tsx';
import AnonymisationExplanationSection from '../sections/anonymisation/AnonymisationExplanationSection.tsx';
import AnonymisationValidationSection from '../sections/anonymisation/AnonymisationValidationSection.tsx';
import EncryptedVariablesSection from '../sections/anonymisation/EncryptedVariablesSection.tsx';
import FormFieldsSection from '../sections/FormFieldsSection.tsx';
import GeospatialPromptsSection from '../sections/geospatial/GeospatialPromptsSection.tsx';
import MapAppearanceSection from '../sections/geospatial/MapAppearanceSection.tsx';
import MapSourceSection from '../sections/geospatial/MapSourceSection.tsx';
import InterviewerGuidanceSection from '../sections/InterviewerGuidanceSection.tsx';
import IntroductionSection from '../sections/IntroductionSection.tsx';
import AtRiskStatusesSection from '../sections/narrativePedigree/AtRiskStatusesSection.tsx';
import DiseasesSection from '../sections/narrativePedigree/DiseasesSection.tsx';
import SourceStageSection from '../sections/narrativePedigree/SourceStageSection.tsx';
import AutomaticLayoutSection from '../sections/network/AutomaticLayoutSection.tsx';
import BackgroundSection from '../sections/network/BackgroundSection.tsx';
import NarrativeBehavioursSection from '../sections/network/NarrativeBehavioursSection.tsx';
import { networkCanvasMessages } from '../sections/network/networkCanvasMessages.ts';
import SociogramPromptsSection from '../sections/network/SociogramPromptsSection.tsx';
import NetworkFilterSection from '../sections/NetworkFilterSection.tsx';
import PageContentSection from '../sections/PageContentSection.tsx';
import BoundaryOptionsSection from '../sections/pedigree/BoundaryOptionsSection.tsx';
import CensusPromptSection from '../sections/pedigree/CensusPromptSection.tsx';
import FramingConfigSection from '../sections/pedigree/FramingConfigSection.tsx';
import NominationPromptsSection from '../sections/pedigree/NominationPromptsSection.tsx';
import PedigreeEdgeConfigurationSection from '../sections/pedigree/PedigreeEdgeConfigurationSection.tsx';
import PedigreeNodeConfigurationSection from '../sections/pedigree/PedigreeNodeConfigurationSection.tsx';
import PromptsSection from '../sections/PromptsSection.tsx';
import SkipLogicSection from '../sections/SkipLogicSection.tsx';
import StageNameSection from '../sections/StageNameSection.tsx';
import SubjectSection from '../sections/SubjectSection.tsx';
import { expectNoLocaleLeaks, localeLeaks } from '../testing/localeSweep.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../testing/renderStageEditor.tsx';

/**
 * The labels the row-editor stand-ins put on screen.
 *
 * `rowFixtures.tsx` names a family's fields in English on purpose — the tests
 * around it read those names back — and three real areas happen to have
 * chosen the same words for their own labels. See `SweepAllowances`.
 */
const FIXTURE_ROW_EDITOR_WORDS = [
  'Prompt text',
  'Negative label',
  'Block type',
  'Block text',
] as const;

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
    expectNoLocaleLeaks('the add-a-prompt dialog', harness, {
      fixtureWords: FIXTURE_ROW_EDITOR_WORDS,
    });

    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await harness.user.click(
      await screen.findByRole('button', { name: /^Editar pregunta$/ }),
    );
    await screen.findByRole('dialog');
    expectNoLocaleLeaks('the edit-a-prompt dialog', harness, {
      fixtureWords: FIXTURE_ROW_EDITOR_WORDS,
    });

    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await harness.user.click(
      await screen.findByRole('button', { name: /^Eliminar pregunta$/ }),
    );
    await screen.findByRole('dialog');
    expectNoLocaleLeaks('the remove-a-prompt confirmation', harness, {
      fixtureWords: FIXTURE_ROW_EDITOR_WORDS,
    });
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

/**
 * The five interface families, swept the same way.
 *
 * Each family owns a `sections/<family>/` directory and one `*Messages.ts`,
 * and each is swept once because a family is the unit a leak belongs to: the
 * sentences one family writes for itself are declared together, translated
 * together, and are exactly the words no OTHER family's sweep would ever
 * render. Sweeping three of the seven stage editors would leave two of the
 * five message files with nothing looking at them at all.
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

  it('sweeps a sociogram’s canvas sections', async () => {
    const harness = renderStageEditor({
      stageId: 'sociogram-1',
      locale: 'es',
      sections: (
        <>
          <SociogramPromptsSection />
          <BackgroundSection allowsImage />
          <AutomaticLayoutSection />
          <NarrativeBehavioursSection
            description={
              networkCanvasMessages.sociogramCanvasInteractionDescription
            }
            repositioningHint={networkCanvasMessages.sociogramRepositioningHint}
          />
        </>
      ),
    });
    await settled(harness);

    expectNoLocaleLeaks('sociogram canvas sections at rest', harness);
  });

  it('sweeps a geospatial stage', async () => {
    const harness = renderStageEditor({
      stageId: 'geospatial-1',
      locale: 'es',
      sections: (
        <>
          <MapSourceSection />
          <GeospatialPromptsSection />
          <MapAppearanceSection />
        </>
      ),
    });
    await settled(harness);

    expectNoLocaleLeaks('geospatial stage at rest', harness, {
      // `resources/components/resourceKinds.ts` still names each resource kind
      // in English (`geojson: 'Map layer'`), and the chosen layer's summary
      // shows that name as a badge. It is the one area `NOT_CONVERTED_YET`
      // still excuses, and it goes when i18n-1 lands — at which point this
      // entry stops matching and has to be deleted.
      stillEnglish: [
        'protocolBuilder.geospatial.layerTitle rendered in English: Map layer',
      ],
    });
  });

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

    expectNoLocaleLeaks('family pedigree at rest', harness);
  });

  it('sweeps a narrative pedigree', async () => {
    const harness = renderStageEditor({
      stageId: 'narrative-pedigree-1',
      locale: 'es',
      sections: (
        <>
          <SourceStageSection />
          <DiseasesSection />
          <AtRiskStatusesSection />
        </>
      ),
    });
    await settled(harness);

    expectNoLocaleLeaks('narrative pedigree at rest', harness);
  });

  it('sweeps an anonymisation stage', async () => {
    const harness = renderStageEditor({
      stageId: 'anonymisation-1',
      locale: 'es',
      sections: (
        <>
          <AnonymisationExplanationSection />
          <AnonymisationValidationSection />
          <EncryptedVariablesSection />
        </>
      ),
    });
    await settled(harness);

    expectNoLocaleLeaks('anonymisation stage at rest', harness);
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
   * "Sociogram" is exactly that collision, and not a hypothetical one: it is
   * the English of `protocolBuilder.interface.sociogram`, the name this
   * package gives that interface — and it is also what a researcher calls the
   * stage, because the package suggested it. "Who are the people you know?" is
   * the same collision one layer down: it is the English of
   * `protocolBuilder.nameGeneratorPrompts.textPlaceholder`, the placeholder
   * the name generator's own prompt field shows, and it is a sentence this
   * package suggests BECAUSE it is the sentence a researcher writes. So both
   * are passed as content, which is how every real sweep gets them: read out
   * of the protocol the harness is mounted over rather than listed here. The
   * other two need no help; the four-letter floor keeps "Age" and "No" out on
   * their own.
   */
  it('says nothing about a researcher’s own English', () => {
    document.body.innerHTML =
      '<p>Who are the people you know?</p><p>Sociogram</p><p>Age</p><p>No</p>';

    expect(
      localeLeaks(new Set(['Sociogram', 'Who are the people you know?'])),
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
    document.body.innerHTML = '<p>Who are the people you know?</p>';

    expect(localeLeaks()).toEqual([
      'protocolBuilder.nameGeneratorPrompts.textPlaceholder rendered in English: Who are the people you know?',
    ]);
  });
});
