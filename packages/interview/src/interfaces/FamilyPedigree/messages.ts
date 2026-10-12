import { defineMessages } from '@codaco/app-i18n/messages';

export const messages = defineMessages({
  canvasLabel: {
    id: 'interview.familyPedigree.canvasLabel',
    defaultMessage: 'Your family',
    description:
      'Accessible name for the area showing the family members the participant has added, drawn as a family tree.',
  },
  personAccessibleName: {
    id: 'interview.familyPedigree.personAccessibleName',
    defaultMessage: '{isYou, select, true {You} other {{name}}}',
    description:
      'Accessible name of a family member’s symbol in the family tree. {name} is the person’s name, exactly as the participant typed it, or, when it is not known, how they are related to the participant.',
  },
  personAdoptedDescription: {
    id: 'interview.familyPedigree.personAdoptedDescription',
    defaultMessage: 'Adopted.',
    description:
      'Read out after the name of a family member’s symbol in the family tree when the person was adopted, which the tree shows by drawing brackets around their symbol.',
  },
  personMissingDetailsDescription: {
    id: 'interview.familyPedigree.personMissingDetailsDescription',
    defaultMessage: 'Some details are missing.',
    description:
      'Read out after the name of a family member’s symbol in the family tree when required details about the person have not been given yet, which the tree shows with a warning icon.',
  },
  actionsLabel: {
    id: 'interview.familyPedigree.actionsLabel',
    defaultMessage:
      '{isYou, select, true {Add your relatives} other {Add relatives of {name}}}',
    description:
      'Accessible name of the group of buttons that appears around a selected family member, used to add their parent, sibling, partner or child.',
  },
  showWholeFamily: {
    id: 'interview.familyPedigree.showWholeFamily',
    defaultMessage: 'Show the whole family',
    description:
      'Accessible name of the toolbar icon button that zooms and moves the family tree so everyone in it fits on screen. Shown as an icon, without a tooltip.',
  },
  trackerProgressLabel: {
    id: 'interview.familyPedigree.trackerProgressLabel',
    defaultMessage:
      '{complete, select, true {Your family tree has everything needed} other {Family tree {percent, number, percent} complete}}. Show what’s still needed.',
    description:
      'Accessible name of the round progress indicator in the corner of the family tree, which opens the list of family members still needed. percent is a fraction between 0 and 1.',
  },
  addedAnnouncement: {
    id: 'interview.familyPedigree.addedAnnouncement',
    defaultMessage: '{name} added to your family.',
    description:
      'Screen reader announcement after a family member is added. {name} is their name or, when it is not known, how they are related to the participant.',
  },
  savedAnnouncement: {
    id: 'interview.familyPedigree.savedAnnouncement',
    defaultMessage: 'Details saved.',
    description:
      'Screen reader announcement after a family member’s details are saved.',
  },
  removedWithOthersAnnouncement: {
    id: 'interview.familyPedigree.removedWithOthersAnnouncement',
    defaultMessage:
      '{count, plural, one {{name} and one other person removed from your family.} other {{name} and # other people removed from your family.}}',
    description:
      'Screen reader announcement after a family member is removed along with the people who were connected to the participant only through them. {name} is the name of the person the participant chose to remove or, when it is not known, how they are related to the participant; count is how many other people were removed with them.',
  },
  removedAnnouncement: {
    id: 'interview.familyPedigree.removedAnnouncement',
    defaultMessage: '{name} removed from your family.',
    description:
      'Screen reader announcement after a family member is removed. {name} is their name or, when it is not known, how they are related to the participant.',
  },
  toolsLabel: {
    id: 'interview.familyPedigree.toolsLabel',
    defaultMessage: 'Family tree tools',
    description:
      'Accessible name of the toolbar above the family tree, which switches between adding or editing people, connecting two people, and removing the connection between two people.',
  },
  toolGroupLabel: {
    id: 'interview.familyPedigree.toolGroupLabel',
    defaultMessage: 'What clicking a person does',
    description:
      'Accessible name of the pair of buttons in the toolbar that choose what selecting a person does.',
  },
  framingChosenAnnouncement: {
    id: 'interview.familyPedigree.framingChosenAnnouncement',
    defaultMessage:
      '{framing, select, gamete {Family members are now described with words like egg parent, sperm parent and sibling.} other {Family members are now described with words like mother, father, sister and brother.}}',
    description:
      'Screen-reader announcement after the participant chooses the words used to describe family members, which changes the labels of everyone they have not named. {framing} is "gamete" for the words that do not depend on gender, otherwise the words that follow gender.',
  },
  connectHintLinking: {
    id: 'interview.familyPedigree.connectHintLinking',
    defaultMessage:
      '{isYou, select, true {Now select the person to connect to you.} other {Now select the person to connect to “{name}”.}}',
    description:
      'Read out to screen reader users, not shown, once the first of two people to connect has been selected. name is that person’s name or how they are related to the participant.',
  },
  connectedParentAnnouncement: {
    id: 'interview.familyPedigree.connectedParentAnnouncement',
    defaultMessage: '{relationship} ({kind})',
    description:
      'Screen reader announcement after connecting two people as parent and child. relationship is the chosen menu option (for example “Julie” is a parent of “Rob”); kind is the kind of parent chosen (for example Adoptive parent).',
  },
  disconnectHintLinking: {
    id: 'interview.familyPedigree.disconnectHintLinking',
    defaultMessage:
      '{isYou, select, true {Now select the person to disconnect from you.} other {Now select the person to disconnect from “{name}”.}}',
    description:
      'Read out to screen reader users, not shown, once the first of two people to disconnect has been selected. name is that person’s name or how they are related to the participant.',
  },
  disconnectedAnnouncement: {
    id: 'interview.familyPedigree.disconnectedAnnouncement',
    defaultMessage:
      '{firstIsYou, select, true {The connection between you and “{second}” was removed.} other {The connection between “{first}” and “{second}” was removed.}}',
    description:
      'Screen reader announcement after the connection between two people is removed. first and second are their names or how they are related to the participant.',
  },
  siblingsAnsweredAnnouncement: {
    id: 'interview.familyPedigree.siblingsAnsweredAnnouncement',
    defaultMessage:
      '{isYou, select, true {Recorded that you have no biological brothers or sisters.} other {Recorded that “{name}” has no biological brothers or sisters.}}',
    description:
      'Screen reader announcement after answering, from the list of family members still needed, that a person has no siblings. name is the person’s name or how they are related to the participant.',
  },
  childrenAnsweredAnnouncement: {
    id: 'interview.familyPedigree.childrenAnsweredAnnouncement',
    defaultMessage:
      '{isYou, select, true {Recorded that you have no biological children.} other {Recorded that “{name}” has no biological children.}}',
    description:
      'Screen reader announcement after answering, from the list of family members still needed, that a person has no children. name is the person’s name or how they are related to the participant.',
  },
  reproductiveRoleDescription: {
    id: 'interview.familyPedigree.reproductiveRoleDescription',
    defaultMessage:
      '{role, select, donor {egg or sperm donor} traditionalSurrogate {egg donor who carried the pregnancy} other {surrogate}}',
    description:
      'Read out with a family member’s symbol in the family tree, for each part they played in someone else’s conception or birth (the tree draws no mark for these). "donor" is someone who donated an egg or sperm; "traditionalSurrogate" is an egg donor who also carried the pregnancy; "other" is a surrogate who carried the pregnancy without a genetic tie to the child. When someone has more than one role, the phrases are joined into a list, so write each as it would appear inside a sentence (lower case in English).',
  },
});
