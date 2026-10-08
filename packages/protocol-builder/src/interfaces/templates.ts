import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import {
  defaultFinishSessionFields,
  type StageType,
} from '@codaco/protocol-validation';

import {
  localizedFromText,
  type ProtocolLocalization,
} from '../localization/localizedText.ts';

/**
 * What a NEW stage of each interface type starts life holding.
 *
 * A template is the authored default configuration a researcher would
 * otherwise have to set by hand on every stage — not a schema default. The
 * schema is deliberately permissive about these keys, so leaving one unset
 * produces a valid stage that behaves differently from the one the interface
 * was designed around (a Narrative with no automatic layout, an
 * OneToManyDyadCensus that keeps considered alters).
 *
 * Only interfaces with such a default appear here. Everything else resolves to
 * `{}`, which is why `getInterfaceDefaults` and `getInterfaceTemplate` answer
 * for every stage type rather than only the ones listed.
 *
 * A TEMPLATE IS NOT A HEAD START ON A SAVEABLE STAGE, and no interface's is.
 * Every one of the twenty needs something the schema requires and only a
 * researcher can supply — the node or edge type it works with, its prompts,
 * the fields of its form, the words of its introduction panel — so the
 * sections of the editor are what fill a stage in, not this. The three form
 * interfaces used to be listed here holding `{}`, which read as a template
 * whose contents had gone missing rather than as an interface with no defaults
 * to give; `__tests__/templates.test.ts` writes down what each interface
 * actually still needs, so that question is answered by a list rather than by
 * an empty object.
 */
/**
 * A template rather than a schema default, because `ConcentricCircles`
 * defaults `skewed` to `true` while the editor's toggle reads off. The ring
 * count, matching the interview and the schema-8 migration, lives here
 * rather than as a field default so the subject reset does not count it as
 * the researcher's work.
 */
const DEFAULT_CIRCLES_BACKGROUND = {
  concentricCircles: 4,
  skewedTowardCenter: false,
};

const INTERFACE_TEMPLATES: Partial<
  Record<StageType, Record<string, FieldValue>>
> = {
  OneToManyDyadCensus: {
    behaviours: {
      removeAfterConsideration: true,
    },
  },
  Sociogram: {
    background: DEFAULT_CIRCLES_BACKGROUND,
  },
  Narrative: {
    behaviours: {
      allowRepositioning: true,
      automaticLayout: true,
    },
    background: DEFAULT_CIRCLES_BACKGROUND,
  },
  NetworkComposer: {
    behaviours: {
      automaticLayout: true,
    },
    background: DEFAULT_CIRCLES_BACKGROUND,
  },
  FamilyPedigree: {
    framing: { mode: 'fixed', value: 'gamete' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
  },
  FinishSession: {
    outcome: 'completed',
  },
  NarrativePedigree: {
    sourceStageId: '',
    diseases: [],
    showAtRiskStatuses: false,
  },
};

const FAMILY_PEDIGREE_INTRO =
  "Building a pedigree means asking about the people you're biologically related to — the people whose egg and sperm you came from — not necessarily the people who raised you. A pedigree maps genetic relationships, so we focus on biological parents. Don't worry — you'll be able to include non-biological parents later.";

/**
 * Template copy a participant reads, written in the protocol's default
 * language: the editor's English, for the researcher to translate. The finish
 * stage's closing text is the exception, supplied already translated.
 */
const localizedTemplateCopy = (
  interfaceType: StageType,
  localization: ProtocolLocalization,
): Record<string, FieldValue> => {
  if (interfaceType === 'FinishSession') {
    // The closing text Network Canvas supplies, in every protocol language it
    // is supplied in, already translated: the same text a new protocol's
    // finish stage starts with.
    const { title, content } = defaultFinishSessionFields(localization.locales);
    return { title, content };
  }
  return interfaceType === 'FamilyPedigree'
    ? {
        introScreen: {
          items: [
            {
              id: 'intro-text',
              type: 'text',
              content: localizedFromText(localization, FAMILY_PEDIGREE_INTRO),
            },
          ],
        },
      }
    : {};
};

/**
 * The authored defaults of `interfaceType` without any of its template copy,
 * or `{}` when it has none: what a change of subject puts back. No interface
 * that offers a subject seeds copy, so putting its defaults back needs no
 * language.
 */
export const getInterfaceDefaults = (
  interfaceType: StageType,
): Record<string, FieldValue> => ({ ...INTERFACE_TEMPLATES[interfaceType] });

/**
 * The configuration a new stage of `interfaceType` starts from, or `{}` when
 * that interface has no authored defaults. Its copy is written in the
 * protocol's default language, so a new stage cannot start until the
 * protocol's languages are known.
 */
export const getInterfaceTemplate = (
  interfaceType: StageType,
  localization: ProtocolLocalization,
): Record<string, FieldValue> => ({
  ...getInterfaceDefaults(interfaceType),
  ...localizedTemplateCopy(interfaceType, localization),
});
