import { defineMessages } from '@codaco/app-i18n/messages';

export const messages = defineMessages({
  eggParent: {
    id: 'interview.familyPedigree.eggParent',
    defaultMessage: 'Egg Parent',
    description:
      'Heading and unnamed-person label in the gamete framing: the person who contributed the egg at conception, regardless of sex or parental gender. Distinct from the person who carried the pregnancy.',
  },
  spermParent: {
    id: 'interview.familyPedigree.spermParent',
    defaultMessage: 'Sperm Parent',
    description:
      'Heading and unnamed-person label in the gamete framing: the person who contributed the sperm at conception, regardless of sex or parental gender.',
  },
  gestationalCarrier: {
    id: 'interview.familyPedigree.gestationalCarrier',
    defaultMessage: 'Gestational Carrier',
    description:
      'Heading for the person who carried a pregnancy but did not contribute the egg. This term is identical in both the gamete and mother/father framings.',
  },
  eggDonor: {
    id: 'interview.familyPedigree.eggDonor',
    defaultMessage: 'Egg Donor',
    description:
      'Unnamed-person label for someone whose donated egg contributed to conception. Donation is distinct from having a social parental role; used in both framings.',
  },
  spermDonor: {
    id: 'interview.familyPedigree.spermDonor',
    defaultMessage: 'Sperm Donor',
    description:
      'Unnamed-person label for someone whose donated sperm contributed to conception. Donation is distinct from having a social parental role; used in both framings.',
  },
  eggProviderQuestion: {
    id: 'interview.familyPedigree.eggProviderQuestion',
    defaultMessage: 'Who provided the egg?',
    description:
      'Question selecting the person who contributed the egg to a child. Used only in the gamete framing, without inferring their gender.',
  },
  eggProviderHint: {
    id: 'interview.familyPedigree.eggProviderHint',
    defaultMessage:
      'Select the person who provided the egg. If they were an egg donor, you can indicate that below.',
    description:
      'Help for selecting an egg contributor from existing people or creating a person. A separate question below records whether this contribution was a donation.',
  },
  spermProviderQuestion: {
    id: 'interview.familyPedigree.spermProviderQuestion',
    defaultMessage: 'Who provided the sperm?',
    description:
      'Question selecting the person who contributed the sperm to a child. Used only in the gamete framing, without inferring their gender.',
  },
  spermProviderHint: {
    id: 'interview.familyPedigree.spermProviderHint',
    defaultMessage:
      'Select the person who provided the sperm. If they were a sperm donor, you can indicate that below.',
    description:
      'Help for selecting a sperm contributor from existing people or creating a person. A separate question below records whether this contribution was a donation.',
  },
  eggDonorQuestion: {
    id: 'interview.familyPedigree.eggDonorQuestion',
    defaultMessage: 'Was this person an egg donor?',
    description:
      'Yes/no question recording whether the selected egg contributor was a donor. The same wording is used in both pedigree framings.',
  },
  spermDonorQuestion: {
    id: 'interview.familyPedigree.spermDonorQuestion',
    defaultMessage: 'Was this person a sperm donor?',
    description:
      'Yes/no question recording whether the selected sperm contributor was a donor. The same wording is used in both pedigree framings.',
  },
  yourEggParent: {
    id: 'interview.familyPedigree.yourEggParent',
    defaultMessage: 'your egg parent',
    description:
      "Complete fallback person reference used in questions about the participant's parents when the egg contributor has no entered name. Includes the possessive; do not assume gender.",
  },
  yourSpermParent: {
    id: 'interview.familyPedigree.yourSpermParent',
    defaultMessage: 'your sperm parent',
    description:
      "Complete fallback person reference used in questions about the participant's parents when the sperm contributor has no entered name. Includes the possessive; do not assume gender.",
  },
  newEggParent: {
    id: 'interview.familyPedigree.newEggParent',
    defaultMessage: 'New egg parent',
    description:
      'Fallback name in a partnership question for a newly added, unnamed egg contributor. New means added in the current wizard, not a newborn or new biological relationship.',
  },
  newSpermParent: {
    id: 'interview.familyPedigree.newSpermParent',
    defaultMessage: 'New sperm parent',
    description:
      'Fallback name in a partnership question for a newly added, unnamed sperm contributor. New means added in the current wizard, not a newborn or new biological relationship.',
  },
  unknownEggParent: {
    id: 'interview.familyPedigree.unknownEggParent',
    defaultMessage: 'Unknown egg parent',
    description:
      "Fallback reference to an unidentified egg contributor in a partnership question. It is the person's identity, not their reproductive role, that is unknown.",
  },
  unknownSpermParent: {
    id: 'interview.familyPedigree.unknownSpermParent',
    defaultMessage: 'Unknown sperm parent',
    description:
      "Fallback reference to an unidentified sperm contributor in a partnership question. It is the person's identity, not their reproductive role, that is unknown.",
  },
  mother: {
    id: 'interview.familyPedigree.mother',
    defaultMessage: 'Mother',
    description:
      'Heading and unnamed-person label in the mother/father framing. Refers specifically to a biological parent, not a gestational carrier or a social/adoptive parent.',
  },
  father: {
    id: 'interview.familyPedigree.father',
    defaultMessage: 'Father',
    description:
      'Heading and unnamed-person label in the mother/father framing. Refers specifically to a biological parent, not a gestational carrier or a social/adoptive parent.',
  },
  motherQuestion: {
    id: 'interview.familyPedigree.motherQuestion',
    defaultMessage: 'Who is the biological mother?',
    description:
      "Person-selection question in the mother/father framing. Identifies the child's biological parent; the selected person may have been a gamete donor.",
  },
  motherHint: {
    id: 'interview.familyPedigree.motherHint',
    defaultMessage:
      'Select the biological mother. If she was an egg donor, you can indicate that below.',
    description:
      'Help accompanying the biological-parent selection in mother/father framing. The separate donor question below records whether that parent contributed a donated gamete.',
  },
  fatherQuestion: {
    id: 'interview.familyPedigree.fatherQuestion',
    defaultMessage: 'Who is the biological father?',
    description:
      "Person-selection question in the mother/father framing. Identifies the child's biological parent; the selected person may have been a gamete donor.",
  },
  fatherHint: {
    id: 'interview.familyPedigree.fatherHint',
    defaultMessage:
      'Select the biological father. If he was a sperm donor, you can indicate that below.',
    description:
      'Help accompanying the biological-parent selection in mother/father framing. The separate donor question below records whether that parent contributed a donated gamete.',
  },
  yourMother: {
    id: 'interview.familyPedigree.yourMother',
    defaultMessage: 'your mother',
    description:
      'Complete possessive reference to an unnamed biological parent of the participant, used inside partnership questions in mother/father framing.',
  },
  yourFather: {
    id: 'interview.familyPedigree.yourFather',
    defaultMessage: 'your father',
    description:
      'Complete possessive reference to an unnamed biological parent of the participant, used inside partnership questions in mother/father framing.',
  },
  newMother: {
    id: 'interview.familyPedigree.newMother',
    defaultMessage: 'New mother',
    description:
      'Fallback reference to a newly entered, unnamed biological parent in a partnership question. New means added in this wizard; used in mother/father framing.',
  },
  newFather: {
    id: 'interview.familyPedigree.newFather',
    defaultMessage: 'New father',
    description:
      'Fallback reference to a newly entered, unnamed biological parent in a partnership question. New means added in this wizard; used in mother/father framing.',
  },
  unknownMother: {
    id: 'interview.familyPedigree.unknownMother',
    defaultMessage: 'Unknown mother',
    description:
      'Fallback reference to a biological parent whose identity is unknown. Used in partnership questions under mother/father framing.',
  },
  unknownFather: {
    id: 'interview.familyPedigree.unknownFather',
    defaultMessage: 'Unknown father',
    description:
      'Fallback reference to a biological parent whose identity is unknown. Used in partnership questions under mother/father framing.',
  },
  sexSelf: {
    id: 'interview.familyPedigree.sexSelf',
    defaultMessage: 'What sex were you recorded as at birth?',
    description:
      "Required question about the participant's own sex recorded at birth, used for inheritance modelling. This asks about the birth record, not current gender identity.",
  },
  sexOther: {
    id: 'interview.familyPedigree.sexOther',
    defaultMessage: 'What sex was this person recorded as at birth?',
    description:
      "Required question about a relative's sex recorded at birth, used for inheritance modelling. This asks about the birth record, not current gender identity.",
  },
  sexHint: {
    id: 'interview.familyPedigree.sexHint',
    defaultMessage:
      'If you’re not sure, choose “Don’t know” — please don’t guess.',
    description:
      'Help under the birth-recorded-sex question. Use the same translation of the unknown option as sexUnknown and explicitly discourage guessing.',
  },
  sexLeadIn: {
    id: 'interview.familyPedigree.sexLeadIn',
    defaultMessage:
      'To understand how conditions can be passed down a family, we need the sex each person was recorded as at birth — not how they describe their gender.',
    description:
      "One-time explanation before the participant's birth-recorded-sex question, distinguishing the inheritance information being collected from gender identity.",
  },
  sexFemale: {
    id: 'interview.familyPedigree.sexFemale',
    defaultMessage: 'Female',
    description:
      'Option for sex recorded at birth. Translate only the label; the corresponding schema value remains a stable English identifier.',
  },
  sexMale: {
    id: 'interview.familyPedigree.sexMale',
    defaultMessage: 'Male',
    description:
      'Option for sex recorded at birth. Translate only the label; the corresponding schema value remains a stable English identifier.',
  },
  sexIntersex: {
    id: 'interview.familyPedigree.sexIntersex',
    defaultMessage: 'Intersex or a variation in sex characteristics',
    description:
      'Birth-recorded-sex option covering intersex and variations in sex characteristics. Preserve both parts rather than shortening it to one category.',
  },
  sexUnknown: {
    id: 'interview.familyPedigree.sexUnknown',
    defaultMessage: 'Don’t know',
    description:
      'Birth-recorded-sex answer when the participant does not know. It is distinct from choosing not to disclose, and must match the option quoted in sexHint.',
  },
  familyMember: {
    id: 'interview.familyPedigree.familyMember',
    defaultMessage: 'Family Member',
    description:
      'Generic display label when no entered name or relationship path is available for a person in the family tree. Does not alter stored research attributes.',
  },
  unknownPerson: {
    id: 'interview.familyPedigree.unknownPerson',
    defaultMessage: 'Unknown person',
    description:
      'Fallback label in a person-selection list when neither a name nor a relationship label can be resolved.',
  },
  you: {
    id: 'interview.familyPedigree.you',
    defaultMessage: 'You',
    description:
      "Display and accessible label for the participant's own position in the family tree and person-selection lists. This label is never written as their name.",
  },
  parent: {
    id: 'interview.familyPedigree.parent',
    defaultMessage: 'Parent',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  socialParent: {
    id: 'interview.familyPedigree.socialParent',
    defaultMessage: 'Social Parent',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  donor: {
    id: 'interview.familyPedigree.donor',
    defaultMessage: 'Donor',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  surrogate: {
    id: 'interview.familyPedigree.surrogate',
    defaultMessage: 'Surrogate',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  child: {
    id: 'interview.familyPedigree.child',
    defaultMessage: 'Child',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  partner: {
    id: 'interview.familyPedigree.partner',
    defaultMessage: 'Partner',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  sibling: {
    id: 'interview.familyPedigree.sibling',
    defaultMessage: 'Sibling',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  stepParent: {
    id: 'interview.familyPedigree.stepParent',
    defaultMessage: 'Step-Parent',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  stepChild: {
    id: 'interview.familyPedigree.stepChild',
    defaultMessage: 'Step-Child',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  grandparent: {
    id: 'interview.familyPedigree.grandparent',
    defaultMessage: 'Grandparent',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  grandparentPartner: {
    id: 'interview.familyPedigree.grandparentPartner',
    defaultMessage: "Grandparent's Partner",
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  grandchild: {
    id: 'interview.familyPedigree.grandchild',
    defaultMessage: 'Grandchild',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  auntUncle: {
    id: 'interview.familyPedigree.auntUncle',
    defaultMessage: 'Aunt/Uncle',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  cousin: {
    id: 'interview.familyPedigree.cousin',
    defaultMessage: 'Cousin',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  nieceNephew: {
    id: 'interview.familyPedigree.nieceNephew',
    defaultMessage: 'Niece/Nephew',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  siblingPartner: {
    id: 'interview.familyPedigree.siblingPartner',
    defaultMessage: "Sibling's Partner",
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  childPartner: {
    id: 'interview.familyPedigree.childPartner',
    defaultMessage: "Child's Partner",
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  greatGrandparent: {
    id: 'interview.familyPedigree.greatGrandparent',
    defaultMessage: 'Great-Grandparent',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  greatGrandchild: {
    id: 'interview.familyPedigree.greatGrandchild',
    defaultMessage: 'Great-Grandchild',
    description:
      'Display-only kinship label for an unnamed person, relative to the participant. Do not infer a sex that the English label leaves unspecified. Canonical relationship values written to research data are separate and remain unchanged.',
  },
  namedParent: {
    id: 'interview.familyPedigree.namedParent',
    defaultMessage: "{name}'s Parent",
    description:
      "Whole display label for an unnamed parent reached through a named relative. name is that relative's entered name; translate the possessive grammar without changing the name.",
  },
  namedChild: {
    id: 'interview.familyPedigree.namedChild',
    defaultMessage: "{name}'s Child",
    description:
      "Whole display label for an unnamed child reached through a named relative. name is that relative's entered name; the child's sex is unspecified.",
  },
  namedPartner: {
    id: 'interview.familyPedigree.namedPartner',
    defaultMessage: "{name}'s Partner",
    description:
      "Whole display label for an unnamed partner of a named relative. name is that relative's entered name, which remains verbatim.",
  },
  namedRelative: {
    id: 'interview.familyPedigree.namedRelative',
    defaultMessage: "{name}'s Relative",
    description:
      'Whole generic label for an unnamed relative reached through a named person. name is the entered intermediary name, which remains verbatim.',
  },
  numberedRelative: {
    id: 'interview.familyPedigree.numberedRelative',
    defaultMessage: '{role} #{number, number}',
    description:
      'Disambiguates several unnamed people with the same relationship label. role is an already localized kinship label; number is a stable one-based position, not a count of relatives.',
  },
  grandparentsRequired: {
    id: 'interview.familyPedigree.grandparentsRequired',
    defaultMessage: 'Each of your parents needs at least two parents recorded.',
    description:
      'Completeness warning when a biological parent of the participant has fewer than two genetic parents recorded. May be a required block or recommended checklist nudge.',
  },
  contributorsRequired: {
    id: 'interview.familyPedigree.contributorsRequired',
    defaultMessage:
      "Each of your children's other parents needs their own parents and grandparents recorded.",
    description:
      "Completeness warning requiring the other genetic parents of the participant's children to have their own parents and grandparents recorded. Preserve both generations.",
  },
  missingSelf: {
    id: 'interview.familyPedigree.missingSelf',
    defaultMessage:
      'Your own place in this family tree could not be found. Please ask the person running this interview for help.',
    description:
      "Blocking validation error when the participant's own person is missing from the tree. Direct them to the person running the interview; this cannot be repaired by ignoring the checklist.",
  },
  duplicateSelf: {
    id: 'interview.familyPedigree.duplicateSelf',
    defaultMessage:
      'More than one person in this family tree is marked as you. Please ask the person running this interview for help.',
    description:
      'Blocking validation error when several people are marked as the participant. Direct them to the person running the interview, without exposing stored identifiers.',
  },
  parentsRequired: {
    id: 'interview.familyPedigree.parentsRequired',
    defaultMessage: 'You must have at least two parents defined.',
    description:
      'Minimum completeness requirement before finalizing: the participant must have at least two parent relationships recorded. This does not require exactly two.',
  },
  addOneParent: {
    id: 'interview.familyPedigree.addOneParent',
    defaultMessage: 'Add 1 more parent for {name}',
    description:
      'Optional checklist nudge when exactly one more parent is needed for a named person. name is participant-entered text and remains unchanged.',
  },
  addParentsFor: {
    id: 'interview.familyPedigree.addParentsFor',
    defaultMessage: 'Add parents for {name}',
    description:
      'Optional checklist item asking for the parents of a named person. name is participant-entered text; this wording also remains visible when the item is checked.',
  },
  whatName: {
    id: 'interview.familyPedigree.whatName',
    defaultMessage: 'What is their name?',
    description:
      'Caption for the built-in person-name field. The entered name is research data and is never translated; unknown names may be left blank unless the protocol requires them.',
  },
  unknownNameHint: {
    id: 'interview.familyPedigree.unknownNameHint',
    defaultMessage: 'Leave blank if the name is not known',
    description:
      'Hint for an optional person-name field. Protocol-required names suppress this hint, so it must not imply that all fields can be skipped.',
  },
  name: {
    id: 'interview.familyPedigree.name',
    defaultMessage: 'Name',
    description:
      'Caption for the built-in person-name field. The entered name is research data and is never translated; unknown names may be left blank unless the protocol requires them.',
  },
  enterName: {
    id: 'interview.familyPedigree.enterName',
    defaultMessage: 'Enter name',
    description:
      "Placeholder for entering a relative's name in the pedigree wizard or editor. It is not an example name and is never stored as a response.",
  },
  pendingUniqueHint: {
    id: 'interview.familyPedigree.pendingUniqueHint',
    defaultMessage: 'Must also be unique within this family setup.',
    description:
      'Additional validation hint when the protocol requires a unique name: uniqueness also includes people still being entered in the unfinished pedigree wizard.',
  },
  pendingUniqueError: {
    id: 'interview.familyPedigree.pendingUniqueError',
    defaultMessage: 'This value is used elsewhere. It must be unique.',
    description:
      'Field-owned error when a value duplicates another entry in the pending family wizard. Do not include the duplicated value in the message.',
  },
  framingMotherFather: {
    id: 'interview.familyPedigree.framingMotherFather',
    defaultMessage: 'Mother & father',
    description:
      'Label for choosing mother/father terminology for biological parents. This changes displayed wording, not how reproductive roles are stored.',
  },
  framingMotherFatherDescription: {
    id: 'interview.familyPedigree.framingMotherFatherDescription',
    defaultMessage:
      "We'll talk about your biological mother and biological father.",
    description:
      'Description of the mother/father terminology option. Make clear that the biological parents, rather than adoptive or other social parents, use these terms.',
  },
  framingGamete: {
    id: 'interview.familyPedigree.framingGamete',
    defaultMessage: 'Egg parent & sperm parent',
    description:
      'Label for choosing terminology based on contribution of the egg and sperm. Both roles must remain explicit and distinct from gestation.',
  },
  framingGameteDescription: {
    id: 'interview.familyPedigree.framingGameteDescription',
    defaultMessage:
      "We'll talk about the person whose egg you came from and the person whose sperm you came from.",
    description:
      'Description of the gamete terminology option. Identifies the two people by their contributions to conception, without assigning gender.',
  },
  framingQuestion: {
    id: 'interview.familyPedigree.framingQuestion',
    defaultMessage:
      "How would you like us to refer to the people you're biologically related to?",
    description:
      "Accessible prompt for the participant's choice between mother/father and egg/sperm terminology. It asks for a language preference, not new biological information.",
  },
  eggIntro: {
    id: 'interview.familyPedigree.eggIntro',
    defaultMessage:
      'Please answer the following questions about your egg parent. This is the person who contributed the egg that you were conceived with, which may be different from the person who carried you during pregnancy.',
    description:
      "Introduction to questions about the participant's egg contributor in gamete framing. Preserve the distinction from the person who carried the pregnancy.",
  },
  motherIntro: {
    id: 'interview.familyPedigree.motherIntro',
    defaultMessage:
      'Please answer the following questions about your mother. This is your biological mother, who may be different from the person who carried you during pregnancy.',
    description:
      "Introduction to questions about the participant's biological mother in mother/father framing. Preserve that she may be different from the person who carried the pregnancy.",
  },
  spermIntro: {
    id: 'interview.familyPedigree.spermIntro',
    defaultMessage:
      'Please answer the following questions about your sperm parent. This is the person who contributed the sperm that you were conceived with.',
    description:
      "Introduction to questions about the participant's sperm contributor in gamete framing. Refers to conception and does not assume parental gender.",
  },
  fatherIntro: {
    id: 'interview.familyPedigree.fatherIntro',
    defaultMessage:
      'Please answer the following questions about your father. This is your biological father.',
    description:
      "Introduction to questions about the participant's biological father in mother/father framing, distinct from a social or adoptive father.",
  },
  carrierGameteIntro: {
    id: 'interview.familyPedigree.carrierGameteIntro',
    defaultMessage:
      'Please answer the following questions about your gestational carrier. This is the person who carried you during pregnancy but did not contribute the egg, including gestational surrogates.',
    description:
      "Introduction to questions about the person who carried the participant's pregnancy but did not contribute the egg. Uses gamete framing and explicitly includes gestational surrogacy.",
  },
  carrierGenderedIntro: {
    id: 'interview.familyPedigree.carrierGenderedIntro',
    defaultMessage:
      'Please answer the following questions about your gestational carrier. This is the person who carried you during pregnancy but is not your biological mother, including gestational surrogates.',
    description:
      "Introduction to questions about the person who carried the participant's pregnancy but is not their biological mother. Uses mother/father framing and includes gestational surrogacy.",
  },
  parentCarriedYou: {
    id: 'interview.familyPedigree.parentCarriedYou',
    defaultMessage: 'Did this parent carry you during pregnancy?',
    description:
      'Yes/no question asking whether the selected biological parent also carried the pregnancy that produced the participant. A no answer opens separate gestational-carrier questions.',
  },
  anyAdditionalParents: {
    id: 'interview.familyPedigree.anyAdditionalParents',
    defaultMessage: 'Do you have any additional parents?',
    description:
      "Initial wizard question about the participant's additional non-biological parents. The count controls how many subsequent person forms are shown.",
  },
  additionalParentsHint: {
    id: 'interview.familyPedigree.additionalParentsHint',
    defaultMessage:
      'This includes adoptive parents, stepparents, or any other parents who are not your biological parents.',
    description:
      "Explains the additional-parents part of the participant's family setup, including adoptive parents, stepparents and other parental figures, separately from genetic contributors.",
  },
  additionalParentsCount: {
    id: 'interview.familyPedigree.additionalParentsCount',
    defaultMessage: 'How many additional parents do you have?',
    description:
      "Initial wizard question about the participant's additional non-biological parents. The count controls how many subsequent person forms are shown.",
  },
  stepParentRole: {
    id: 'interview.familyPedigree.stepParentRole',
    defaultMessage: 'Step-parent',
    description:
      "Option describing a non-biological parent's social role in the family. Translate only the display label; the role identifier is stored unchanged.",
  },
  adoptiveParentRole: {
    id: 'interview.familyPedigree.adoptiveParentRole',
    defaultMessage: 'Adoptive parent',
    description:
      "Option describing a non-biological parent's social role in the family. Translate only the display label; the role identifier is stored unchanged.",
  },
  raisedMeRole: {
    id: 'interview.familyPedigree.raisedMeRole',
    defaultMessage: 'Parent who raised me',
    description:
      'Social-parent role option for someone who raised the participant, distinct from the explicitly adoptive and stepparent options.',
  },
  additionalParentNumber: {
    id: 'interview.familyPedigree.additionalParentNumber',
    defaultMessage: 'Additional Parent {number, number}',
    description:
      "Repeated form heading for an additional non-biological parent. number is the one-based form position, not the person's name or generation.",
  },
  parentRole: {
    id: 'interview.familyPedigree.parentRole',
    defaultMessage: 'What role did this parent have?',
    description:
      'Question selecting the social role of an additional parent, such as stepparent, adoptive parent or the person who raised the subject.',
  },
  additionalParentsIntro: {
    id: 'interview.familyPedigree.additionalParentsIntro',
    defaultMessage:
      'Please tell us about each of your additional parents. This includes step-parents, adoptive parents, or other people who played a parental role in your life.',
    description:
      "Explains the additional-parents part of the participant's family setup, including adoptive parents, stepparents and other parental figures, separately from genetic contributors.",
  },
  currentPartnerQuestion: {
    id: 'interview.familyPedigree.currentPartnerQuestion',
    defaultMessage: 'Do you have a current partner?',
    description:
      "Yes/no question about whether the participant currently has a romantic partner. A yes answer reveals that partner's details and shared children.",
  },
  childrenWithPartnerCount: {
    id: 'interview.familyPedigree.childrenWithPartnerCount',
    defaultMessage: 'How many children do you have with this partner?',
    description:
      'Numeric question counting only children the participant has with the current partner identified above, not all children in the family.',
  },
  yourPartner: {
    id: 'interview.familyPedigree.yourPartner',
    defaultMessage: 'Your partner',
    description:
      "Fallback person reference for the participant's current partner when no name was entered. Used in biological-parent candidate lists for their children.",
  },
  childrenIntro: {
    id: 'interview.familyPedigree.childrenIntro',
    defaultMessage:
      'Please tell us about each of your children with your current partner, and confirm who their biological parents are.',
    description:
      'Instructions before collecting each child of the participant and current partner, including confirmation of genetic parentage rather than assuming it from the partnership.',
  },
  childNumber: {
    id: 'interview.familyPedigree.childNumber',
    defaultMessage: 'Child {number, number}',
    description:
      "Heading for a repeated child-details form. number is the one-based form position; leave the child's sex unspecified.",
  },
  currentPartner: {
    id: 'interview.familyPedigree.currentPartner',
    defaultMessage: 'Current partner',
    description:
      'Partnership-status option for a named person: currently romantically involved versus a former romantic relationship. These are not co-parenting statuses.',
  },
  exPartner: {
    id: 'interview.familyPedigree.exPartner',
    defaultMessage: 'Ex-partner',
    description:
      'Partnership-status option for a named person: currently romantically involved versus a former romantic relationship. These are not co-parenting statuses.',
  },
  notPartnerUnknown: {
    id: 'interview.familyPedigree.notPartnerUnknown',
    defaultMessage: "Not a partner or Don't know",
    description:
      'Partnership matrix option combining no romantic relationship with unknown relationship status. Preserve both alternatives.',
  },
  yourCarrier: {
    id: 'interview.familyPedigree.yourCarrier',
    defaultMessage: 'your gestational carrier',
    description:
      "Complete fallback reference to the person who carried the participant's pregnancy when their name is unknown. Includes the possessive for use in a whole partnership question.",
  },
  yourAdditionalParent: {
    id: 'interview.familyPedigree.yourAdditionalParent',
    defaultMessage: 'your additional parent',
    description:
      "Complete fallback reference to one of the participant's additional social parents when no name is available. Includes the possessive.",
  },
  partnershipIntro: {
    id: 'interview.familyPedigree.partnershipIntro',
    defaultMessage:
      'We now want to ask about partnerships between the parents you named.',
    description:
      "Introduction to the matrix asking about romantic relationships among the participant's recorded parents.",
  },
  partnershipDefinition: {
    id: 'interview.familyPedigree.partnershipDefinition',
    defaultMessage:
      'Partnership means current and past romantic relationships, but <strong>not co-parenting</strong> (where two people raised a child together but were never romantically involved).',
    description:
      'Explains that partnership includes current and past romantic relationships but excludes raising a child together without romance. strong emphasizes this exclusion; keep the whole explanation together.',
  },
  partnersOf: {
    id: 'interview.familyPedigree.partnersOf',
    defaultMessage:
      'Please indicate which of these people are partners of <strong>{name}</strong>.',
    description:
      'Matrix question about romantic partners of one recorded parent. name is an entered name or localized role fallback; strong emphasis surrounds it and must be preserved. strong emphasizes the literal person name; render it as rich text without interpreting markup in the name.',
  },
  deceasedPartnerHint: {
    id: 'interview.familyPedigree.deceasedPartnerHint',
    defaultMessage:
      'If either person is deceased, please answer based on whether they were partners while both were alive.',
    description:
      'Help for partnership questions when one or both people have died: answer about their relationship while both were alive.',
  },
  biologicalParent: {
    id: 'interview.familyPedigree.biologicalParent',
    defaultMessage: 'Biological Parent',
    description:
      'Parent-type choice for a genetic contributor to the person being added. Keep distinct from social parenthood and gestation without a genetic contribution.',
  },
  biologicalParentDescription: {
    id: 'interview.familyPedigree.biologicalParentDescription',
    defaultMessage: 'A parent who is genetically related to this person',
    description:
      'Parent-type choice for a genetic contributor to the person being added. Keep distinct from social parenthood and gestation without a genetic contribution.',
  },
  socialParentDescription: {
    id: 'interview.familyPedigree.socialParentDescription',
    defaultMessage: 'An adoptive, step, or foster parent',
    description:
      'Description of the non-genetic social-parent choice, including adoption, step-parenthood and foster care.',
  },
  donorDescription: {
    id: 'interview.familyPedigree.donorDescription',
    defaultMessage:
      "Someone who donated sperm or an egg for this person's conception",
    description:
      "Description of the donor parent-type choice: a donated gamete contributed to this person's conception. It does not imply a social parental relationship.",
  },
  surrogateDescription: {
    id: 'interview.familyPedigree.surrogateDescription',
    defaultMessage: 'Someone who carried this person during pregnancy',
    description:
      'Description of the gestational parent-type choice: the person who carried the pregnancy. Do not imply that they also contributed a gamete.',
  },
  current: {
    id: 'interview.familyPedigree.current',
    defaultMessage: 'Current',
    description:
      'Short radio option for whether a romantic relationship is current or former. The question above supplies the person and relationship context.',
  },
  ex: {
    id: 'interview.familyPedigree.ex',
    defaultMessage: 'Ex',
    description:
      'Short radio option for whether a romantic relationship is current or former. The question above supplies the person and relationship context.',
  },
  alreadyInTree: {
    id: 'interview.familyPedigree.alreadyInTree',
    defaultMessage: 'Yes — already in the family tree',
    description:
      'Partner-addition option reusing a person already recorded in the family tree. It must not imply that a duplicate person will be created.',
  },
  addNewPersonOption: {
    id: 'interview.familyPedigree.addNewPersonOption',
    defaultMessage: 'No — add a new person',
    description:
      'Partner-addition option creating a new person because they are not already in the tree. Preserve the negative answer and the resulting action.',
  },
  personAlreadyRelated: {
    id: 'interview.familyPedigree.personAlreadyRelated',
    defaultMessage:
      'Is this person already in your family tree / related to you?',
    description:
      'Question deciding whether a partner should reuse an existing relative/person in the tree. Allows relationships between people already in the recorded family.',
  },
  selectPerson: {
    id: 'interview.familyPedigree.selectPerson',
    defaultMessage: 'Select the person',
    description:
      'Caption for the list of existing people that can be reused when adding a partner or parent. Names are entered research data.',
  },
  currentOrExPartner: {
    id: 'interview.familyPedigree.currentOrExPartner',
    defaultMessage: 'Are they a current or ex partner?',
    description:
      'Question classifying the selected partner relationship as current or former. It appears for both newly entered and reused people.',
  },
  alsoParentOf: {
    id: 'interview.familyPedigree.alsoParentOf',
    defaultMessage: 'Is this person also a parent of <strong>{name}</strong>?',
    description:
      'Question asking whether the partner being added is also a parent of an existing child. name identifies that child; preserve the strong emphasis and do not translate the name. strong emphasizes the literal person name; render it as rich text without interpreting markup in the name.',
  },
  notParent: {
    id: 'interview.familyPedigree.notParent',
    defaultMessage: 'Not a parent',
    description:
      'Parent-type option indicating that the newly added partner is not a parent of the particular existing child named in the question.',
  },
  notParentDescription: {
    id: 'interview.familyPedigree.notParentDescription',
    defaultMessage: 'Select this if not a parent of this child',
    description:
      'Parent-type option indicating that the newly added partner is not a parent of the particular existing child named in the question.',
  },
  addParentSiblings: {
    id: 'interview.familyPedigree.addParentSiblings',
    defaultMessage: "Add parent's siblings",
    description:
      "Optional checklist task to add siblings of the participant's parents: the participant's aunts and uncles, not their own siblings.",
  },
  addSiblings: {
    id: 'interview.familyPedigree.addSiblings',
    defaultMessage: 'Add siblings',
    description:
      "Optional checklist task to add the participant's siblings. Checking it manually also allows the participant to mark it as not applicable.",
  },
  addPartners: {
    id: 'interview.familyPedigree.addPartners',
    defaultMessage: 'Add partners',
    description:
      "Optional checklist task to record the participant's partners, including former relationships where applicable.",
  },
  addChildren: {
    id: 'interview.familyPedigree.addChildren',
    defaultMessage: 'Add children',
    description:
      "Checklist task to record the participant's children, shown once at least one child is already present.",
  },
  noChildrenConfirmed: {
    id: 'interview.familyPedigree.noChildrenConfirmed',
    defaultMessage: 'No children (confirmed)',
    description:
      "Completed checklist state recording the participant's explicit affirmation that they have no children; this is distinct from simply leaving the task unfinished.",
  },
  addOrConfirmChildren: {
    id: 'interview.familyPedigree.addOrConfirmChildren',
    defaultMessage: 'Add children (or confirm none)',
    description:
      'Checklist task that can be satisfied either by recording children or explicitly confirming that there are none.',
  },
  recordGrandparents: {
    id: 'interview.familyPedigree.recordGrandparents',
    defaultMessage: "Record each parent's two parents",
    description:
      "Checklist boundary requirement to record two parents for each of the participant's genetic parents, completing the grandparent generation.",
  },
  recordCoParents: {
    id: 'interview.familyPedigree.recordCoParents',
    defaultMessage: "Record children's co-parents and their parents",
    description:
      "Checklist boundary requirement to record the other genetic parents of the participant's children and those co-parents' parents.",
  },
  checklistTitle: {
    id: 'interview.familyPedigree.checklistTitle',
    defaultMessage: 'Pedigree Checklist',
    description:
      'Heading of the floating checklist that tracks completeness of the family tree while it is being built.',
  },
  checklistInstructions: {
    id: 'interview.familyPedigree.checklistInstructions',
    defaultMessage:
      "Complete the following tasks before continuing. If a task doesn't apply you can click it to mark it as done.",
    description:
      'Instructions for completing checklist tasks, including marking a non-applicable task as done by selecting it.',
  },
  finalizePedigree: {
    id: 'interview.familyPedigree.finalizePedigree',
    defaultMessage: 'Finalize family pedigree',
    description:
      'Action committing the family tree and ending structural editing. People can still have their details edited, but relatives cannot be added or removed afterward.',
  },
  helpName: {
    id: 'interview.familyPedigree.helpName',
    defaultMessage: 'How to build your pedigree',
    description:
      'Accessible name for opening the explanatory dialog about adding relatives through the pedigree context menu.',
  },
  help: {
    id: 'interview.familyPedigree.help',
    defaultMessage: 'Help',
    description:
      'Short visible action opening family-tree construction guidance from the floating checklist.',
  },
  incompleteTitle: {
    id: 'interview.familyPedigree.incompleteTitle',
    defaultMessage: 'Pedigree is incomplete',
    description:
      'Heading of a blocking dialog shown when the family tree cannot yet be finalized.',
  },
  incompleteNoFamily: {
    id: 'interview.familyPedigree.incompleteNoFamily',
    defaultMessage:
      'You have not created your family pedigree yet. Please complete the pedigree wizard to create your pedigree before continuing. Click the button in the bottom right to get started.',
    description:
      'Blocking guidance when the initial family wizard has not been completed. Direct the participant to the existing start button in the lower-right corner.',
  },
  okay: {
    id: 'interview.familyPedigree.okay',
    defaultMessage: 'OK',
    description:
      'Acknowledgment action closing the incomplete-tree explanation without advancing to another interview screen.',
  },
  incompleteIssues: {
    id: 'interview.familyPedigree.incompleteIssues',
    defaultMessage:
      "It looks like you haven't completed all the required tasks for your family pedigree. The following issues must be resolved before you can continue:",
    description:
      'Introduction to a list of required family-tree validation problems. These must be resolved before the participant can continue.',
  },
  returnToEditing: {
    id: 'interview.familyPedigree.returnToEditing',
    defaultMessage: 'Return to editing',
    description:
      'Action dismissing a completeness or finalization dialog and preserving the editable family tree.',
  },
  finalizeQuestion: {
    id: 'interview.familyPedigree.finalizeQuestion',
    defaultMessage: 'Finalize your family pedigree?',
    description:
      'Confirmation title before permanently ending the add/remove phase of this family tree. Finalization is different from finishing the entire interview.',
  },
  finalizeDescription: {
    id: 'interview.familyPedigree.finalizeDescription',
    defaultMessage:
      'Once you continue, you will not be able to add or remove family members. You can still edit their details.',
    description:
      'Consequence of finalizing the tree: adding and removing people will be disabled, but editing their details remains available. Preserve both parts.',
  },
  finalize: {
    id: 'interview.familyPedigree.finalize',
    defaultMessage: 'Finalize',
    description:
      'Action committing the family tree and ending structural editing. People can still have their details edited, but relatives cannot be added or removed afterward.',
  },
  keepEditing: {
    id: 'interview.familyPedigree.keepEditing',
    defaultMessage: 'Keep editing',
    description:
      'Action dismissing a completeness or finalization dialog and preserving the editable family tree.',
  },
  resetQuestion: {
    id: 'interview.familyPedigree.resetQuestion',
    defaultMessage: 'Reset family pedigree?',
    description:
      'Destructive reset action for an already finalized family tree, returning it to an empty setup state.',
  },
  resetDescription: {
    id: 'interview.familyPedigree.resetDescription',
    defaultMessage:
      'This will delete all family members and relationships. This action cannot be undone.',
    description:
      'Destructive confirmation explaining that all family members and their relationships will be removed and that this reset cannot be undone.',
  },
  reset: {
    id: 'interview.familyPedigree.reset',
    defaultMessage: 'Reset',
    description:
      'Short confirmation action that executes the family-tree reset described in the dialog.',
  },
  copied: {
    id: 'interview.familyPedigree.copied',
    defaultMessage: 'Copied to clipboard!',
    description:
      'Temporary feedback on the development-only network-data copy button after JSON has reached the clipboard.',
  },
  dump: {
    id: 'interview.familyPedigree.dump',
    defaultMessage: 'Dump',
    description:
      'Development-only button copying the current family graph as JSON for debugging. It is not a participant data-export workflow.',
  },
  load: {
    id: 'interview.familyPedigree.load',
    defaultMessage: 'Load',
    description:
      'Development-only action and browser prompt for loading family-graph JSON from the clipboard. Keep JSON as the technical format name.',
  },
  pasteJson: {
    id: 'interview.familyPedigree.pasteJson',
    defaultMessage: 'Paste network JSON:',
    description:
      'Development-only action and browser prompt for loading family-graph JSON from the clipboard. Keep JSON as the technical format name.',
  },
  buildTitle: {
    id: 'interview.familyPedigree.buildTitle',
    defaultMessage: 'Build your family pedigree',
    description:
      'Welcome heading shown before any relatives have been entered in the family pedigree interface.',
  },
  buildDefinition: {
    id: 'interview.familyPedigree.buildDefinition',
    defaultMessage:
      'A family pedigree is a diagram of your relatives and how they are connected to you.',
    description:
      'Plain-language explanation of the diagram before the participant starts entering their family. Avoid technical graph terminology.',
  },
  buildInstructions: {
    id: 'interview.familyPedigree.buildInstructions',
    defaultMessage:
      'To begin, we will ask a few quick questions and sketch out your immediate family for you. From there, you can click on any person to add more relatives and fill in their details.',
    description:
      'Introduction explaining that initial questions draw an immediate family, then selecting people lets the participant add relatives and edit details.',
  },
  buildGetStarted: {
    id: 'interview.familyPedigree.buildGetStarted',
    defaultMessage: 'Click the button below to get started.',
    description:
      'Instruction pointing to the initial family-wizard action below the welcome text.',
  },
  finalized: {
    id: 'interview.familyPedigree.finalized',
    defaultMessage: 'Your family pedigree has been finalized.',
    description:
      'Status shown when revisiting a committed family tree whose structure can no longer be edited without resetting it.',
  },
  resetPedigree: {
    id: 'interview.familyPedigree.resetPedigree',
    defaultMessage: 'Reset family pedigree',
    description:
      'Destructive reset action for an already finalized family tree, returning it to an empty setup state.',
  },
  buildComplete: {
    id: 'interview.familyPedigree.buildComplete',
    defaultMessage:
      'All tasks are complete. You can now finalize your family pedigree.',
    description:
      'Live screen-reader announcement when all checklist tasks become complete. It says finalization is now available, not that finalization has already happened.',
  },
  memberAdded: {
    id: 'interview.familyPedigree.memberAdded',
    defaultMessage:
      'Family member added. Your family pedigree now has {count, plural, one {# member} other {# members}}.',
    description:
      'Live screen-reader announcement after a relative is added or removed. count is the remaining number of family members excluding the participant; use locale plural rules.',
  },
  memberRemoved: {
    id: 'interview.familyPedigree.memberRemoved',
    defaultMessage:
      'Family member removed. Your family pedigree now has {count, plural, one {# member} other {# members}}.',
    description:
      'Live screen-reader announcement after a relative is added or removed. count is the remaining number of family members excluding the participant; use locale plural rules.',
  },
  buildHelpTitle: {
    id: 'interview.familyPedigree.buildHelpTitle',
    defaultMessage: 'Building the rest of your pedigree',
    description:
      'Title of guidance shown after the immediate-family wizard, explaining how to extend the family tree.',
  },
  buildHelpLead: {
    id: 'interview.familyPedigree.buildHelpLead',
    defaultMessage:
      'You now need to add family members to build out your pedigree.',
    description:
      'Opening explanation that more relatives can be added after the initial immediate family has been created.',
  },
  buildHelpMenu: {
    id: 'interview.familyPedigree.buildHelpMenu',
    defaultMessage:
      'Select any person in the diagram to open a menu where you can add parents, children, partners, and siblings. Not all options are available for every person — the menu will show the actions relevant to that family member.',
    description:
      "Explains how selecting a person opens actions for adding relatives and that available actions depend on that person's relationships.",
  },
  buildHelpChecklist: {
    id: 'interview.familyPedigree.buildHelpChecklist',
    defaultMessage:
      'Please try to be as thorough as possible. Use the checklist to keep track of your progress.',
    description:
      'Encourages thorough family recording and points to the checklist as a progress aid, without implying unknown answers should be guessed.',
  },
  buildHelpContinue: {
    id: 'interview.familyPedigree.buildHelpContinue',
    defaultMessage: 'When you are finished, click the next button to continue.',
    description:
      'Final instruction in the construction-help dialog, pointing to the interview navigation control after family entry is complete.',
  },
  buildHelpImage: {
    id: 'interview.familyPedigree.buildHelpImage',
    defaultMessage:
      'Example of the context menu showing options to add parent, child, partner, sibling, edit, or delete',
    description:
      'Alternative text for an illustration of the person context menu. Name its add-relative, edit and delete functions without relying on text embedded in the image.',
  },
  buildHelpCaption: {
    id: 'interview.familyPedigree.buildHelpCaption',
    defaultMessage: 'Select a person to see this menu',
    description:
      'Caption below the context-menu illustration explaining that the menu appears when a person is selected.',
  },
  gotIt: {
    id: 'interview.familyPedigree.gotIt',
    defaultMessage: 'Got it',
    description:
      'Acknowledgment action dismissing the construction-help dialog so the participant can continue building the tree.',
  },
  addChild: {
    id: 'interview.familyPedigree.addChild',
    defaultMessage: 'Add child',
    description:
      'Person-context-menu action and wizard title for adding this relative of the selected person, who may be someone other than the participant.',
  },
  childDetails: {
    id: 'interview.familyPedigree.childDetails',
    defaultMessage: 'Child details',
    description:
      'Wizard step title collecting details for the new relative. The family relationship is relative to the person whose context menu opened the wizard.',
  },
  biologicalParents: {
    id: 'interview.familyPedigree.biologicalParents',
    defaultMessage: 'Biological parents',
    description:
      'Wizard step title identifying the genetic contributors to the person being added or edited. Gestation and social parents are captured separately.',
  },
  otherParents: {
    id: 'interview.familyPedigree.otherParents',
    defaultMessage: 'Other parents',
    description:
      'Wizard step title for non-biological parental figures, separate from the two genetic contributors.',
  },
  additionalParents: {
    id: 'interview.familyPedigree.additionalParents',
    defaultMessage: 'Additional parents',
    description:
      'Wizard step title for non-biological parental figures, separate from the two genetic contributors.',
  },
  parentPartnerships: {
    id: 'interview.familyPedigree.parentPartnerships',
    defaultMessage: 'Parent partnerships',
    description:
      'Wizard step title for romantic relationships among the recorded parents, not for the parent-child relationships.',
  },
  addSibling: {
    id: 'interview.familyPedigree.addSibling',
    defaultMessage: 'Add sibling',
    description:
      'Person-context-menu action and wizard title for adding this relative of the selected person, who may be someone other than the participant.',
  },
  siblingDetails: {
    id: 'interview.familyPedigree.siblingDetails',
    defaultMessage: 'Sibling details',
    description:
      'Wizard step title collecting details for the new relative. The family relationship is relative to the person whose context menu opened the wizard.',
  },
  yourBiologicalParents: {
    id: 'interview.familyPedigree.yourBiologicalParents',
    defaultMessage: 'Your Biological Parents',
    description:
      "Wizard title when recording the participant's own genetic parents. Keep the complete possessive phrase together.",
  },
  namedBiologicalParents: {
    id: 'interview.familyPedigree.namedBiologicalParents',
    defaultMessage: "{name}'s Biological Parents",
    description:
      'Whole wizard title for the biological parents of a named relative. name is the unchanged entered name; translate the possessive grammar.',
  },
  personBiologicalParents: {
    id: 'interview.familyPedigree.personBiologicalParents',
    defaultMessage: "This Person's Biological Parents",
    description:
      'Wizard title for biological parents when the selected person has no entered name. Keep the complete generic-subject phrase together.',
  },
  closeSetupQuestion: {
    id: 'interview.familyPedigree.closeSetupQuestion',
    defaultMessage: 'Close family pedigree setup?',
    description:
      'Confirmation title when attempting to abandon the unfinished initial family wizard.',
  },
  closeSetupDescription: {
    id: 'interview.familyPedigree.closeSetupDescription',
    defaultMessage:
      'If you continue, all information you have entered in this family pedigree will be lost. You will need to start again.',
    description:
      'Warning that closing the unfinished family wizard discards all information entered there and requires starting the wizard again.',
  },
  closeLoseProgress: {
    id: 'interview.familyPedigree.closeLoseProgress',
    defaultMessage: 'Close and lose progress',
    description:
      'Destructive confirmation action that abandons the initial family wizard and discards its unfinished entries.',
  },
  continueSetup: {
    id: 'interview.familyPedigree.continueSetup',
    defaultMessage: 'Continue setup',
    description:
      "Cancel-abandonment action that keeps the initial family wizard open and preserves the participant's progress.",
  },
  introduction: {
    id: 'interview.familyPedigree.introduction',
    defaultMessage: 'Introduction',
    description:
      "Wizard step heading above the protocol-author's introduction. Only this generic heading is translated; the authored content below is not.",
  },
  referToParents: {
    id: 'interview.familyPedigree.referToParents',
    defaultMessage: 'How we’ll refer to your parents',
    description:
      'Wizard step title for choosing between gamete and mother/father terminology before parent details are collected.',
  },
  aboutYou: {
    id: 'interview.familyPedigree.aboutYou',
    defaultMessage: 'About you',
    description:
      "Wizard step title for recording the participant's own birth-recorded sex, before asking about relatives.",
  },
  partnerChildren: {
    id: 'interview.familyPedigree.partnerChildren',
    defaultMessage: 'Partner and children',
    description:
      "Wizard step title asking about the participant's current partner and the children they have with that partner.",
  },
  childrenDetails: {
    id: 'interview.familyPedigree.childrenDetails',
    defaultMessage: 'Children details',
    description:
      "Wizard step title collecting each child's details and biological parentage.",
  },
  buildAccessible: {
    id: 'interview.familyPedigree.buildAccessible',
    defaultMessage: 'Build family pedigree',
    description:
      'Accessible name of the icon button that launches the initial family setup wizard from the welcome screen.',
  },
  createNewPerson: {
    id: 'interview.familyPedigree.createNewPerson',
    defaultMessage: 'Create a new person',
    description:
      'Person-selection option creating a new relative instead of reusing an existing graph person. The stored option key remains new.',
  },
  whoCarried: {
    id: 'interview.familyPedigree.whoCarried',
    defaultMessage: 'Who carried the pregnancy?',
    description:
      "Question and help identifying the person who carried a child's pregnancy, separately from the egg and sperm contributors. An existing person can be reused or a new one created.",
  },
  selectCarrier: {
    id: 'interview.familyPedigree.selectCarrier',
    defaultMessage:
      'Select the person who carried the pregnancy, or create a new person.',
    description:
      "Question and help identifying the person who carried a child's pregnancy, separately from the egg and sperm contributors. An existing person can be reused or a new one created.",
  },
  personCarried: {
    id: 'interview.familyPedigree.personCarried',
    defaultMessage: 'Did this person carry the pregnancy?',
    description:
      'Yes/no question asking whether the selected egg contributor also carried the pregnancy. It does not infer gestation from sex or parental title.',
  },
  otherCarrierHint: {
    id: 'interview.familyPedigree.otherCarrierHint',
    defaultMessage:
      "If someone else carried the pregnancy (e.g. a gestational carrier or surrogate), select 'No'.",
    description:
      'Help explaining when to answer no to whether the egg contributor carried the pregnancy; a no answer enables selecting a separate gestational carrier.',
  },
  sexPreferNotToSay: {
    id: 'interview.familyPedigree.sexPreferNotToSay',
    defaultMessage: 'Prefer not to say',
    description:
      'Birth-recorded-sex answer declining disclosure. Keep distinct from the unknown answer; the two choices are stored separately.',
  },
  currentPartners: {
    id: 'interview.familyPedigree.currentPartners',
    defaultMessage: 'Current partners',
    description:
      'Radio answer describing the romantic relationship between two named people: ongoing, former, or never romantically involved. These options do not describe co-parenting.',
  },
  exPartners: {
    id: 'interview.familyPedigree.exPartners',
    defaultMessage: 'Ex-partners',
    description:
      'Radio answer describing the romantic relationship between two named people: ongoing, former, or never romantically involved. These options do not describe co-parenting.',
  },
  neverPartners: {
    id: 'interview.familyPedigree.neverPartners',
    defaultMessage: 'Never partners',
    description:
      'Radio answer describing the romantic relationship between two named people: ongoing, former, or never romantically involved. These options do not describe co-parenting.',
  },
  whoParent: {
    id: 'interview.familyPedigree.whoParent',
    defaultMessage: 'Who is this parent?',
    description:
      'Caption and help for reusing an existing person as a parent or creating a new person, avoiding duplicate relatives in the graph.',
  },
  selectExistingPerson: {
    id: 'interview.familyPedigree.selectExistingPerson',
    defaultMessage: 'Select an existing person or create a new one.',
    description:
      'Caption and help for reusing an existing person as a parent or creating a new person, avoiding duplicate relatives in the graph.',
  },
  parentType: {
    id: 'interview.familyPedigree.parentType',
    defaultMessage: 'Parent type',
    description:
      'Caption for choosing the new parent relationship type: biological, social, donor or surrogate. The displayed label does not change the stored type identifier.',
  },
  newParentAndPartner: {
    id: 'interview.familyPedigree.newParentAndPartner',
    defaultMessage: 'Is {name} a current or former partner of the new parent?',
    description:
      'Whole question about a current or former romantic relationship between an existing parent and the newly added parent. name is the existing person’s literal entered name or localized fallback. The answer options distinguish current, former and never partners.',
  },
  addParent: {
    id: 'interview.familyPedigree.addParent',
    defaultMessage: 'Add parent',
    description:
      'Person-context-menu action and wizard title for adding this relative of the selected person, who may be someone other than the participant.',
  },
  parentDetails: {
    id: 'interview.familyPedigree.parentDetails',
    defaultMessage: 'Parent details',
    description:
      'Wizard step title collecting details for the new relative. The family relationship is relative to the person whose context menu opened the wizard.',
  },
  partnerships: {
    id: 'interview.familyPedigree.partnerships',
    defaultMessage: 'Partnerships',
    description:
      'Wizard step heading for romantic relationships involving the newly added parent and existing parents.',
  },
  raisedThemRole: {
    id: 'interview.familyPedigree.raisedThemRole',
    defaultMessage: 'Parent who raised them',
    description:
      'Social-parent role option for someone who raised the relative currently being added, rather than the participant.',
  },
  otherAdditionalParentsIntro: {
    id: 'interview.familyPedigree.otherAdditionalParentsIntro',
    defaultMessage:
      "Please tell us about each of this person's additional parents. This includes step-parents, adoptive parents, or other people who played a parental role in their life.",
    description:
      "Instructions about additional non-biological parents of the relative currently being entered. This is about that person's upbringing, not the participant's own upbringing.",
  },
  otherAdditionalParents: {
    id: 'interview.familyPedigree.otherAdditionalParents',
    defaultMessage: 'Did this person have any additional parents?',
    description:
      'Questions determining whether a relative has additional social parents and how many repeated parent forms to show.',
  },
  otherAdditionalParentsHint: {
    id: 'interview.familyPedigree.otherAdditionalParentsHint',
    defaultMessage:
      'This includes adoptive parents, stepparents, or any other parents who are not biological parents.',
    description:
      "Instructions about additional non-biological parents of the relative currently being entered. This is about that person's upbringing, not the participant's own upbringing.",
  },
  otherAdditionalParentsCount: {
    id: 'interview.familyPedigree.otherAdditionalParentsCount',
    defaultMessage: 'How many additional parents did they have?',
    description:
      'Questions determining whether a relative has additional social parents and how many repeated parent forms to show.',
  },
  newCarrier: {
    id: 'interview.familyPedigree.newCarrier',
    defaultMessage: 'New gestational carrier',
    description:
      'Fallback reference to a newly entered, unnamed person who carried the pregnancy. New means entered in the current wizard, not a new pregnancy.',
  },
  unknownCarrier: {
    id: 'interview.familyPedigree.unknownCarrier',
    defaultMessage: 'Unknown gestational carrier',
    description:
      'Fallback reference to the person who carried the pregnancy when their identity is unknown.',
  },
  newPartnershipIntro: {
    id: 'interview.familyPedigree.newPartnershipIntro',
    defaultMessage:
      'We now want to ask about relationships between the parents you named. This includes current and past romantic partnerships, but <strong>not co-parenting partnerships</strong> where the parents were never romantically involved.',
    description:
      "Explains romantic partnerships among a relative's recorded parents. strong emphasizes the exclusion of non-romantic co-parenting; preserve the complete distinction.",
  },
  arePartners: {
    id: 'interview.familyPedigree.arePartners',
    defaultMessage: 'Are {people} partners?',
    description:
      'Whole question about a current or former romantic relationship. people is the current locale’s formatted list of two literal entered names or localized role fallbacks; do not add a conjunction or infer a gender.',
  },
  addPartner: {
    id: 'interview.familyPedigree.addPartner',
    defaultMessage: 'Add partner',
    description:
      'Person-context-menu action and wizard title for adding this relative of the selected person, who may be someone other than the participant.',
  },
  addParentFirst: {
    id: 'interview.familyPedigree.addParentFirst',
    defaultMessage: 'Add a parent first',
    description:
      'Disabled-menu explanation: a parent must be recorded for the selected person before a sibling can be added through this action.',
  },
  edit: {
    id: 'interview.familyPedigree.edit',
    defaultMessage: 'Edit',
    description:
      "Context-menu action and dialog title for editing a recorded family member's details without replacing their graph identity.",
  },
  biologicalKey: {
    id: 'interview.familyPedigree.biologicalKey',
    defaultMessage: 'Biological parent (incl. donor, surrogate)',
    description:
      'Legend label for solid parent-child connectors in the current pedigree notation, including the donor and surrogate relationship categories represented by that line style.',
  },
  socialKey: {
    id: 'interview.familyPedigree.socialKey',
    defaultMessage: 'Social parent (adoptive, step)',
    description:
      'Legend label for dashed parent-child connectors representing social parents, including adoptive parents and stepparents.',
  },
  adopted: {
    id: 'interview.familyPedigree.adopted',
    defaultMessage: 'Adopted',
    description:
      "Accessible description of adoption brackets drawn around a person's diagram symbol. Do not infer that person's sex.",
  },
  add: {
    id: 'interview.familyPedigree.add',
    defaultMessage: 'Add',
    description:
      'Submit action in the add-partner form; creates the selected relationship after the person details are entered.',
  },
  unnamedPerson: {
    id: 'interview.familyPedigree.unnamedPerson',
    defaultMessage: 'Unnamed person',
    description:
      "Fallback row label in the editor's partnership matrix when the related person has no usable name or computed relationship label.",
  },
  thisPerson: {
    id: 'interview.familyPedigree.thisPerson',
    defaultMessage: 'this person',
    description:
      'Generic person reference used in an edit or delete question only when neither entered name nor generated relationship label is available.',
  },
  editPartnerships: {
    id: 'interview.familyPedigree.editPartnerships',
    defaultMessage:
      'Are these people current or ex-partners of <strong>{name}</strong>?',
    description:
      'Matrix question editing existing romantic relationships of a recorded person. name is an entered name or localized role; keep its strong emphasis. strong emphasizes the literal person name; render it as rich text without interpreting markup in the name.',
  },
  detailsUpdatedFor: {
    id: 'interview.familyPedigree.detailsUpdatedFor',
    defaultMessage: 'Details updated for {name}.',
    description:
      'Live screen-reader confirmation after saving a person editor. name is the newly submitted name, not the name the dialog originally opened with.',
  },
  detailsUpdated: {
    id: 'interview.familyPedigree.detailsUpdated',
    defaultMessage: 'Details updated.',
    description:
      'Live screen-reader confirmation after saving a person editor when no name remains. Do not invent or expose an earlier name.',
  },
  deleteNamedPerson: {
    id: 'interview.familyPedigree.deleteNamedPerson',
    defaultMessage: 'Delete {name}?',
    description:
      'Whole destructive confirmation title for removing a relative. name is an entered name or a live localized relationship fallback and remains a separate value.',
  },
  deletePersonDescription: {
    id: 'interview.familyPedigree.deletePersonDescription',
    defaultMessage:
      'This will delete this person and all of their relationships from the family pedigree. This action cannot be undone.',
    description:
      'Destructive confirmation explaining that removing a person also removes every relationship involving them from this family tree and cannot be undone.',
  },
  deletePerson: {
    id: 'interview.familyPedigree.deletePerson',
    defaultMessage: 'Delete person',
    description:
      'Action confirming removal of the person and their relationships after the destructive warning has been read.',
  },
});
