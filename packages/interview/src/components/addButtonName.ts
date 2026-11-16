/**
 * The name a screen reader gives a button that adds a person to the network,
 * from the icon the person's type shows on it: "Add a place" for
 * `add-a-place`, and plain "Add" for an icon that does not say what it adds.
 * English in every language, like all text only a screen reader reads.
 */
export function addButtonName(icon: string): string {
  const added = /^add-a-([a-z]+(?:-[a-z]+)*)$/.exec(icon)?.[1];
  return added ? `Add a ${added.replaceAll('-', ' ')}` : 'Add';
}
