import { defineMessages } from '@codaco/app-i18n/messages';

export const messages = defineMessages({
  showWholeFamily: {
    id: 'interview.familyPedigree.showWholeFamily',
    defaultMessage: 'Show the whole family',
    description:
      'Accessible name of the toolbar icon button that zooms and moves the family tree so everyone in it fits on screen. Also the heading of the button’s tooltip.',
  },
  showWholeFamilyDescription: {
    id: 'interview.familyPedigree.showWholeFamilyDescription',
    defaultMessage: 'Fit your whole family tree on the screen.',
    description:
      'Tooltip text, under the heading “Show the whole family”, of the toolbar icon button that zooms and moves the family tree so everyone in it fits on screen. Read by participants.',
  },
  zoomInDescription: {
    id: 'interview.familyPedigree.zoomInDescription',
    defaultMessage:
      'Make your family tree bigger, to see part of it more closely.',
    description:
      'Tooltip text, under the heading “Zoom in”, of the family tree toolbar button that increases magnification. Read by participants.',
  },
  zoomOutDescription: {
    id: 'interview.familyPedigree.zoomOutDescription',
    defaultMessage: 'Make your family tree smaller, to see more of it at once.',
    description:
      'Tooltip text, under the heading “Zoom out”, of the family tree toolbar button that decreases magnification. Read by participants.',
  },
  undoDescription: {
    id: 'interview.familyPedigree.undoDescription',
    defaultMessage: 'Undo your last change to your family tree.',
    description:
      'Tooltip text, under the heading “Undo”, of the family tree toolbar button that reverses the most recent change: adding, editing or removing a family member, connecting or disconnecting two people, or selecting someone for a question. Read by participants.',
  },
  redoDescription: {
    id: 'interview.familyPedigree.redoDescription',
    defaultMessage: 'Bring back the change you undid.',
    description:
      'Tooltip text, under the heading “Redo”, of the family tree toolbar button that makes again a change to the family tree that Undo reversed. Read by participants.',
  },
  pointerTool: {
    id: 'interview.familyPedigree.pointerTool',
    defaultMessage: 'Add and edit',
    description:
      'Name of the family tree toolbar tool that is chosen by default: with it, selecting a family member opens their details, and buttons beside them add a parent, sibling, partner or child. Shown as the tool’s tooltip heading and read as its accessible name.',
  },
  connectTool: {
    id: 'interview.familyPedigree.connectTool',
    defaultMessage: 'Connect',
    description:
      'Name of the family tree toolbar tool that joins two people already in the tree with a relationship. Shown as the tool’s tooltip heading and read as its accessible name.',
  },
  connectHint: {
    id: 'interview.familyPedigree.connectHint',
    defaultMessage: 'Select a person, then select another to connect them.',
    description:
      'Shown over the family tree while the Connect tool is chosen, telling the participant how to join two people already in the tree.',
  },
  disconnectTool: {
    id: 'interview.familyPedigree.disconnectTool',
    defaultMessage: 'Disconnect',
    description:
      'Name of the family tree toolbar tool that removes a relationship line between two people. Shown as the tool’s tooltip heading and read as its accessible name.',
  },
  disconnectHint: {
    id: 'interview.familyPedigree.disconnectHint',
    defaultMessage:
      'Select a person, then select someone they are connected to, to remove that connection.',
    description:
      'Shown over the family tree while the Disconnect tool is chosen, telling the participant how to remove a relationship line.',
  },
  framingControlLabel: {
    id: 'interview.familyPedigree.framingControlLabel',
    defaultMessage: 'Wording',
    description:
      'Name of the family tree toolbar button that opens a choice between sets of words for relatives, such as mother and father, or egg parent and sperm parent. Shown as its tooltip heading and read as its accessible name.',
  },
  framingChoiceTitle: {
    id: 'interview.familyPedigree.framingChoiceTitle',
    defaultMessage: 'How should we describe your family?',
    description:
      'Question over the choice between sets of words for relatives, such as mother and father, or egg parent and sperm parent.',
  },
  framingChoiceDescription: {
    id: 'interview.familyPedigree.framingChoiceDescription',
    defaultMessage:
      'Choose the words you would like us to use for the people in your family. You can change this at any time.',
    description:
      'Explanation under the question asking which set of words for relatives the family tree should use.',
  },
  pointerToolDescription: {
    id: 'interview.familyPedigree.pointerToolDescription',
    defaultMessage:
      'Select a family member to edit their details or add their relatives.',
    description:
      'Tooltip text, under the heading “Add and edit” (or the stage’s own name for it), of the family tree toolbar tool that is chosen by default: with it, selecting a family member opens their details, and buttons beside them add a parent, sibling, partner or child. Read by participants.',
  },
  connectToolDescription: {
    id: 'interview.familyPedigree.connectToolDescription',
    defaultMessage:
      'Select two family members to connect them and say how they are related.',
    description:
      'Tooltip text, under the heading “Connect” (or the stage’s own name for it), of the family tree toolbar tool that joins two people already in the tree: the participant selects one, then another, then chooses how they are related, such as parent or partner. Read by participants.',
  },
  disconnectToolDescription: {
    id: 'interview.familyPedigree.disconnectToolDescription',
    defaultMessage:
      'Select two connected family members to remove the connection between them.',
    description:
      'Tooltip text, under the heading “Disconnect” (or the stage’s own name for it), of the family tree toolbar tool that removes a relationship line: the participant selects one person, then someone they are connected to, and confirms. Read by participants.',
  },
  framingControlDescription: {
    id: 'interview.familyPedigree.framingControlDescription',
    defaultMessage:
      'Choose the relationship words your family tree uses for your relatives.',
    description:
      'Tooltip text, under the heading “Wording” (or the stage’s own name for it), of the family tree toolbar button that opens a choice between sets of words for relatives, such as mother and father, or egg parent and sperm parent. Read by participants.',
  },
  trackerAllDetails: {
    id: 'interview.familyPedigree.trackerAllDetails',
    defaultMessage: 'Add required details for all family members',
    description:
      'An item at the end of the family tree’s progress list, read by the participant, standing for the details the researcher requires of every person in the family (such as sex assigned at birth). It is shown while nobody already in the family is missing any, as a plain item while other relatives still have to be added, and ticked and struck through once nothing else is needed. While some are missing, the list instead names each person whose details are missing.',
  },
});
