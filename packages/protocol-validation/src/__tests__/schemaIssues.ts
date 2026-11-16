type Issue = {
  readonly path: readonly PropertyKey[];
  readonly code: string;
  readonly errors?: readonly (readonly Issue[])[];
};

type ParseResult = { readonly error?: { readonly issues: readonly Issue[] } };

const pathAndCode = ({ path, code }: Issue) => ({
  path: path.map(String).join('.'),
  code,
});

/**
 * Every issue of a parse as its dotted path and code, or none when it passed.
 * A negative test compares the whole list, so it fails when the input is
 * refused somewhere other than the rule it names.
 */
export const issueCodes = (result: ParseResult) =>
  (result.error?.issues ?? []).map(pathAndCode);

/**
 * A plain `z.union` refuses at its own path without saying why. When that is
 * the parse's only issue, this lists each branch's issues, relative to the
 * union, so a test can name the branch that should have matched.
 */
export const unionBranchIssueCodes = (result: ParseResult) => {
  const issues = result.error?.issues ?? [];
  const [issue] = issues;
  if (issues.length !== 1 || issue?.code !== 'invalid_union') {
    throw new Error(
      `Expected one union refusal, got ${JSON.stringify(issues.map(pathAndCode))}`,
    );
  }
  return (issue.errors ?? []).map((branch) => branch.map(pathAndCode));
};
