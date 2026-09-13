/**
 * Every key the schema keeps a geospatial stage's map settings under.
 *
 * Apart from both sections that render them, because two sections own one
 * `mapOptions` object between them and a key spelled twice can be spelled
 * differently.
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
