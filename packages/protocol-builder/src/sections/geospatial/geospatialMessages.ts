import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * Everything a geospatial stage editor says.
 *
 * One file for the whole area rather than descriptors beside each piece of
 * markup, because the copy is rendered in six places that are not each other:
 * the two sections that say what the map IS, the two that say how it LOOKS,
 * the row the shared prompt list renders, and the controls under
 * `fields/geospatial/` — one of which is a dialog and two of which are option
 * builders that hold no markup at all. A translator reading this file sees the
 * whole of what a researcher building a map stage reads.
 *
 * The four `prompts*` sentences are what `PromptsSection` says on this
 * family's behalf. A geospatial prompt asks the participant WHERE something is
 * and stores the answer in one location attribute, which is a different thing
 * from the question-and-answer the shared section is worded for — so the
 * sentences are whole rather than a noun swapped into a shared frame, and they
 * are descriptors rather than strings so a translator ever sees them.
 */
export const geospatialMessages = defineMessages({
  promptsDescription: {
    id: 'protocolBuilder.geospatial.promptsDescription',
    defaultMessage:
      'Write the questions this stage asks about places, and drag them into the order the participant answers them.',
    description:
      'Description of the prompts section on a geospatial stage, whose prompts ask about locations on a map. Replaces the generic prompts description.',
  },
  promptsWaitingDescription: {
    id: 'protocolBuilder.geospatial.promptsWaitingDescription',
    defaultMessage:
      'Choose the type this stage works with before writing its prompts.',
    description:
      'Shown in place of the geospatial prompts description while the researcher has not yet chosen which node or edge type the stage is about, so there is nothing for a prompt to be written against.',
  },
  promptsFieldHint: {
    id: 'protocolBuilder.geospatial.promptsFieldHint',
    defaultMessage:
      'Each prompt asks for one place and records it in one location attribute. Add at least one.',
    description:
      'Guidance under the geospatial prompt list. A location attribute is the codebook variable the chosen place is stored in.',
  },
  promptsEmptyState: {
    id: 'protocolBuilder.geospatial.promptsEmptyState',
    defaultMessage:
      'No prompts yet. Create one to ask the participant where something is.',
    description:
      'Shown in place of the geospatial prompt list while the stage asks nothing yet.',
  },

  accessTitle: {
    id: 'protocolBuilder.geospatial.accessTitle',
    defaultMessage: 'Map access',
    description:
      'Heading of the section where a researcher chooses the stored Mapbox API key a geospatial stage draws its map with. "Access" is about being allowed to draw a map at all, not about accessibility.',
  },
  accessDescription: {
    id: 'protocolBuilder.geospatial.accessDescription',
    defaultMessage:
      'This stage draws a Mapbox map, which needs an API key from your Mapbox account.',
    description:
      'Description of the map-access section. Mapbox is the third-party map provider, and the researcher holds their own account with it.',
  },
  tokenLabel: {
    id: 'protocolBuilder.geospatial.tokenLabel',
    defaultMessage: 'Mapbox API key',
    description:
      'Label of the control that chooses which stored API key this stage draws its map with. "Mapbox" is the provider’s name and stays untranslated.',
  },
  tokenHint: {
    id: 'protocolBuilder.geospatial.tokenHint',
    defaultMessage:
      'The key is stored with the protocol and is never shown again once it is saved.',
    description:
      'Guidance under the Mapbox API key control. The protocol is the interview document the researcher is building; the key travels inside it and this editor can never read the value back.',
  },
  layerTitle: {
    id: 'protocolBuilder.geospatial.layerTitle',
    defaultMessage: 'Map layer',
    description:
      'Heading of the section where a researcher chooses the GeoJSON file whose areas a participant can select on the map.',
  },
  layerDescription: {
    id: 'protocolBuilder.geospatial.layerDescription',
    defaultMessage:
      'The areas a participant can choose between come from a GeoJSON layer.',
    description:
      'Description of the map-layer section. GeoJSON is the file format the areas are drawn from and stays untranslated.',
  },
  layerLabel: {
    id: 'protocolBuilder.geospatial.layerLabel',
    defaultMessage: 'Map layer',
    description:
      'Label of the control that chooses the stored GeoJSON layer. The same words as the section heading, and translated once for each: the heading names the part of the stage, and this names the control.',
  },
  layerHint: {
    id: 'protocolBuilder.geospatial.layerHint',
    defaultMessage:
      'Each feature in the layer is one area a participant can select. Large layers, and areas outside the study region, make the map slow to open.',
    description:
      'Guidance under the map-layer control. A "feature" is GeoJSON’s own word for one shape in the file.',
  },
  propertyLabel: {
    id: 'protocolBuilder.geospatial.propertyLabel',
    defaultMessage: 'Recorded property',
    description:
      'Label of the control that chooses which property of a selected area is stored as the participant’s answer. A property is one named field a GeoJSON feature carries.',
  },
  propertyHint: {
    id: 'protocolBuilder.geospatial.propertyHint',
    defaultMessage:
      'The value of this property is what gets stored when a participant selects an area, so choose one that is filled in and unique for every feature — a census tract, a postcode, or a neighborhood name.',
    description:
      'Guidance under the recorded-property control. The three examples are kinds of area identifier; a language may replace them with identifiers its own readers would recognise.',
  },

  appearanceTitle: {
    id: 'protocolBuilder.geospatial.appearanceTitle',
    defaultMessage: 'Map appearance',
    description:
      'Heading of the section holding how the map looks: which basemap is drawn, what colour selectable areas are, and what else is shown on it.',
  },
  appearanceDescription: {
    id: 'protocolBuilder.geospatial.appearanceDescription',
    defaultMessage: 'Choose how the map looks to the participant.',
    description: 'Description of the map-appearance section.',
  },
  styleLabel: {
    id: 'protocolBuilder.geospatial.styleLabel',
    defaultMessage: 'Basemap',
    description:
      'Label of the control that chooses which Mapbox map style is drawn beneath the selectable areas. A basemap is the background map itself — streets, terrain, satellite imagery.',
  },
  styleHint: {
    id: 'protocolBuilder.geospatial.styleHint',
    defaultMessage:
      'The map drawn beneath the selectable areas. Check that place names on it stay readable under the highlight color.',
    description:
      'Guidance under the basemap control. The highlight colour is the colour chosen just below it, which the selectable areas are drawn in.',
  },
  colorLabel: {
    id: 'protocolBuilder.geospatial.colorLabel',
    defaultMessage: 'Highlight color',
    description:
      'Label of the control that chooses the colour selectable areas are outlined and filled with.',
  },
  colorHint: {
    id: 'protocolBuilder.geospatial.colorHint',
    defaultMessage:
      'Selectable areas are outlined in this color, and the area a participant chooses is filled with it.',
    description: 'Guidance under the highlight-colour control.',
  },
  colorOptionLabel: {
    id: 'protocolBuilder.geospatial.colorOptionLabel',
    defaultMessage: 'Highlight color {position}',
    description:
      'Name of one choice in the highlight-colour control. position is that colour’s place in the theme’s ordinal palette, counting from 1 — the palette has ten and the protocol stores the position rather than a colour value, so the colours have no names of their own. Named rather than only shown because a colour has to be sayable by people who are not looking at the control.',
  },
  transitLabel: {
    id: 'protocolBuilder.geospatial.transitLabel',
    defaultMessage: 'Show public transport',
    description:
      'Label of the switch that draws transit routes and stations on the participant’s map.',
  },
  transitHint: {
    id: 'protocolBuilder.geospatial.transitHint',
    defaultMessage: 'Draw transit routes and stations on the map.',
    description: 'Guidance under the public-transport switch.',
  },
  searchLabel: {
    id: 'protocolBuilder.geospatial.searchLabel',
    defaultMessage: 'Allow searching the map',
    description:
      'Label of the switch that lets a participant search the map by place name instead of panning to somewhere.',
  },
  searchHint: {
    id: 'protocolBuilder.geospatial.searchHint',
    defaultMessage:
      'Let participants search for an address, a neighborhood, or a landmark instead of panning to it.',
    description:
      'Guidance under the map-search switch. Panning is dragging the map to move it.',
  },

  viewTitle: {
    id: 'protocolBuilder.geospatial.viewTitle',
    defaultMessage: 'Starting map view',
    description:
      'Heading of the section holding where the map is centred and how far in it is zoomed when the stage opens — and the title of the dialog that sets those two things by panning a real map. The same thing named in both places, so it is translated once.',
  },
  viewDescription: {
    id: 'protocolBuilder.geospatial.viewDescription',
    defaultMessage:
      'Where the map is centered, and how far in it is zoomed, when the stage opens.',
    description:
      'Description of the starting-map-view section. A stage is one step of an interview.',
  },
  centerLabel: {
    id: 'protocolBuilder.geospatial.centerLabel',
    defaultMessage: 'Starting center',
    description:
      'Label of the pair of controls holding the longitude and latitude the map is centred on when the stage opens.',
  },
  centerHint: {
    id: 'protocolBuilder.geospatial.centerHint',
    defaultMessage:
      'Enter the coordinates, or set them by panning a map. Longitude runs from -180 to 180, latitude from -90 to 90.',
    description:
      'Guidance under the starting-centre controls. The ranges are degrees and are the same in every language.',
  },
  zoomLabel: {
    id: 'protocolBuilder.geospatial.zoomLabel',
    defaultMessage: 'Starting zoom',
    description:
      'Label of the control holding how far in the map is zoomed when the stage opens.',
  },
  zoomHint: {
    id: 'protocolBuilder.geospatial.zoomHint',
    defaultMessage:
      '{min, number} shows the whole world; {max, number} is street level.',
    description:
      'Guidance under the starting-zoom control. min and max are the two ends of Mapbox’s own zoom scale, 0 and 22, which the protocol schema also enforces.',
  },

  styleStandard: {
    id: 'protocolBuilder.geospatial.styleStandard',
    defaultMessage: 'Standard',
    description:
      'Name of one basemap a geospatial stage can be drawn on: Mapbox’s general-purpose map. Mapbox publishes these style names in English only, so a language may either translate the name or keep the published one — the stored value is a style URL and never changes.',
  },
  styleStandardSatellite: {
    id: 'protocolBuilder.geospatial.styleStandardSatellite',
    defaultMessage: 'Standard satellite',
    description:
      'Name of one basemap: the general-purpose map drawn over satellite imagery.',
  },
  styleStreets: {
    id: 'protocolBuilder.geospatial.styleStreets',
    defaultMessage: 'Streets',
    description:
      'Name of one basemap: a detailed street map with road and place names.',
  },
  styleOutdoors: {
    id: 'protocolBuilder.geospatial.styleOutdoors',
    defaultMessage: 'Outdoors',
    description:
      'Name of one basemap: terrain, contours and trails, for open country rather than streets.',
  },
  styleLight: {
    id: 'protocolBuilder.geospatial.styleLight',
    defaultMessage: 'Light',
    description:
      'Name of one basemap: a pale, low-contrast map meant to sit under coloured overlays.',
  },
  styleDark: {
    id: 'protocolBuilder.geospatial.styleDark',
    defaultMessage: 'Dark',
    description:
      'Name of one basemap: a dark, low-contrast map meant to sit under coloured overlays.',
  },
  styleSatellite: {
    id: 'protocolBuilder.geospatial.styleSatellite',
    defaultMessage: 'Satellite',
    description:
      'Name of one basemap: satellite imagery on its own, with no labels.',
  },
  styleSatelliteStreets: {
    id: 'protocolBuilder.geospatial.styleSatelliteStreets',
    defaultMessage: 'Satellite streets',
    description:
      'Name of one basemap: satellite imagery with street and place names drawn over it.',
  },
  styleNavigationDay: {
    id: 'protocolBuilder.geospatial.styleNavigationDay',
    defaultMessage: 'Navigation day',
    description:
      'Name of one basemap: Mapbox’s driving-directions map in its daytime colours.',
  },
  styleNavigationNight: {
    id: 'protocolBuilder.geospatial.styleNavigationNight',
    defaultMessage: 'Navigation night',
    description:
      'Name of one basemap: Mapbox’s driving-directions map in its night-time colours.',
  },

  promptTextLabel: {
    id: 'protocolBuilder.geospatial.promptTextLabel',
    defaultMessage: 'Prompt text',
    description:
      'Label of the field holding the question a geospatial prompt asks. A prompt is one question a participant is asked; this is the wording they read.',
  },
  promptTextHint: {
    id: 'protocolBuilder.geospatial.promptTextHint',
    defaultMessage: 'The question the participant reads while the map is open.',
    description: 'Guidance under the geospatial prompt-text field.',
  },
  promptTextRequired: {
    id: 'protocolBuilder.geospatial.promptTextRequired',
    defaultMessage: 'Write the question this prompt asks.',
    description:
      'Refusal shown under the prompt-text field when a researcher saves a geospatial prompt without writing its question.',
  },
  promptVariableLabel: {
    id: 'protocolBuilder.geospatial.promptVariableLabel',
    defaultMessage: 'Location attribute',
    description:
      'Label of the control that chooses which codebook attribute this prompt records the participant’s chosen area in. A location attribute is one that holds a place; it is the only kind a map selection can be stored in.',
  },
  promptVariableHint: {
    id: 'protocolBuilder.geospatial.promptVariableHint',
    defaultMessage: "The attribute the participant's chosen area is stored in.",
    description: 'Guidance under the location-attribute control.',
  },
  promptVariableRequired: {
    id: 'protocolBuilder.geospatial.promptVariableRequired',
    defaultMessage: 'Choose the attribute this prompt records.',
    description:
      'Refusal shown under the location-attribute control when a researcher saves a geospatial prompt without saying where its answer goes.',
  },
  promptVariableEmptyState: {
    id: 'protocolBuilder.geospatial.promptVariableEmptyState',
    defaultMessage:
      'This type has no location attributes yet. Create one to record where the participant chooses.',
    description:
      'Shown in place of the location-attribute control while the node or edge type this stage works with has no attribute that can hold a place. "Type" is the kind of network member the stage is about.',
  },
  createAttributeLabel: {
    id: 'protocolBuilder.geospatial.createAttributeLabel',
    defaultMessage: 'Create a new location attribute',
    description:
      'Button inside the geospatial prompt dialog that opens the codebook editor to add an attribute holding a place, and the title of the dialog it opens. Whole rather than a generic "Create", because the dialog around it already has several buttons.',
  },
  createAttributeDescription: {
    id: 'protocolBuilder.geospatial.createAttributeDescription',
    defaultMessage: 'Create a location attribute for this prompt',
    description:
      'Description read out with the codebook editor opened from a geospatial prompt, saying which prompt the new attribute is being made for.',
  },
  promptPreviewEmpty: {
    id: 'protocolBuilder.geospatial.promptPreviewEmpty',
    defaultMessage: 'This prompt has no question yet.',
    description:
      'Shown in place of one row of the geospatial prompt list while that prompt’s question has not been written.',
  },

  propertyNoLayer: {
    id: 'protocolBuilder.geospatial.propertyNoLayer',
    defaultMessage:
      'Choose a map layer first. Its features are where these properties come from.',
    description:
      'Shown in place of the recorded-property control while no GeoJSON layer has been chosen, so there are no properties to offer.',
  },
  propertyNoProperties: {
    id: 'protocolBuilder.geospatial.propertyNoProperties',
    defaultMessage:
      'The features in this layer carry no properties, so there is nothing to record a selection as. Choose a layer whose features are labeled.',
    description:
      'Shown in place of the recorded-property control when the chosen GeoJSON layer was read but its features carry no named fields.',
  },
  propertyUnreadable: {
    id: 'protocolBuilder.geospatial.propertyUnreadable',
    defaultMessage:
      'This layer could not be read as GeoJSON, so its properties cannot be listed.',
    description:
      'Shown in place of the recorded-property control when the chosen file’s bytes are not a GeoJSON document this can parse.',
  },
  propertyMissingOptionLabel: {
    id: 'protocolBuilder.geospatial.propertyMissingOptionLabel',
    defaultMessage: '{property} — this property is not in the chosen layer',
    description:
      'Label of the only choice left standing for a stage that records a property the current map layer does not have. property is the stored property name, which the researcher chose against an earlier layer. Rendered inside a plain dropdown option, which can carry no styling, so the explanation is part of the label.',
  },
  propertyMissingRefusal: {
    id: 'protocolBuilder.geospatial.propertyMissingRefusal',
    defaultMessage:
      'This property is not in the chosen map layer. Choose one that is.',
    description:
      'Shown under the recorded-property control when the property the stage already records is not in the layer now chosen. The control looks answered and is not, so both the problem and the way out are named.',
  },
  propertyLoading: {
    id: 'protocolBuilder.geospatial.propertyLoading',
    defaultMessage: 'Reading the map layer.',
    description:
      'Announced to screen readers only, while the chosen GeoJSON layer is being fetched and parsed to find out which properties it offers. Never shown on screen.',
  },
  propertyRetryLabel: {
    id: 'protocolBuilder.geospatial.propertyRetryLabel',
    defaultMessage: 'Try reading the map layer again',
    description:
      'Button that re-fetches a GeoJSON layer whose download failed. Whole rather than a generic "Try again", because a stage editor can show several failed things at once and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },

  longitudeLabel: {
    id: 'protocolBuilder.geospatial.longitudeLabel',
    defaultMessage: 'Longitude',
    description:
      'Label of the control holding the east-west half of the map’s starting centre. Named rather than positioned, because longitude and latitude cannot be told apart by which box comes first.',
  },
  latitudeLabel: {
    id: 'protocolBuilder.geospatial.latitudeLabel',
    defaultMessage: 'Latitude',
    description:
      'Label of the control holding the north-south half of the map’s starting centre.',
  },
  longitudeIncrease: {
    id: 'protocolBuilder.geospatial.longitudeIncrease',
    defaultMessage: 'Increase longitude',
    description:
      'Accessible name of the button that steps the longitude up by one. Named for its own coordinate: a screen reader announces a button by its name alone, and three numbers describe one starting view, so a shared "Increase value" would be six buttons nobody could tell apart.',
  },
  longitudeDecrease: {
    id: 'protocolBuilder.geospatial.longitudeDecrease',
    defaultMessage: 'Decrease longitude',
    description:
      'Accessible name of the button that steps the longitude down by one.',
  },
  latitudeIncrease: {
    id: 'protocolBuilder.geospatial.latitudeIncrease',
    defaultMessage: 'Increase latitude',
    description:
      'Accessible name of the button that steps the latitude up by one.',
  },
  latitudeDecrease: {
    id: 'protocolBuilder.geospatial.latitudeDecrease',
    defaultMessage: 'Decrease latitude',
    description:
      'Accessible name of the button that steps the latitude down by one.',
  },
  zoomIncrease: {
    id: 'protocolBuilder.geospatial.zoomIncrease',
    defaultMessage: 'Increase zoom',
    description:
      'Accessible name of the button that steps the starting zoom up by one. Named for the number it moves, for the same reason as the two coordinate steppers beside it.',
  },
  zoomDecrease: {
    id: 'protocolBuilder.geospatial.zoomDecrease',
    defaultMessage: 'Decrease zoom',
    description:
      'Accessible name of the button that steps the starting zoom down by one.',
  },
  openPreviewLabel: {
    id: 'protocolBuilder.geospatial.openPreviewLabel',
    defaultMessage: 'Set the starting view on a map',
    description:
      'Button that opens a real, pannable map for a researcher who knows the place but not its coordinates. The typed coordinate controls beside it stay the only way to set an exact centre.',
  },

  previewInstructions: {
    id: 'protocolBuilder.geospatial.previewInstructions',
    defaultMessage:
      'Pan and zoom to the view participants should see when the map first opens.',
    description:
      'Guidance at the top of the dialog that sets a stage’s starting view by moving a real map. Panning is dragging the map to move it.',
  },
  previewLoading: {
    id: 'protocolBuilder.geospatial.previewLoading',
    defaultMessage: 'Loading the map.',
    description:
      'Announced to screen readers only, while the host is asked for a map that can be drawn for the stored API key. Never shown on screen.',
  },
  previewMissingKey: {
    id: 'protocolBuilder.geospatial.previewMissingKey',
    defaultMessage:
      'Choose a Mapbox API key before setting the starting view on a map.',
    description:
      'Shown in the starting-view dialog when the stage has no API key yet, so no map can be drawn. The coordinates can still be typed in the section behind the dialog.',
  },
  previewLoadFailure: {
    id: 'protocolBuilder.geospatial.previewLoadFailure',
    defaultMessage:
      'The map could not be drawn. Check that the API key is still valid, then try again.',
    description:
      'Shown in the starting-view dialog when Mapbox itself refused to draw the map — most often an API key that has been revoked or has run out of quota.',
  },
  previewRetryLabel: {
    id: 'protocolBuilder.geospatial.previewRetryLabel',
    defaultMessage: 'Try loading the map again',
    description:
      'Button that asks the host again for a map it could not serve. Whole rather than a generic "Try again", because a screen reader announces a button by its name alone.',
  },
  previewAcceptLabel: {
    id: 'protocolBuilder.geospatial.previewAcceptLabel',
    defaultMessage: 'Use this view',
    description:
      'Button that takes the centre and zoom the researcher has panned the map to and stores them as the stage’s starting view. Offered only once the map is readable and has actually been moved.',
  },
  previewMapLabel: {
    id: 'protocolBuilder.geospatial.previewMapLabel',
    defaultMessage: 'Interactive map',
    description:
      'Accessible name of the region holding the pannable map inside the starting-view dialog, so it is reachable and identifiable without sight of it.',
  },

  centerIncomplete: {
    id: 'protocolBuilder.geospatial.centerIncomplete',
    defaultMessage:
      'Enter both a longitude and a latitude for the starting view.',
    description:
      'Refusal shown under the starting-centre controls when only one of the two coordinates reads as a number. A centre is one value, so half of it is not a centre.',
  },
  longitudeOutOfRange: {
    id: 'protocolBuilder.geospatial.longitudeOutOfRange',
    defaultMessage:
      'Longitude must be between {min, number} and {max, number}.',
    description:
      'Refusal shown under the starting-centre controls when the longitude names no place on Earth. min and max are the ends of the longitude range in degrees, -180 and 180.',
  },
  latitudeOutOfRange: {
    id: 'protocolBuilder.geospatial.latitudeOutOfRange',
    defaultMessage: 'Latitude must be between {min, number} and {max, number}.',
    description:
      'Refusal shown under the starting-centre controls when the latitude names no place on Earth. min and max are the ends of the latitude range in degrees, -90 and 90.',
  },
});
