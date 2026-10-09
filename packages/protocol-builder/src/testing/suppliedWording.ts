import {
  type LocalizedString,
  suppliedStageSettingApplies,
  suppliedStageText,
} from '@codaco/protocol-validation';

/** A protocol with one language, the one the fixtures write in. */
const FIXTURE_LOCALIZATION = {
  defaultLocale: 'en-US',
  locales: ['en-US'],
} as const;

type WordingTree = { [key: string]: LocalizedString | WordingTree };

/** A branch holds further settings; a leaf holds one language's text. */
const isWordingTree = (
  node: LocalizedString | WordingTree,
): node is WordingTree => !('en-US' in node);

/** Sets `value` at `path` in `tree`, creating the objects the path passes through. */
const setWording = (
  tree: WordingTree,
  path: readonly string[],
  value: LocalizedString,
): void => {
  const [head, ...rest] = path;
  if (head === undefined) return;
  if (rest.length === 0) {
    tree[head] = value;
    return;
  }
  const child = tree[head];
  const branch: WordingTree =
    child !== undefined && isWordingTree(child) ? child : {};
  tree[head] = branch;
  setWording(branch, rest, value);
};

/**
 * The wording Network Canvas supplies for the settings `stage` holds as it is
 * configured, in the fixtures' one language: exactly the settings a stage
 * editor shows for it, so a fixture holding them round-trips with nothing added
 * on save and nothing left unowned.
 */
export const suppliedWordingFor = (
  stage: Readonly<{ type: string }> & Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const tree: WordingTree = {};
  for (const { path, value } of suppliedStageText(
    stage.type,
    FIXTURE_LOCALIZATION,
  )) {
    if (!suppliedStageSettingApplies(stage, path)) continue;
    setWording(tree, path, value as LocalizedString);
  }
  return tree;
};
