import type { SuppliedStageSetting } from '../supplied-stage-setting.ts';

const pedigreeCompleteness = (
  path: readonly string[],
  wording: string,
): SuppliedStageSetting => ({
  path: ['completeness', ...path],
  wording,
  within: ['completeness'],
});

/**
 * Whether the participant chooses the words used for family members, which
 * asks the framing question and shows its control.
 */
export const choosesFraming = (
  stage: Readonly<{ framing?: unknown }>,
): boolean => stage.framing === 'participantPreference';

/**
 * Whether the stage tracks how complete the family is, which shows its
 * checklist of what is still needed.
 */
export const tracksCompleteness = (
  stage: Readonly<{ completeness?: unknown }>,
): boolean => stage.completeness !== undefined;

/**
 * Whether the stage asks about gender identity, which it does when
 * `nodeConfiguration.genderIdentity` is set.
 */
const asksGenderIdentity = (
  stage: Readonly<{ nodeConfiguration?: unknown }>,
): boolean => {
  const { nodeConfiguration } = stage;
  return (
    typeof nodeConfiguration === 'object' &&
    nodeConfiguration !== null &&
    'genderIdentity' in nodeConfiguration &&
    nodeConfiguration.genderIdentity !== undefined
  );
};

/** The Family Pedigree's settings Network Canvas words. */
export const FAMILY_PEDIGREE_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  {
    path: ['nodeConfiguration', 'nameField', 'prompt'],
    wording:
      'interview.stageWording.familyPedigree.nodeConfiguration.nameField.prompt',
  },
  {
    path: ['nodeConfiguration', 'nameField', 'hint'],
    wording:
      'interview.stageWording.familyPedigree.nodeConfiguration.nameField.hint',
  },
  pedigreeCompleteness(
    ['itemText', 'parents', 'listItem'],
    'interview.stageWording.familyPedigree.completeness.itemText.parents.listItem',
  ),
  pedigreeCompleteness(
    ['itemText', 'siblings', 'listItem'],
    'interview.stageWording.familyPedigree.completeness.itemText.siblings.listItem',
  ),
  pedigreeCompleteness(
    ['itemText', 'siblings', 'noneButton'],
    'interview.stageWording.familyPedigree.completeness.itemText.siblings.noneButton',
  ),
  pedigreeCompleteness(
    ['itemText', 'siblings', 'question'],
    'interview.stageWording.familyPedigree.completeness.itemText.siblings.question',
  ),
  pedigreeCompleteness(
    ['itemText', 'children', 'listItem'],
    'interview.stageWording.familyPedigree.completeness.itemText.children.listItem',
  ),
  pedigreeCompleteness(
    ['itemText', 'children', 'noneButton'],
    'interview.stageWording.familyPedigree.completeness.itemText.children.noneButton',
  ),
  pedigreeCompleteness(
    ['itemText', 'children', 'question'],
    'interview.stageWording.familyPedigree.completeness.itemText.children.question',
  ),
  pedigreeCompleteness(
    ['itemText', 'details', 'listItem'],
    'interview.stageWording.familyPedigree.completeness.itemText.details.listItem',
  ),
  pedigreeCompleteness(
    ['recommendedNote'],
    'interview.stageWording.familyPedigree.completeness.recommendedNote',
  ),
  {
    path: ['wording', 'alsoParentOfLabel'],
    wording: 'interview.stageWording.familyPedigree.wording.alsoParentOfLabel',
  },
  {
    path: ['wording', 'biologicalParentBoth'],
    wording:
      'interview.stageWording.familyPedigree.wording.biologicalParentBoth',
  },
  {
    path: ['wording', 'biologicalParentHint'],
    wording:
      'interview.stageWording.familyPedigree.wording.biologicalParentHint',
  },
  {
    path: ['wording', 'biologicalParentLabel'],
    wording:
      'interview.stageWording.familyPedigree.wording.biologicalParentLabel',
  },
  {
    path: ['wording', 'carriedSiblingsPregnancyLabel'],
    wording:
      'interview.stageWording.familyPedigree.wording.carriedSiblingsPregnancyLabel',
  },
  {
    path: ['wording', 'carrierLabel'],
    wording: 'interview.stageWording.familyPedigree.wording.carrierLabel',
  },
  {
    path: ['wording', 'carrierUnknown'],
    wording: 'interview.stageWording.familyPedigree.wording.carrierUnknown',
  },
  {
    path: ['wording', 'changeWouldCutOff'],
    wording: 'interview.stageWording.familyPedigree.wording.changeWouldCutOff',
  },
  {
    path: ['wording', 'childKindAdoptive'],
    wording: 'interview.stageWording.familyPedigree.wording.childKindAdoptive',
  },
  {
    path: ['wording', 'childKindBiological'],
    wording:
      'interview.stageWording.familyPedigree.wording.childKindBiological',
  },
  {
    path: ['wording', 'childKindDonor'],
    wording: 'interview.stageWording.familyPedigree.wording.childKindDonor',
  },
  {
    path: ['wording', 'childKindLabel'],
    wording: 'interview.stageWording.familyPedigree.wording.childKindLabel',
  },
  {
    path: ['wording', 'childKindSocial'],
    wording: 'interview.stageWording.familyPedigree.wording.childKindSocial',
  },
  {
    path: ['wording', 'childKindSurrogate'],
    wording: 'interview.stageWording.familyPedigree.wording.childKindSurrogate',
  },
  {
    path: ['wording', 'connectParent'],
    wording: 'interview.stageWording.familyPedigree.wording.connectParent',
  },
  {
    path: ['wording', 'connectPartners'],
    wording: 'interview.stageWording.familyPedigree.wording.connectPartners',
  },
  {
    path: ['wording', 'connectQuestion'],
    wording: 'interview.stageWording.familyPedigree.wording.connectQuestion',
  },
  {
    path: ['wording', 'disconnectConfirmDescription'],
    wording:
      'interview.stageWording.familyPedigree.wording.disconnectConfirmDescription',
  },
  {
    path: ['wording', 'disconnectConfirmTitle'],
    wording:
      'interview.stageWording.familyPedigree.wording.disconnectConfirmTitle',
  },
  {
    path: ['wording', 'disconnectWouldCutOff'],
    wording:
      'interview.stageWording.familyPedigree.wording.disconnectWouldCutOff',
  },
  {
    path: ['wording', 'disconnectStandIn'],
    wording: 'interview.stageWording.familyPedigree.wording.disconnectStandIn',
  },
  {
    path: ['wording', 'genderIdentityLabel'],
    wording:
      'interview.stageWording.familyPedigree.wording.genderIdentityLabel',
    when: asksGenderIdentity,
  },
  {
    path: ['wording', 'generatedLabelOf'],
    wording: 'interview.stageWording.familyPedigree.wording.generatedLabelOf',
  },
  {
    path: ['wording', 'otherParentBiologicalLabel'],
    wording:
      'interview.stageWording.familyPedigree.wording.otherParentBiologicalLabel',
  },
  {
    path: ['wording', 'otherParentLabel'],
    wording: 'interview.stageWording.familyPedigree.wording.otherParentLabel',
  },
  {
    path: ['wording', 'otherParentNone'],
    wording: 'interview.stageWording.familyPedigree.wording.otherParentNone',
  },
  {
    path: ['wording', 'otherParentUnknown'],
    wording: 'interview.stageWording.familyPedigree.wording.otherParentUnknown',
  },
  {
    path: ['wording', 'panelTitle'],
    wording: 'interview.stageWording.familyPedigree.wording.panelTitle',
  },
  {
    path: ['wording', 'parentCarriedLabel'],
    wording: 'interview.stageWording.familyPedigree.wording.parentCarriedLabel',
  },
  {
    path: ['wording', 'parentKindCarrier'],
    wording: 'interview.stageWording.familyPedigree.wording.parentKindCarrier',
  },
  {
    path: ['wording', 'parentKindLabel'],
    wording: 'interview.stageWording.familyPedigree.wording.parentKindLabel',
  },
  {
    path: ['wording', 'parentLinkKindLabel'],
    wording:
      'interview.stageWording.familyPedigree.wording.parentLinkKindLabel',
  },
  {
    path: ['wording', 'parentPartnerLabel'],
    wording: 'interview.stageWording.familyPedigree.wording.parentPartnerLabel',
  },
  {
    path: ['wording', 'placeholderParentsNote'],
    wording:
      'interview.stageWording.familyPedigree.wording.placeholderParentsNote',
  },
  {
    path: ['wording', 'relativeTerm'],
    wording: 'interview.stageWording.familyPedigree.wording.relativeTerm',
  },
  {
    path: ['wording', 'removeConfirmDescription'],
    wording:
      'interview.stageWording.familyPedigree.wording.removeConfirmDescription',
  },
  {
    path: ['wording', 'removeConfirmTitle'],
    wording: 'interview.stageWording.familyPedigree.wording.removeConfirmTitle',
  },
  {
    path: ['wording', 'sexAssignedAtBirthLabel'],
    wording:
      'interview.stageWording.familyPedigree.wording.sexAssignedAtBirthLabel',
  },
  {
    path: ['wording', 'sexChangeClearsCoParentSex'],
    wording:
      'interview.stageWording.familyPedigree.wording.sexChangeClearsCoParentSex',
  },
  {
    path: ['wording', 'sexChangeEndsCarrying'],
    wording:
      'interview.stageWording.familyPedigree.wording.sexChangeEndsCarrying',
  },
  {
    path: ['wording', 'sharedDonorsLabel'],
    wording: 'interview.stageWording.familyPedigree.wording.sharedDonorsLabel',
  },
  {
    path: ['wording', 'sharedParentCountBoth'],
    wording:
      'interview.stageWording.familyPedigree.wording.sharedParentCountBoth',
  },
  {
    path: ['wording', 'sharedParentCountLabel'],
    wording:
      'interview.stageWording.familyPedigree.wording.sharedParentCountLabel',
  },
  {
    path: ['wording', 'sharedParentEggOnly'],
    wording:
      'interview.stageWording.familyPedigree.wording.sharedParentEggOnly',
  },
  {
    path: ['wording', 'sharedParentsNotSibling'],
    wording:
      'interview.stageWording.familyPedigree.wording.sharedParentsNotSibling',
  },
  {
    path: ['wording', 'sharedSurrogateLabel'],
    wording:
      'interview.stageWording.familyPedigree.wording.sharedSurrogateLabel',
  },
  {
    path: ['wording', 'siblingBiologicalParentLabel'],
    wording:
      'interview.stageWording.familyPedigree.wording.siblingBiologicalParentLabel',
  },
  {
    path: ['wording', 'siblingKindLabel'],
    wording: 'interview.stageWording.familyPedigree.wording.siblingKindLabel',
  },
  {
    path: ['wording', 'siblingOtherBiologicalParentLabel'],
    wording:
      'interview.stageWording.familyPedigree.wording.siblingOtherBiologicalParentLabel',
  },
  {
    path: ['wording', 'siblingTwinFraternal'],
    wording:
      'interview.stageWording.familyPedigree.wording.siblingTwinFraternal',
  },
  {
    path: ['wording', 'siblingTwinHint'],
    wording: 'interview.stageWording.familyPedigree.wording.siblingTwinHint',
  },
  {
    path: ['wording', 'siblingTwinIdentical'],
    wording:
      'interview.stageWording.familyPedigree.wording.siblingTwinIdentical',
  },
  {
    path: ['wording', 'siblingTwinLabel'],
    wording: 'interview.stageWording.familyPedigree.wording.siblingTwinLabel',
  },
  {
    path: ['wording', 'siblingTwinNo'],
    wording: 'interview.stageWording.familyPedigree.wording.siblingTwinNo',
  },
  {
    path: ['wording', 'siblingTwinUnknown'],
    wording: 'interview.stageWording.familyPedigree.wording.siblingTwinUnknown',
  },
  {
    path: ['wording', 'standInPlaceTaken'],
    wording: 'interview.stageWording.familyPedigree.wording.standInPlaceTaken',
  },
  {
    path: ['wording', 'stillTogetherLabel'],
    wording: 'interview.stageWording.familyPedigree.wording.stillTogetherLabel',
  },
  {
    path: ['wording', 'twinsHint'],
    wording: 'interview.stageWording.familyPedigree.wording.twinsHint',
  },
  {
    path: ['wording', 'twinsLabel'],
    wording: 'interview.stageWording.familyPedigree.wording.twinsLabel',
  },
  {
    path: ['wording', 'twinZygosityLabel'],
    wording: 'interview.stageWording.familyPedigree.wording.twinZygosityLabel',
  },
  {
    path: ['wording', 'carrierReplaced'],
    wording: 'interview.stageWording.familyPedigree.wording.carrierReplaced',
  },
  {
    path: ['wording', 'geneticParentReplaced'],
    wording:
      'interview.stageWording.familyPedigree.wording.geneticParentReplaced',
  },
  {
    path: ['wording', 'identicalTwinSharesParents'],
    wording:
      'interview.stageWording.familyPedigree.wording.identicalTwinSharesParents',
  },
  {
    path: ['wording', 'unavailableAncestor'],
    wording:
      'interview.stageWording.familyPedigree.wording.unavailableAncestor',
  },
  {
    path: ['wording', 'unavailableBothSameSex'],
    wording:
      'interview.stageWording.familyPedigree.wording.unavailableBothSameSex',
  },
  {
    path: ['wording', 'unavailableCannotCarry'],
    wording:
      'interview.stageWording.familyPedigree.wording.unavailableCannotCarry',
  },
  {
    path: ['wording', 'unavailableCarried'],
    wording: 'interview.stageWording.familyPedigree.wording.unavailableCarried',
  },
  {
    path: ['wording', 'unavailableCarrierRecorded'],
    wording:
      'interview.stageWording.familyPedigree.wording.unavailableCarrierRecorded',
  },
  {
    path: ['wording', 'unavailableGeneticParentsFull'],
    wording:
      'interview.stageWording.familyPedigree.wording.unavailableGeneticParentsFull',
  },
  {
    path: ['wording', 'unavailableSameSexGeneticParent'],
    wording:
      'interview.stageWording.familyPedigree.wording.unavailableSameSexGeneticParent',
  },
  {
    path: ['wording', 'zygosityFraternal'],
    wording: 'interview.stageWording.familyPedigree.wording.zygosityFraternal',
  },
  {
    path: ['wording', 'zygosityIdentical'],
    wording: 'interview.stageWording.familyPedigree.wording.zygosityIdentical',
  },
  {
    path: ['wording', 'you'],
    wording: 'interview.stageWording.familyPedigree.wording.you',
  },
];
