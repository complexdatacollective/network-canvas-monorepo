import { defineMessages } from '@codaco/app-i18n/messages';

/** Built-in interface controls. Protocol-authored labels and collected values remain literal. */
export const interfaceMessages = defineMessages({
  passphraseAccepted: {
    id: 'interview.interfaces.passphraseAccepted',
    defaultMessage: 'Passphrase accepted! Click "Next" to continue.',
    description:
      'Success message after the participant enters, on the anonymisation screen, the passphrase they chose earlier in the interview. Next refers to the interview navigation arrow.',
  },
  confirmPassphrase: {
    id: 'interview.interfaces.confirmPassphrase',
    defaultMessage: 'Confirm Passphrase',
    description:
      'Label of the second anonymisation password field; this is confirmation of the passphrase, not a separate password.',
  },
  submit: {
    id: 'interview.interfaces.submit',
    defaultMessage: 'Submit',
    description:
      'Accessible name of icon-only or visually hidden form submit buttons in anonymisation and slide forms.',
  },
  discardChangesTitle: {
    id: 'interview.interfaces.discardChangesTitle',
    defaultMessage: 'Discard changes?',
    description:
      'Title of the warning shown when a participant tries to leave a form containing invalid unsaved answers.',
  },
  discardChangesDescription: {
    id: 'interview.interfaces.discardChangesDescription',
    defaultMessage:
      'This form contains invalid data, so it cannot be saved. If you continue it will be reset, and your changes will be lost. Do you want to discard your changes?',
    description:
      'Warning when leaving a form with invalid unsaved answers. Continuing resets the form, so its unsaved changes will be lost.',
  },
  discardOvertakenEditDescription: {
    id: 'interview.interfaces.discardOvertakenEditDescription',
    defaultMessage:
      'Undo or redo changed an answer while you were editing it, so your edit has not been saved. To keep your edit, change that answer again. If you continue, your edit will be lost.',
    description:
      'Warning when leaving a side panel after undo or redo changed an answer the participant had edited but not yet saved. The edit stays on screen, and is saved only if the participant changes that answer again.',
  },
  discardChanges: {
    id: 'interview.interfaces.discardChanges',
    defaultMessage: 'Discard changes',
    description:
      'Confirmation action that leaves an invalid form and discards its unsaved changes.',
  },
  scrollForQuestions: {
    id: 'interview.interfaces.scrollForQuestions',
    defaultMessage: 'Scroll to see more questions',
    description:
      'Hint at the bottom of a long personal-information form indicating that more questions are below the visible area.',
  },
  emptyValue: {
    id: 'interview.interfaces.emptyValue',
    defaultMessage: 'No value',
    description:
      'Shown in place of a roster detail that has no value: a blank field or an empty list. Replaces a bare dash so screen readers announce it.',
  },
  errorHeading: {
    id: 'interview.interfaces.errorHeading',
    defaultMessage: 'Something went wrong',
    description:
      'Short heading above an external-list loading error. This heading intentionally has no final period.',
  },
  externalDataUnavailable: {
    id: 'interview.interfaces.externalDataUnavailable',
    defaultMessage: 'External data could not be loaded.',
    description:
      'Explanation shown when a configured external list of people could not be loaded.',
  },
  rosterAlreadyAdded: {
    id: 'interview.interfaces.rosterAlreadyAdded',
    defaultMessage: 'There is nothing left to add from this list.',
    description:
      'Empty state of an external roster when there is nothing left to add: the list is empty, or every entry has already been added to the interview network.',
  },
  availableRosterNodes: {
    id: 'interview.interfaces.availableRosterNodes',
    defaultMessage: 'Available Roster Nodes',
    description:
      'Accessible name used by drag-and-drop announcements for the external roster entries that can still be added.',
  },
  resizePanels: {
    id: 'interview.interfaces.resizePanels',
    defaultMessage: 'Resize panel and node list areas',
    description:
      'Accessible name of the divider between the source panel and the list of added people; dragging or keyboard controls resize the two areas.',
  },
  availableItems: {
    id: 'interview.interfaces.availableItems',
    defaultMessage: 'List of available items to add',
    description:
      'Accessible name of the collection containing external roster entries that can be added.',
  },
  addedNodes: {
    id: 'interview.interfaces.addedNodes',
    defaultMessage: 'Added Nodes',
    description:
      'Accessible name used by drag-and-drop announcements for the list of people already added to the network.',
  },
  quickAddInput: {
    id: 'interview.interfaces.quickAddInput',
    defaultMessage: 'Quick add input',
    description:
      'Accessible name of the active quick-add toggle while its name-entry field is open.',
  },
  quickAddInstructions: {
    id: 'interview.interfaces.quickAddInstructions',
    defaultMessage: 'Press <kbd>Enter</kbd> when you are finished.',
    description:
      'Tooltip beside the quick-add name field. The kbd tag marks the Enter key and must be preserved.',
  },
  entityName: {
    id: 'interview.interfaces.entityName',
    defaultMessage: '{entityLabel} name',
    description:
      'Accessible name for a new-item name field. entityLabel is the unchanged, researcher-authored label for the network entity type.',
  },
  addNamePlaceholder: {
    id: 'interview.interfaces.addNamePlaceholder',
    defaultMessage: 'Type a name, then press Enter',
    description:
      'Placeholder in the network-composer name field; pressing Enter adds the named item.',
  },
  resizePanel: {
    id: 'interview.interfaces.resizePanel',
    defaultMessage: 'Resize panel',
    description:
      'Accessible name of the draggable divider that changes the width of the network-composer editing panel.',
  },
  groupMembershipOptions: {
    id: 'interview.interfaces.groupMembershipOptions',
    defaultMessage: 'Group membership options',
    description:
      'Accessible name of the popover containing group membership choices in the network composer.',
  },
  groupMembershipPeople: {
    id: 'interview.interfaces.groupMembershipPeople',
    defaultMessage: 'Group membership for selected people',
    description:
      'Accessible name of the controls that set group membership for the currently selected people.',
  },
  composerTools: {
    id: 'interview.interfaces.composerTools',
    defaultMessage: 'Network composer tools',
    description:
      'Accessible name of the vertical toolbar used to create and edit a network.',
  },
  editingTools: {
    id: 'interview.interfaces.editingTools',
    defaultMessage: 'Editing tools',
    description:
      'Accessible name of the toolbar group for selection, adding people, creating connections, and group membership.',
  },
  select: {
    id: 'interview.interfaces.select',
    defaultMessage: 'Select',
    description:
      'Network-composer tool that selects existing people or connections for editing.',
  },
  addNode: {
    id: 'interview.interfaces.addNode',
    defaultMessage: 'Add node',
    description:
      'Accessible name of the network-composer tool that opens a field to add a new network item.',
  },
  drawEdge: {
    id: 'interview.interfaces.drawEdge',
    defaultMessage: 'Draw edge',
    description:
      'Accessible name of the network-composer tool that creates a connection between two items.',
  },
  groups: {
    id: 'interview.interfaces.groups',
    defaultMessage: 'Groups',
    description:
      'Network-composer tool label and narrative legend heading for groups of people.',
  },
  layoutTools: {
    id: 'interview.interfaces.layoutTools',
    defaultMessage: 'Layout tools',
    description:
      'Accessible name of the network-composer toolbar group that controls automatic positioning.',
  },
  automaticLayout: {
    id: 'interview.interfaces.automaticLayout',
    defaultMessage: 'Automatic layout',
    description:
      'Toggle that automatically positions people in the network composer.',
  },
  historyTools: {
    id: 'interview.interfaces.historyTools',
    defaultMessage: 'History tools',
    description:
      'Accessible name of the toolbar group containing undo and redo actions.',
  },
  undo: {
    id: 'interview.interfaces.undo',
    defaultMessage: 'Undo',
    description:
      'Toolbar action that reverses the most recent edit in the network composer.',
  },
  redo: {
    id: 'interview.interfaces.redo',
    defaultMessage: 'Redo',
    description:
      'Toolbar action that reapplies an edit that was undone in the network composer.',
  },
  layoutAndDrawing: {
    id: 'interview.interfaces.layoutAndDrawing',
    defaultMessage: 'Layout and drawing tools',
    description:
      'Accessible name of the narrative toolbar for automatic positioning and freehand annotations.',
  },
  layoutControls: {
    id: 'interview.interfaces.layoutControls',
    defaultMessage: 'Layout controls',
    description:
      'Accessible name of the narrative toolbar group that pauses or resumes automatic positioning.',
  },
  pauseAutomaticLayout: {
    id: 'interview.interfaces.pauseAutomaticLayout',
    defaultMessage: 'Pause automatic layout',
    description:
      'Accessible action that pauses automatic movement of the displayed people in a narrative view.',
  },
  resumeAutomaticLayout: {
    id: 'interview.interfaces.resumeAutomaticLayout',
    defaultMessage: 'Resume automatic layout',
    description:
      'Accessible action that resumes automatic movement of the displayed people in a narrative view.',
  },
  drawingControls: {
    id: 'interview.interfaces.drawingControls',
    defaultMessage: 'Drawing controls',
    description:
      'Accessible name of the narrative toolbar group for freehand annotations.',
  },
  disableDrawing: {
    id: 'interview.interfaces.disableDrawing',
    defaultMessage: 'Disable drawing',
    description:
      'Toggle action that turns off freehand drawing on the narrative canvas.',
  },
  enableDrawing: {
    id: 'interview.interfaces.enableDrawing',
    defaultMessage: 'Enable drawing',
    description:
      'Toggle action that turns on freehand drawing on the narrative canvas.',
  },
  unfreezeAnnotations: {
    id: 'interview.interfaces.unfreezeAnnotations',
    defaultMessage: 'Unfreeze annotations',
    description:
      'Toggle action that allows existing narrative annotations to be edited again.',
  },
  freezeAnnotations: {
    id: 'interview.interfaces.freezeAnnotations',
    defaultMessage: 'Freeze annotations',
    description:
      'Toggle action that locks existing narrative annotations in place.',
  },
  resetAnnotations: {
    id: 'interview.interfaces.resetAnnotations',
    defaultMessage: 'Reset annotations',
    description:
      'Action that clears the freehand annotations from the narrative canvas.',
  },
  presets: {
    id: 'interview.interfaces.presets',
    defaultMessage: 'Presets',
    description:
      'Accessible name of the narrative toolbar for switching between researcher-configured network views.',
  },
  dragToReposition: {
    id: 'interview.interfaces.dragToReposition',
    defaultMessage: 'Drag to reposition',
    description:
      'Accessible name of the handle that moves the floating narrative preset toolbar.',
  },
  presetNavigation: {
    id: 'interview.interfaces.presetNavigation',
    defaultMessage: 'Preset navigation',
    description:
      'Accessible name of the toolbar group that switches between researcher-configured narrative views.',
  },
  previousPreset: {
    id: 'interview.interfaces.previousPreset',
    defaultMessage: 'Previous preset',
    description:
      'Action that selects the previous researcher-configured narrative view.',
  },
  nextPreset: {
    id: 'interview.interfaces.nextPreset',
    defaultMessage: 'Next preset',
    description:
      'Action that selects the next researcher-configured narrative view.',
  },
  attributes: {
    id: 'interview.interfaces.attributes',
    defaultMessage: 'Attributes',
    description:
      'Narrative legend heading for attributes used to highlight people. Individual attribute labels come unchanged from the protocol.',
  },
  links: {
    id: 'interview.interfaces.links',
    defaultMessage: 'Links',
    description:
      'Narrative legend heading for displayed connection types. Individual connection labels come unchanged from the protocol.',
  },
  targetNodes: {
    id: 'interview.interfaces.targetNodes',
    defaultMessage: 'Target nodes',
    description:
      'Accessible name of the collection of people that can be selected in a one-to-many relationship question.',
  },
  ordinalContainer: {
    id: 'interview.interfaces.ordinalContainer',
    defaultMessage: "Container for the value ''{label}''",
    description:
      'Drag-and-drop name of a rating container. label is the unchanged researcher-authored ordinal response label; keep it as a value, not a translation key.',
  },
  showInstructions: {
    id: 'interview.interfaces.showInstructions',
    defaultMessage: 'Show instructions',
    description:
      'Accessible action that expands the floating instructions panel above a network view.',
  },
  hideInstructions: {
    id: 'interview.interfaces.hideInstructions',
    defaultMessage: 'Hide instructions',
    description:
      'Accessible action that collapses the floating instructions panel above a network view.',
  },
  returnedToDrawer: {
    id: 'interview.interfaces.returnedToDrawer',
    defaultMessage: 'Returned to the drawer.',
    description:
      'Screen-reader announcement after an item without a usable name is removed from the canvas and returned to the unplaced-items panel.',
  },
  namedReturnedToDrawer: {
    id: 'interview.interfaces.namedReturnedToDrawer',
    defaultMessage: '{name} returned to the drawer.',
    description:
      'Screen-reader announcement after an item is returned to the unplaced-items panel. name is its unchanged participant-entered or authored display name.',
  },
  categoryDrop: {
    id: 'interview.interfaces.categoryDrop',
    defaultMessage: 'Category: {label}',
    description:
      'Drag target announcement for a categorical response. label is the unchanged researcher-authored category label.',
  },
  categoryContents: {
    id: 'interview.interfaces.categoryContents',
    defaultMessage:
      'Category {label}, {count, plural, one {# item} other {# items}}',
    description:
      'Accessible name of a collapsed category container. label is its authored category label; count is the number of items currently in the container.',
  },
  categoryContentsExpanded: {
    id: 'interview.interfaces.categoryContentsExpanded',
    defaultMessage:
      'Category {label}, {count, plural, one {# item} other {# items}}, expanded',
    description:
      'Accessible name of an expanded category container. label is its authored label; count is the number of items currently in it.',
  },
  categoryList: {
    id: 'interview.interfaces.categoryList',
    defaultMessage: '{label} category',
    description:
      'Accessible name of the item list inside an expanded category. label is the unchanged researcher-authored category label.',
  },
  stubMap: {
    id: 'interview.interfaces.stubMap',
    defaultMessage: 'Stubbed map (click to select test feature)',
    description:
      'Accessible name of the test-only map placeholder used by automated interface tests; clicking it selects a fixture feature.',
  },
  mapUnavailableDescription: {
    id: 'interview.interfaces.mapUnavailableDescription',
    defaultMessage:
      'This can happen if your browser or device does not support the features the map requires (for example, WebGL). Try a different browser or device, or contact the study organizer. You may be able to continue your interview by selecting the next arrow.',
    description:
      'Recovery guidance after map initialization fails. The next arrow refers to the interview navigation control, not a map control.',
  },
  deselect: {
    id: 'interview.interfaces.deselect',
    defaultMessage: 'Deselect',
    description:
      'Action that clears the current outside-map-area selection so the participant can choose another location.',
  },
  zoomIn: {
    id: 'interview.interfaces.zoomIn',
    defaultMessage: 'Zoom in',
    description:
      'Accessible name of the map and family pedigree buttons that increase magnification. Sentence case.',
  },
  zoomOut: {
    id: 'interview.interfaces.zoomOut',
    defaultMessage: 'Zoom out',
    description:
      'Accessible name of the map and family pedigree buttons that decrease magnification. Sentence case.',
  },
  recenterMap: {
    id: 'interview.interfaces.recenterMap',
    defaultMessage: 'Recenter Map',
    description:
      'Accessible name of the map button that restores the researcher-configured starting center and zoom.',
  },
  outsideSelectableAreas: {
    id: 'interview.interfaces.outsideSelectableAreas',
    defaultMessage: 'Outside Selectable Areas',
    description:
      'Button used to indicate that the participant’s location lies outside the selectable map areas. The stored selection identifier is never translated.',
  },
  closeSearch: {
    id: 'interview.interfaces.closeSearch',
    defaultMessage: 'Close search',
    description:
      'Accessible name of the toggle while the geospatial place-search panel is open.',
  },
  searchLocation: {
    id: 'interview.interfaces.searchLocation',
    defaultMessage: 'Search location',
    description:
      'Accessible name of the toggle that opens the geospatial place-search panel.',
  },
  clearSearch: {
    id: 'interview.interfaces.clearSearch',
    defaultMessage: 'Clear search',
    description:
      'Accessible action that clears the current geospatial search query.',
  },
  searchSuggestions: {
    id: 'interview.interfaces.searchSuggestions',
    defaultMessage: 'Search suggestions',
    description:
      'Accessible name of the list of places returned by geospatial search, including its loading and empty states.',
  },
  searchFailed: {
    id: 'interview.interfaces.searchFailed',
    defaultMessage: 'Search could not be completed. Try again in a moment.',
    description:
      'Recoverable error when geospatial search could not run; it does not mean the place does not exist.',
  },
  mapMoved: {
    id: 'interview.interfaces.mapMoved',
    defaultMessage: 'Map moved to {place}.',
    description:
      'Screen-reader announcement after a selected search result moves the map. place is the unchanged place name returned by the map service.',
  },
  mapTitle: {
    id: 'interview.interfaces.mapTitle',
    defaultMessage: 'Map',
    description:
      'Accessible region name of the native Mapbox canvas in the geospatial interface.',
  },
  mapboxHomepage: {
    id: 'interview.interfaces.mapboxHomepage',
    defaultMessage: 'Mapbox homepage',
    description:
      'Accessible name of the native map logo link that opens the Mapbox homepage; preserve the Mapbox brand name.',
  },
  toggleAttribution: {
    id: 'interview.interfaces.toggleAttribution',
    defaultMessage: 'Toggle attribution',
    description:
      'Accessible name and tooltip of the native map control that expands or collapses map source credits; source credit text remains unchanged.',
  },
});
