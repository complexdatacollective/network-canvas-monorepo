import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import type { StageType } from '@codaco/protocol-validation';

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
 * `{}`, which is why `getInterfaceTemplate` answers for every stage type
 * rather than only the ones listed.
 *
 * A TEMPLATE IS NOT A HEAD START ON A SAVEABLE STAGE, and no interface's is.
 * Every one of the nineteen needs something the schema requires and only a
 * researcher can supply — the node or edge type it works with, its prompts,
 * the fields of its form, the words of its introduction panel — so the
 * sections of the editor are what fill a stage in, not this. The three form
 * interfaces used to be listed here holding `{}`, which read as a template
 * whose contents had gone missing rather than as an interface with no defaults
 * to give; `__tests__/templates.test.ts` writes down what each interface
 * actually still needs, so that question is answered by a list rather than by
 * an empty object.
 */
const INTERFACE_TEMPLATES: Partial<
  Record<StageType, Record<string, FieldValue>>
> = {
  OneToManyDyadCensus: {
    behaviours: {
      removeAfterConsideration: true,
    },
  },
  Narrative: {
    behaviours: {
      allowRepositioning: true,
      automaticLayout: true,
    },
  },
  NetworkComposer: {
    behaviours: {
      automaticLayout: true,
    },
  },
  FamilyPedigree: {
    framing: { mode: 'fixed', value: 'gamete' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    introScreen: {
      items: [
        {
          id: 'intro-text',
          type: 'text',
          content:
            "Building a pedigree means asking about the people you're biologically related to — the people whose egg and sperm you came from — not necessarily the people who raised you. A pedigree maps genetic relationships, so we focus on biological parents. Don't worry — you'll be able to include non-biological parents later.",
        },
      ],
    },
  },
  NarrativePedigree: {
    sourceStageId: '',
    diseases: [],
    showAtRiskStatuses: false,
  },
};

/**
 * The configuration a new stage of `interfaceType` starts from, or `{}` when
 * that interface has no authored defaults.
 */
export const getInterfaceTemplate = (
  interfaceType: StageType,
): Record<string, FieldValue> => INTERFACE_TEMPLATES[interfaceType] ?? {};
