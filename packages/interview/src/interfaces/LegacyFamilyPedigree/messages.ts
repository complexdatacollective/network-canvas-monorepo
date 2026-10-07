// TODO(narrative-pedigree-rebuild): the pre-redesign Family Pedigree's words,
// kept only for the Narrative Pedigree's copy of the old pedigree. The ids are
// renamed so they cannot collide with the redesigned interface's own.
import { defineMessages } from '@codaco/app-i18n/messages';

export const messages = defineMessages({
  eggParent: {
    id: 'interview.legacyFamilyPedigree.eggParent',
    defaultMessage: 'Egg Parent',
    description:
      'Heading and unnamed-person label in the gamete framing: the person who contributed the egg at conception, regardless of sex or parental gender. Distinct from the person who carried the pregnancy.',
  },
  spermParent: {
    id: 'interview.legacyFamilyPedigree.spermParent',
    defaultMessage: 'Sperm Parent',
    description:
      'Heading and unnamed-person label in the gamete framing: the person who contributed the sperm at conception, regardless of sex or parental gender.',
  },
  gestationalCarrier: {
    id: 'interview.legacyFamilyPedigree.gestationalCarrier',
    defaultMessage: 'Gestational Carrier',
    description:
      'Heading for the person who carried a pregnancy but did not contribute the egg. This term is identical in both the gamete and mother/father framings.',
  },
  eggDonor: {
    id: 'interview.legacyFamilyPedigree.eggDonor',
    defaultMessage: 'Egg Donor',
    description:
      'Unnamed-person label for someone whose donated egg contributed to conception. Donation is distinct from having a social parental role; used in both framings.',
  },
  spermDonor: {
    id: 'interview.legacyFamilyPedigree.spermDonor',
    defaultMessage: 'Sperm Donor',
    description:
      'Unnamed-person label for someone whose donated sperm contributed to conception. Donation is distinct from having a social parental role; used in both framings.',
  },
  eggProviderQuestion: {
    id: 'interview.legacyFamilyPedigree.eggProviderQuestion',
    defaultMessage: 'Who provided the egg?',
    description:
      'Question selecting the person who contributed the egg to a child. Used only in the gamete framing, without inferring their gender.',
  },
  eggProviderHint: {
    id: 'interview.legacyFamilyPedigree.eggProviderHint',
    defaultMessage:
      'Select the person who provided the egg. If they were an egg donor, you can indicate that below.',
    description:
      'Help for selecting an egg contributor from existing people or creating a person. A separate question below records whether this contribution was a donation.',
  },
  spermProviderQuestion: {
    id: 'interview.legacyFamilyPedigree.spermProviderQuestion',
    defaultMessage: 'Who provided the sperm?',
    description:
      'Question selecting the person who contributed the sperm to a child. Used only in the gamete framing, without inferring their gender.',
  },
  spermProviderHint: {
    id: 'interview.legacyFamilyPedigree.spermProviderHint',
    defaultMessage:
      'Select the person who provided the sperm. If they were a sperm donor, you can indicate that below.',
    description:
      'Help for selecting a sperm contributor from existing people or creating a person. A separate question below records whether this contribution was a donation.',
  },
  eggDonorQuestion: {
    id: 'interview.legacyFamilyPedigree.eggDonorQuestion',
    defaultMessage: 'Was this person an egg donor?',
    description:
      'Yes/no question recording whether the selected egg contributor was a donor. The same wording is used in both pedigree framings.',
  },
  spermDonorQuestion: {
    id: 'interview.legacyFamilyPedigree.spermDonorQuestion',
    defaultMessage: 'Was this person a sperm donor?',
    description:
      'Yes/no question recording whether the selected sperm contributor was a donor. The same wording is used in both pedigree framings.',
  },
  yourEggParent: {
    id: 'interview.legacyFamilyPedigree.yourEggParent',
    defaultMessage: 'your egg parent',
    description:
      "Complete fallback person reference used in questions about the participant's parents when the egg contributor has no entered name. Includes the possessive; do not assume gender.",
  },
  yourSpermParent: {
    id: 'interview.legacyFamilyPedigree.yourSpermParent',
    defaultMessage: 'your sperm parent',
    description:
      "Complete fallback person reference used in questions about the participant's parents when the sperm contributor has no entered name. Includes the possessive; do not assume gender.",
  },
  newEggParent: {
    id: 'interview.legacyFamilyPedigree.newEggParent',
    defaultMessage: 'New egg parent',
    description:
      'Fallback name in a partnership question for a newly added, unnamed egg contributor. New means added in the current wizard, not a newborn or new biological relationship.',
  },
  newSpermParent: {
    id: 'interview.legacyFamilyPedigree.newSpermParent',
    defaultMessage: 'New sperm parent',
    description:
      'Fallback name in a partnership question for a newly added, unnamed sperm contributor. New means added in the current wizard, not a newborn or new biological relationship.',
  },
  unknownEggParent: {
    id: 'interview.legacyFamilyPedigree.unknownEggParent',
    defaultMessage: 'Unknown egg parent',
    description:
      "Fallback reference to an unidentified egg contributor in a partnership question. It is the person's identity, not their reproductive role, that is unknown.",
  },
  unknownSpermParent: {
    id: 'interview.legacyFamilyPedigree.unknownSpermParent',
    defaultMessage: 'Unknown sperm parent',
    description:
      "Fallback reference to an unidentified sperm contributor in a partnership question. It is the person's identity, not their reproductive role, that is unknown.",
  },
  mother: {
    id: 'interview.legacyFamilyPedigree.mother',
    defaultMessage: 'Mother',
    description:
      'Heading and unnamed-person label in the mother/father framing. Refers specifically to a biological parent, not a gestational carrier or a social/adoptive parent.',
  },
  father: {
    id: 'interview.legacyFamilyPedigree.father',
    defaultMessage: 'Father',
    description:
      'Heading and unnamed-person label in the mother/father framing. Refers specifically to a biological parent, not a gestational carrier or a social/adoptive parent.',
  },
  motherQuestion: {
    id: 'interview.legacyFamilyPedigree.motherQuestion',
    defaultMessage: 'Who is the biological mother?',
    description:
      "Person-selection question in the mother/father framing. Identifies the child's biological parent; the selected person may have been a gamete donor.",
  },
  motherHint: {
    id: 'interview.legacyFamilyPedigree.motherHint',
    defaultMessage:
      'Select the biological mother. If she was an egg donor, you can indicate that below.',
    description:
      'Help accompanying the biological-parent selection in mother/father framing. The separate donor question below records whether that parent contributed a donated gamete.',
  },
  fatherQuestion: {
    id: 'interview.legacyFamilyPedigree.fatherQuestion',
    defaultMessage: 'Who is the biological father?',
    description:
      "Person-selection question in the mother/father framing. Identifies the child's biological parent; the selected person may have been a gamete donor.",
  },
  fatherHint: {
    id: 'interview.legacyFamilyPedigree.fatherHint',
    defaultMessage:
      'Select the biological father. If he was a sperm donor, you can indicate that below.',
    description:
      'Help accompanying the biological-parent selection in mother/father framing. The separate donor question below records whether that parent contributed a donated gamete.',
  },
  yourMother: {
    id: 'interview.legacyFamilyPedigree.yourMother',
    defaultMessage: 'your mother',
    description:
      'Complete possessive reference to an unnamed biological parent of the participant, used inside partnership questions in mother/father framing.',
  },
  yourFather: {
    id: 'interview.legacyFamilyPedigree.yourFather',
    defaultMessage: 'your father',
    description:
      'Complete possessive reference to an unnamed biological parent of the participant, used inside partnership questions in mother/father framing.',
  },
  newMother: {
    id: 'interview.legacyFamilyPedigree.newMother',
    defaultMessage: 'New mother',
    description:
      'Fallback reference to a newly entered, unnamed biological parent in a partnership question. New means added in this wizard; used in mother/father framing.',
  },
  newFather: {
    id: 'interview.legacyFamilyPedigree.newFather',
    defaultMessage: 'New father',
    description:
      'Fallback reference to a newly entered, unnamed biological parent in a partnership question. New means added in this wizard; used in mother/father framing.',
  },
  unknownMother: {
    id: 'interview.legacyFamilyPedigree.unknownMother',
    defaultMessage: 'Unknown mother',
    description:
      'Fallback reference to a biological parent whose identity is unknown. Used in partnership questions under mother/father framing.',
  },
  unknownFather: {
    id: 'interview.legacyFamilyPedigree.unknownFather',
    defaultMessage: 'Unknown father',
    description:
      'Fallback reference to a biological parent whose identity is unknown. Used in partnership questions under mother/father framing.',
  },
  familyMember: {
    id: 'interview.legacyFamilyPedigree.familyMember',
    defaultMessage: 'Family Member',
    description:
      'Generic display label when no entered name or relationship path is available for a person in the family tree. Does not alter stored research attributes.',
  },
  unknownPerson: {
    id: 'interview.legacyFamilyPedigree.unknownPerson',
    defaultMessage: 'Unknown person',
    description:
      'Fallback label in a person-selection list when neither a name nor a relationship label can be resolved.',
  },
  you: {
    id: 'interview.legacyFamilyPedigree.you',
    defaultMessage: 'You',
    description:
      "Display and accessible label for the participant's own position in the family tree and person-selection lists. This label is never written as their name.",
  },
  parent: {
    id: 'interview.legacyFamilyPedigree.parent',
    defaultMessage: 'Parent',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  socialParent: {
    id: 'interview.legacyFamilyPedigree.socialParent',
    defaultMessage: 'Social Parent',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  donor: {
    id: 'interview.legacyFamilyPedigree.donor',
    defaultMessage: 'Donor',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  surrogate: {
    id: 'interview.legacyFamilyPedigree.surrogate',
    defaultMessage: 'Surrogate',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  child: {
    id: 'interview.legacyFamilyPedigree.child',
    defaultMessage: 'Child',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  partner: {
    id: 'interview.legacyFamilyPedigree.partner',
    defaultMessage: 'Partner',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  sibling: {
    id: 'interview.legacyFamilyPedigree.sibling',
    defaultMessage: 'Sibling',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  stepParent: {
    id: 'interview.legacyFamilyPedigree.stepParent',
    defaultMessage: 'Step-Parent',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  stepChild: {
    id: 'interview.legacyFamilyPedigree.stepChild',
    defaultMessage: 'Step-Child',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  grandparent: {
    id: 'interview.legacyFamilyPedigree.grandparent',
    defaultMessage: 'Grandparent',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  grandparentPartner: {
    id: 'interview.legacyFamilyPedigree.grandparentPartner',
    defaultMessage: "Grandparent's Partner",
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  grandchild: {
    id: 'interview.legacyFamilyPedigree.grandchild',
    defaultMessage: 'Grandchild',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  auntUncle: {
    id: 'interview.legacyFamilyPedigree.auntUncle',
    defaultMessage: 'Aunt/Uncle',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  cousin: {
    id: 'interview.legacyFamilyPedigree.cousin',
    defaultMessage: 'Cousin',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  nieceNephew: {
    id: 'interview.legacyFamilyPedigree.nieceNephew',
    defaultMessage: 'Niece/Nephew',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  siblingPartner: {
    id: 'interview.legacyFamilyPedigree.siblingPartner',
    defaultMessage: "Sibling's Partner",
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  childPartner: {
    id: 'interview.legacyFamilyPedigree.childPartner',
    defaultMessage: "Child's Partner",
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  greatGrandparent: {
    id: 'interview.legacyFamilyPedigree.greatGrandparent',
    defaultMessage: 'Great-Grandparent',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  greatGrandchild: {
    id: 'interview.legacyFamilyPedigree.greatGrandchild',
    defaultMessage: 'Great-Grandchild',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  namedParent: {
    id: 'interview.legacyFamilyPedigree.namedParent',
    defaultMessage: "{name}'s Parent",
    description:
      "Whole display label for an unnamed parent reached through a named relative. name is that relative's entered name; translate the possessive grammar without changing the name.",
  },
  namedChild: {
    id: 'interview.legacyFamilyPedigree.namedChild',
    defaultMessage: "{name}'s Child",
    description:
      "Whole display label for an unnamed child reached through a named relative. name is that relative's entered name; the child's sex is unspecified.",
  },
  namedPartner: {
    id: 'interview.legacyFamilyPedigree.namedPartner',
    defaultMessage: "{name}'s Partner",
    description:
      "Whole display label for an unnamed partner of a named relative. name is that relative's entered name, which remains verbatim.",
  },
  namedRelative: {
    id: 'interview.legacyFamilyPedigree.namedRelative',
    defaultMessage: "{name}'s Relative",
    description:
      'Whole generic label for an unnamed relative reached through a named person. name is the entered intermediary name, which remains verbatim.',
  },
  numberedRelative: {
    id: 'interview.legacyFamilyPedigree.numberedRelative',
    defaultMessage: '{role} #{number, number}',
    description:
      'Disambiguates several unnamed people with the same relationship label. role is an already localized kinship label; number is a stable one-based position, not a count of relatives.',
  },
  adopted: {
    id: 'interview.legacyFamilyPedigree.adopted',
    defaultMessage: 'Adopted',
    description:
      "Accessible description of adoption brackets drawn around a person's diagram symbol. Do not infer that person's sex.",
  },
});
