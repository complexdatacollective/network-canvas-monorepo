import type { StageType } from '@codaco/protocol-validation';

const INTERFACE_TEMPLATES: Partial<Record<StageType, Record<string, unknown>>> =
  {
    AlterEdgeForm: {},
    AlterForm: {},
    EgoForm: {},
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

export const getInterfaceTemplate = (
  interfaceType: StageType,
): Record<string, unknown> => INTERFACE_TEMPLATES[interfaceType] ?? {};
