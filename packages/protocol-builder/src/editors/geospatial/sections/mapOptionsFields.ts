/**
 * Every key the schema keeps a geospatial stage's map settings under.
 *
 * Named once, and imported by both of the sections that render them, because
 * the map is authored in two sittings that the prompts sit between: what the
 * map IS — the key that lets one be drawn and the layer that says which areas
 * can be chosen — comes before there is anything to ask, and how the map LOOKS
 * and where it opens comes after. Two sections owning one `mapOptions` object
 * is exactly why the names live apart from either of them: a key spelled twice
 * is a key that can be spelled differently.
 */
export const TOKEN_FIELD = 'mapOptions.tokenAssetId';
export const LAYER_FIELD = 'mapOptions.dataSourceAssetId';
export const PROPERTY_FIELD = 'mapOptions.targetFeatureProperty';
export const STYLE_FIELD = 'mapOptions.style';
export const COLOR_FIELD = 'mapOptions.color';
export const TRANSIT_FIELD = 'mapOptions.showTransit';
export const SEARCH_FIELD = 'mapOptions.allowSearch';
export const CENTER_FIELD = 'mapOptions.center';
export const ZOOM_FIELD = 'mapOptions.initialZoom';
