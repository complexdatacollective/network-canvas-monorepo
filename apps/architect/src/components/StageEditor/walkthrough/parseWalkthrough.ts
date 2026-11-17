import {
  type DirectiveName,
  includedNames,
  type LexedFile,
  type LexedStep,
  lexWalkthrough,
  type Practice,
  stepsWithIncludes,
} from './walkthroughFormat';

export type { Practice } from './walkthroughFormat';

export type WalkthroughBlock =
  | Readonly<{ kind: 'markdown'; text: string }>
  | Readonly<{ kind: 'practices'; items: readonly Practice[] }>;

export type WalkthroughStep = Readonly<{
  title: string;
  blocks: readonly WalkthroughBlock[];
  section?: string;
  field?: string;
  /**
   * A control outside the stage's sections, such as `preview`, named by the
   * `data-walkthrough-control` attribute it carries.
   */
  control?: string;
  scene?: string;
}>;

export type Walkthrough = Readonly<{
  title: string;
  steps: readonly WalkthroughStep[];
}>;

const toStep = (step: LexedStep): WalkthroughStep => {
  const directives: { [Name in DirectiveName]?: string } = {};
  for (const { name, value } of step.directives) directives[name] = value;
  return {
    title: step.title,
    blocks: step.blocks.map((block): WalkthroughBlock =>
      block.kind === 'text'
        ? { kind: 'markdown', text: block.text.trim() }
        : { kind: 'practices', items: block.items },
    ),
    ...directives,
  };
};

/** Prefixes an error with the file it came from. */
const inFile = (file: string, error: unknown) =>
  new Error(
    `${file}: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error },
  );

function walkthroughFrom(
  file: LexedFile,
  shared: ReadonlyMap<string, string>,
): Walkthrough {
  const lexedShared = new Map<string, LexedFile>();
  const steps = stepsWithIncludes(file, (name) => {
    const source = shared.get(name);
    if (source === undefined) return undefined;
    let lexed = lexedShared.get(name);
    if (lexed === undefined) {
      try {
        lexed = lexWalkthrough(source);
      } catch (error) {
        throw inFile(`shared/${name}.md`, error);
      }
      lexedShared.set(name, lexed);
    }
    return lexed;
  });
  return { title: file.title ?? '', steps: steps.map(toStep) };
}

/**
 * Parses a walkthrough content file. `shared` holds the source of each shared
 * file it may include, by name (`skip-logic` for `shared/skip-logic.md`).
 * Throws when the file breaks the format (see walkthroughFormat.ts) or
 * includes a shared file that `shared` does not hold.
 */
export const parseWalkthrough = (
  source: string,
  shared: ReadonlyMap<string, string>,
): Walkthrough => walkthroughFrom(lexWalkthrough(source), shared);

type Loader = () => Promise<string>;

const byName = (loaders: Record<string, Loader>, folder: string) =>
  new Map(
    Object.entries(loaders).map(([path, load]) => [
      path.slice(folder.length, -'.md'.length),
      load,
    ]),
  );

// Nothing is loaded until a walkthrough is asked for: each file is its own
// chunk, so one broken file cannot stop the others, or the editor, loading.
const contentFiles = byName(
  import.meta.glob<string>('./content/*.md', {
    query: '?raw',
    import: 'default',
  }),
  './content/',
);
const sharedFiles = byName(
  import.meta.glob<string>('./content/shared/*.md', {
    query: '?raw',
    import: 'default',
  }),
  './content/shared/',
);

/** Whether the stage type has a walkthrough. Loads nothing. */
export const hasWalkthrough = (stageType: string): boolean =>
  contentFiles.has(stageType);

async function readWalkthrough(
  stageType: string,
): Promise<Walkthrough | undefined> {
  const load = contentFiles.get(stageType);
  if (load === undefined) return undefined;
  const fileName = `${stageType}.md`;
  let file: LexedFile;
  try {
    file = lexWalkthrough(await load());
  } catch (error) {
    throw inFile(fileName, error);
  }
  const shared = new Map<string, string>();
  await Promise.all(
    includedNames(file).map(async (name) => {
      const loadShared = sharedFiles.get(name);
      if (loadShared !== undefined) shared.set(name, await loadShared());
    }),
  );
  try {
    return walkthroughFrom(file, shared);
  } catch (error) {
    throw inFile(fileName, error);
  }
}

const loaded = new Map<string, Promise<Walkthrough | undefined>>();

/**
 * The walkthrough for a stage type, or undefined when it has none. Loads and
 * parses its content file and the shared files it includes the first time it
 * is asked for, and returns the same promise after that. Rejects when the
 * file breaks the format, includes a shared file that does not exist, or
 * cannot be fetched; a rejection is not kept, so asking again tries again.
 */
export function loadWalkthrough(
  stageType: string,
): Promise<Walkthrough | undefined> {
  let walkthrough = loaded.get(stageType);
  if (walkthrough === undefined) {
    walkthrough = readWalkthrough(stageType);
    loaded.set(stageType, walkthrough);
    walkthrough.catch(() => loaded.delete(stageType));
  }
  return walkthrough;
}
