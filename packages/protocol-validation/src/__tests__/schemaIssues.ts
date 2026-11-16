type Issue = {
  readonly path: readonly PropertyKey[];
  readonly code: string;
  readonly message: string;
  readonly keys?: readonly string[];
  readonly errors?: readonly (readonly Issue[])[];
};

type ParseResult = { readonly error?: { readonly issues: readonly Issue[] } };

type IssueSummary = {
  path: string;
  code: string;
  message?: string;
  keys?: readonly string[];
};

/**
 * Path and code say where an input was refused and by what kind of rule. A
 * `custom` issue also carries its message, because several refinements can
 * refuse at one path, and an `unrecognized_keys` issue carries the keys, so a
 * stray key in a fixture cannot stand in for the one under test.
 */
const summarise = ({ path, code, message, keys }: Issue): IssueSummary => ({
  path: path.map(String).join('.'),
  code,
  ...(code === 'custom' ? { message } : {}),
  ...(code === 'unrecognized_keys' ? { keys } : {}),
});

const sortKey = ({ path, code, message = '' }: IssueSummary) =>
  `${path}\u0000${code}\u0000${message}`;

const bySortKey = (a: IssueSummary, b: IssueSummary) =>
  sortKey(a).localeCompare(sortKey(b));

/**
 * Every issue of a parse, summarised and sorted so that the order in which
 * refinements run is not part of the expectation; none when it passed. A
 * negative test compares the whole list, so it fails when the input is refused
 * for any reason other than the rule it names.
 */
export const parseIssues = (result: ParseResult) =>
  (result.error?.issues ?? []).map(summarise).toSorted(bySortKey);

/**
 * A plain `z.union` refuses at its own path without saying why. When that is
 * the parse's only issue, this lists each branch's issues, relative to the
 * union, so a test can name the branch that should have matched.
 */
export const unionBranchIssues = (result: ParseResult) => {
  const issues = result.error?.issues ?? [];
  const [issue] = issues;
  if (issues.length !== 1 || issue?.code !== 'invalid_union') {
    throw new Error(
      `Expected one union refusal, got ${JSON.stringify(issues.map(summarise))}`,
    );
  }
  return (issue.errors ?? []).map((branch) =>
    branch.map(summarise).toSorted(bySortKey),
  );
};
