import { defineMessages } from '@codaco/app-i18n/messages';

/** Built-in interface controls. Protocol-authored labels and collected values remain literal. */
export const interfaceMessages = defineMessages({
  passphraseSet: {
    id: 'interview.interfaces.passphraseSet',
    defaultMessage: 'Passphrase set successfully! Click "Next" to continue.',
    description:
      'Success message after the participant sets the anonymisation passphrase. Next refers to the interview navigation arrow.',
  },
  reenterPassphrase: {
    id: 'interview.interfaces.reenterPassphrase',
    defaultMessage: 'Re-enter your passphrase...',
    description:
      'Placeholder in the second anonymisation password field, where the participant repeats their new passphrase for confirmation.',
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
  finishConfirmation: {
    id: 'interview.interfaces.finishConfirmation',
    defaultMessage: 'Are you sure you want to finish the interview?',
    description:
      'Title of the confirmation dialog opened by the finish button at the end of an interview.',
  },
  finishInterview: {
    id: 'interview.interfaces.finishInterview',
    defaultMessage: 'Finish Interview',
    description:
      'End-of-interview page heading and confirmation action that finishes the current interview.',
  },
  finishDescription: {
    id: 'interview.interfaces.finishDescription',
    defaultMessage:
      'You have reached the end of the interview. If you are satisfied with the information you have entered, you may finish the interview now.',
    description:
      'Guidance on the final interview screen before the participant opens the finish confirmation dialog.',
  },
  finish: {
    id: 'interview.interfaces.finish',
    defaultMessage: 'Finish',
    description:
      'Button on the final interview screen that opens the finish confirmation dialog.',
  },
  finished: {
    id: 'interview.interfaces.finished',
    defaultMessage: 'Finished',
    description:
      'Button that submits and closes the form for adding or editing a person; it does not finish the whole interview.',
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
  discardChanges: {
    id: 'interview.interfaces.discardChanges',
    defaultMessage: 'Discard changes',
    description:
      'Confirmation action that leaves an invalid form and discards its unsaved changes.',
  },
  keepChanges: {
    id: 'interview.interfaces.keepChanges',
    defaultMessage: 'Keep changes',
    description:
      'Cancellation action in the discard-changes warning; the participant stays on the current form to continue editing.',
  },
  scrollForQuestions: {
    id: 'interview.interfaces.scrollForQuestions',
    defaultMessage: 'Scroll to see more questions',
    description:
      'Hint at the bottom of a long personal-information form indicating that more questions are below the visible area.',
  },
  selectResponse: {
    id: 'interview.interfaces.selectResponse',
    defaultMessage: 'Please select a response before continuing.',
    description:
      'Warning shown when the participant tries to advance a pair-comparison question without choosing a response.',
  },
  yes: {
    id: 'interview.interfaces.yes',
    defaultMessage: 'Yes',
    description:
      'Affirmative built-in binary response in pair comparisons and human-readable display of true roster values. The stored boolean remains true.',
  },
  no: {
    id: 'interview.interfaces.no',
    defaultMessage: 'No',
    description:
      'Negative built-in binary response in pair comparisons and human-readable display of false roster values. The stored boolean remains false.',
  },
  loading: {
    id: 'interview.interfaces.loading',
    defaultMessage: 'Loading...',
    description:
      'Loading indicator while an external list of people is being read. Keeps the existing three-dot punctuation of this interface.',
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
  emptyRoster: {
    id: 'interview.interfaces.emptyRoster',
    defaultMessage: 'There is nothing to add from this list.',
    description:
      'Empty state after an external roster has loaded successfully but contains no entries.',
  },
  rosterAlreadyAdded: {
    id: 'interview.interfaces.rosterAlreadyAdded',
    defaultMessage: 'Everything from this list has already been added.',
    description:
      'Empty state when every entry from an external roster has already been added to the interview network.',
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
  availableToAdd: {
    id: 'interview.interfaces.availableToAdd',
    defaultMessage: 'Available to add',
    description:
      'Heading above the external roster entries that the participant can add to their network.',
  },
  availableItems: {
    id: 'interview.interfaces.availableItems',
    defaultMessage: 'List of available items to add',
    description:
      'Accessible name of the collection containing external roster entries that can be added.',
  },
  searchTerm: {
    id: 'interview.interfaces.searchTerm',
    defaultMessage: 'Enter a search term...',
    description:
      'Placeholder in the filter field above an external roster; it searches the available roster entries.',
  },
  addedNodes: {
    id: 'interview.interfaces.addedNodes',
    defaultMessage: 'Added Nodes',
    description:
      'Accessible name used by drag-and-drop announcements for the list of people already added to the network.',
  },
  node: {
    id: 'interview.interfaces.node',
    defaultMessage: 'Node',
    description:
      'Capitalized fallback label when a displayed network item has no authored type name or usable participant-entered name.',
  },
  nodeSubject: {
    id: 'interview.interfaces.nodeSubject',
    defaultMessage: 'node',
    description:
      'Lowercase fallback subject noun in the generated unnamed-roster-entry label when the protocol supplies no type name.',
  },
  oneThirdPanels: {
    id: 'interview.interfaces.oneThirdPanels',
    defaultMessage: 'One-third panels',
    description:
      'Divider preset that assigns one third of the available area to the source panels in the name generator.',
  },
  quarterPanels: {
    id: 'interview.interfaces.quarterPanels',
    defaultMessage: '25% panels',
    description:
      'Divider preset that assigns 25 percent of the available area to the source panels in the name generator.',
  },
  equalSplit: {
    id: 'interview.interfaces.equalSplit',
    defaultMessage: 'Equal split',
    description:
      'Divider preset that gives equal space to the source panels and the added-people list in the name generator.',
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
  quickAddMultipleInstructions: {
    id: 'interview.interfaces.quickAddMultipleInstructions',
    defaultMessage:
      'Press <kbd>Enter</kbd> when you are finished. The box will stay open so you can quickly enter multiple names in a row.',
    description:
      'Tooltip when quick-add supports consecutive entries. The field stays open after each submission. The kbd tag marks the Enter key.',
  },
  formDisabled: {
    id: 'interview.interfaces.formDisabled',
    defaultMessage: 'Form is disabled',
    description:
      'Form-level error when a quick-add submission is attempted while that form is disabled.',
  },
  quickLabelPlaceholder: {
    id: 'interview.interfaces.quickLabelPlaceholder',
    defaultMessage: 'Type a label and press enter...',
    description:
      'Placeholder in the quick-add field for entering the label of a new network item; Enter submits the value.',
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
  noAttributes: {
    id: 'interview.interfaces.noAttributes',
    defaultMessage: 'No attributes to edit',
    description:
      'Empty state in the network-composer editing panel when the selected item has no configured form fields.',
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
  selectAllThenNext: {
    id: 'interview.interfaces.selectAllThenNext',
    defaultMessage: 'Select all that apply, then click next',
    description:
      'Heading above a one-to-many relationship question. The participant may select multiple people before using the next navigation arrow.',
  },
  targetNodes: {
    id: 'interview.interfaces.targetNodes',
    defaultMessage: 'Target nodes',
    description:
      'Accessible name of the collection of people that can be selected in a one-to-many relationship question.',
  },
  noNodes: {
    id: 'interview.interfaces.noNodes',
    defaultMessage: 'No nodes to display.',
    description:
      'Empty state when a one-to-many relationship question has no people to display.',
  },
  noNodesAvailable: {
    id: 'interview.interfaces.noNodesAvailable',
    defaultMessage: 'No nodes available to display.',
    description:
      'Empty state when the current one-to-many question has no available people for its focal position.',
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
  pauseAutoLayout: {
    id: 'interview.interfaces.pauseAutoLayout',
    defaultMessage: 'Pause Auto Layout',
    description:
      'Visible sociogram button that pauses automatic positioning. Its capitalization differs from the narrative icon tooltip.',
  },
  resumeAutoLayout: {
    id: 'interview.interfaces.resumeAutoLayout',
    defaultMessage: 'Resume Auto Layout',
    description:
      'Visible sociogram button that resumes automatic positioning. Its capitalization differs from the narrative icon tooltip.',
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
  specifyOther: {
    id: 'interview.interfaces.specifyOther',
    defaultMessage: 'Specify other',
    description:
      'Title of the dialog opened when an item is placed in a categorical Other response and a written explanation is required.',
  },
  responsePlaceholder: {
    id: 'interview.interfaces.responsePlaceholder',
    defaultMessage: 'Enter your response here...',
    description:
      'Placeholder in the explanation field of the categorical Other dialog. The visible question label remains researcher-authored.',
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
  binSummary: {
    id: 'interview.interfaces.binSummary',
    defaultMessage:
      '{otherCount, plural, =0 {<label>{name}</label>} one {<label>{name}</label> <count>and # other</count>} other {<label>{name}</label> <count>and # others</count>}}',
    description:
      'Whole categorical-bin summary. name is the first item’s unchanged display name; otherCount excludes that item. label and count tags keep the name and remaining-item count in separate visual spans.',
  },
  missingInterface: {
    id: 'interview.interfaces.missingInterface',
    defaultMessage: 'No "{interfaceType}" interface found.',
    description:
      'Fallback error when the runtime cannot render a configured interface type. interfaceType is the unchanged technical type identifier for diagnosing the unsupported configuration.',
  },
  stubMap: {
    id: 'interview.interfaces.stubMap',
    defaultMessage: 'Stubbed map (click to select test feature)',
    description:
      'Accessible name of the test-only map placeholder used by automated interface tests; clicking it selects a fixture feature.',
  },
  mapUnavailable: {
    id: 'interview.interfaces.mapUnavailable',
    defaultMessage: 'The map could not be displayed',
    description:
      'Heading when the participant’s device or browser cannot initialize the map.',
  },
  mapUnavailableDescription: {
    id: 'interview.interfaces.mapUnavailableDescription',
    defaultMessage:
      'This can happen if your browser or device does not support the features the map requires (for example, WebGL). Try a different browser or device, or contact the study organizer. You may be able to continue your interview by selecting the next arrow.',
    description:
      'Recovery guidance after map initialization fails. The next arrow refers to the interview navigation control, not a map control.',
  },
  outsideMapDescription: {
    id: 'interview.interfaces.outsideMapDescription',
    defaultMessage:
      'You have indicated an area outside of the selectable map. If this is correct, please select the next arrow to proceed.',
    description:
      'Confirmation guidance when the participant indicates a location outside the selectable map areas. The next arrow advances the interview.',
  },
  deselect: {
    id: 'interview.interfaces.deselect',
    defaultMessage: 'Deselect',
    description:
      'Action that clears the current outside-map-area selection so the participant can choose another location.',
  },
  zoomIn: {
    id: 'interview.interfaces.zoomIn',
    defaultMessage: 'Zoom In',
    description:
      'Accessible name of the geospatial map button that increases magnification. Keeps the existing title capitalization.',
  },
  zoomOut: {
    id: 'interview.interfaces.zoomOut',
    defaultMessage: 'Zoom Out',
    description:
      'Accessible name of the geospatial map button that decreases magnification. Keeps the existing title capitalization.',
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
  searchPlace: {
    id: 'interview.interfaces.searchPlace',
    defaultMessage: 'Search for a place...',
    description:
      'Placeholder in the geospatial search field where the participant enters a place name.',
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
  searching: {
    id: 'interview.interfaces.searching',
    defaultMessage: 'Searching...',
    description:
      'Status shown in the geospatial search results panel while a search request is pending.',
  },
  noSearchResults: {
    id: 'interview.interfaces.noSearchResults',
    defaultMessage: 'Nothing matched your search.',
    description:
      'Outcome of a completed geospatial search with no matching places. Do not use this for network failures.',
  },
  searchFailed: {
    id: 'interview.interfaces.searchFailed',
    defaultMessage: 'Search could not be completed. Try again in a moment.',
    description:
      'Recoverable error when geospatial search could not run; it does not mean the place does not exist.',
  },
  placeUnavailable: {
    id: 'interview.interfaces.placeUnavailable',
    defaultMessage: 'That place could not be loaded. Try another search.',
    description:
      'Recoverable error when a chosen geospatial search suggestion could not be retrieved and the map could not move to it.',
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
