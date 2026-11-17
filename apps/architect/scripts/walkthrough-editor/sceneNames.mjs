// Reads the scene names a walkthrough step can play from the scene
// registry's source. The registry imports React components, which Node cannot
// load, so the editor server (and any test that wants the names without
// rendering) reads its text instead.
//
// Names are the quoted strings of the registry's SCENE_NAMES array when it has
// one, otherwise the quoted keys of its SCENES object.

/**
 * @param {string} registry The source of scenes/sceneRegistry.ts.
 * @returns {string[]}
 */
export function sceneNamesIn(registry) {
  // The array literal assigned to SCENE_NAMES, skipping any type annotation.
  const array = /\bSCENE_NAMES\b[^=;]*=\s*\[([^\]]*)\]/.exec(registry);
  if (array) {
    return [...array[1].matchAll(/['"]([a-z0-9-]+)['"]/g)].map(
      (match) => match[1],
    );
  }
  const object = /\bSCENES\b[^=;]*=\s*\{/.exec(registry);
  const body = object ? registry.slice(object.index) : '';
  return [...body.matchAll(/^\s*['"]([a-z0-9-]+)['"]\s*:/gm)].map(
    (match) => match[1],
  );
}
