import { createContext } from 'react';

/**
 * Tracks how deeply a Section is nested inside other Sections so each level can
 * step to a more contrasting surface colour. Defaults to 0 (top level). Dialogs
 * reset this to 0 because an overlay is a fresh surface, not a visual descendant
 * of the Section it was opened from.
 */
const SectionDepthContext = createContext(0);

export default SectionDepthContext;
