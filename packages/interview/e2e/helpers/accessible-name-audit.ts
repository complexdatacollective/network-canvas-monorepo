import type { Locator } from '@playwright/test';

/**
 * WCAG 4.1.2 audit over a Playwright ARIA snapshot.
 *
 * The matrix ARIA baselines exist to pin what our UI exposes to assistive
 * technology. Left to themselves they are a *record*, not an assertion: a
 * regenerated baseline absorbs whatever the tree happens to contain, so a
 * control that silently loses its accessible name becomes the new expected
 * state — and the baseline then defends the regression. This module turns the
 * same snapshot text into an assertion that goes red when that happens.
 *
 * It is deliberately evaluated **before** `toMatchAriaSnapshot`, so a run with
 * `--update-snapshots` fails here and writes no baseline at all.
 *
 * Playwright's snapshot YAML already carries the engine's own accessible-name
 * computation, so parsing it is strictly more accurate than re-deriving names
 * from the DOM in `page.evaluate`.
 */

/**
 * Roles whose nodes are operable controls. WCAG 2.1 SC 4.1.2 (Name, Role,
 * Value) requires every one of them to expose an accessible name, so a node of
 * one of these roles with no name in the snapshot is a defect.
 *
 * Roles whose name is genuinely optional (`status`, `region`, `list`,
 * `listitem`, `paragraph`, `text`, `generic`, …) are deliberately absent.
 */
const NAME_REQUIRED_ROLES: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'combobox',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
]);

/**
 * A snapshot node line: the `- ` bullet, the role, and everything the engine
 * wrote after it (group 2 — a name, state flags, a child marker, a value, or
 * any combination).
 */
const NODE_LINE = /^\s*-\s+([a-z]+)(.*)$/;

/**
 * What a node's accessible NAME looks like where it appears — immediately
 * after the role, before anything else on the line. Playwright writes it as a
 * quoted string (`- button "Add"`); a hand-authored baseline may instead use a
 * regex literal for a name that varies per run (`- textbox /Note \d+/`).
 *
 * Everything else that can follow a role is NOT a name: state flags
 * (`- button [disabled]`), the child marker (`- group:`), a value
 * (`- textbox: Teacher`), or end-of-line. An earlier version of this audit
 * required the line to END after the role and its flags, which made it blind
 * to exactly the case it exists to catch: Playwright puts a control's value on
 * the same line, so a textbox that lost its name while holding text
 * (`- textbox: Teacher`) did not match and was silently passed.
 *
 * The test is anchored to the first character after the role rather than
 * searching the line, because VALUES are frequently quoted too — the committed
 * baselines contain `- slider "Closeness score": "1"`. Un-name that node and a
 * "line contains a quote" test would still call it named.
 */
const NAME_AFTER_ROLE = /^\s*["/]/;

/**
 * Every unnamed name-requiring control in a Playwright ARIA snapshot, as
 * `role` strings — one entry per offending node, so duplicates are preserved
 * (losing one of three unnamed buttons still changes the result).
 *
 * Exported for `accessible-name-audit.test.ts`, which tables the named /
 * unnamed / valued / flagged forms this has to discriminate.
 */
export function findUnnamedControls(snapshot: string): string[] {
  return snapshot.split('\n').flatMap((line) => {
    const node = NODE_LINE.exec(line);
    const role = node?.[1];
    const rest = node?.[2];
    if (role === undefined || rest === undefined) return [];
    if (!NAME_REQUIRED_ROLES.has(role)) return [];
    return NAME_AFTER_ROLE.test(rest) ? [] : [role];
  });
}

/**
 * Controls that are missing an accessible name **today**, keyed by
 * `<snapshotSlug>-<label>` (the baseline file's basename). Every entry is a
 * source defect this audit found and that has not been fixed yet — not an
 * exemption, and never the right place to record a new one.
 *
 * The observed roles are compared to the entry for **exact** equality, so:
 *   - a newly unnamed control fails, even in a snapshot that already has one;
 *   - fixing one also fails, until its entry is deleted here.
 *
 * All three live entries reproduce only under `chromium-matrix`: the other two
 * engines run `@smoke` scenarios only, and none of these are smoke.
 *
 * This list is not a place to record a NEW violation to make a run green. It
 * exists so the audit can be switched on over an imperfect corpus without
 * hiding what is still wrong.
 */
const KNOWN_UNNAMED_CONTROLS: Readonly<Record<string, readonly string[]>> = {
  // FamilyPedigree puts an unlabelled control on the pedigree canvas ahead of
  // the named "Egg Parent"/"Sperm Parent" buttons.
  'matrix-family-pedigree-familypedigree-checklist-resting-state-final': [
    'button',
  ],
  'matrix-family-pedigree-familypedigree-boundaries-grandparents-required-blocked-final':
    ['button'],
  'matrix-family-pedigree-familypedigree-boundaries-children-contributors-required-final':
    ['button'],
  // EgoForm's relative date picker used to expose an unnamed textbox in
  // `egoform-relative-date-range-validation` and `egoform-field-mega-all-
  // components`; the committed chromium baselines still record the bare node.
  // It now carries a name, so there is no entry here — and because a stored
  // `- textbox` with no name matches ANY name, only this audit would notice if
  // it regressed.
};

function describeFailure(
  key: string,
  observed: readonly string[],
  known: readonly string[],
): string {
  const surplus = [...observed];
  const missing: string[] = [];
  for (const role of known) {
    const at = surplus.indexOf(role);
    if (at === -1) missing.push(role);
    else surplus.splice(at, 1);
  }

  return [
    `Accessible-name audit failed for "${key}".`,
    `  observed unnamed controls: [${observed.join(', ')}]`,
    `  recorded for this snapshot: [${known.join(', ')}]`,
    ...(surplus.length > 0
      ? [
          '',
          `  ${surplus.length} operable control(s) gained NO accessible name: ${surplus.join(', ')}`,
          '  WCAG 4.1.2 requires a name for every one of these roles. Label the',
          '  control in the component source — do NOT record it in',
          '  KNOWN_UNNAMED_CONTROLS to make this pass.',
          "  If it is a dependency's internal sentinel, exclude it from capture",
          '  the way `[data-base-ui-focus-guard]` is excluded in',
          '  e2e/fixtures/matrix-test.ts, so real defects stay visible.',
        ]
      : []),
    ...(missing.length > 0
      ? [
          '',
          `  ${missing.length} recorded violation(s) no longer reproduce: ${missing.join(', ')}`,
          '  If you fixed them, delete this key from KNOWN_UNNAMED_CONTROLS in',
          '  e2e/helpers/accessible-name-audit.ts.',
        ]
      : []),
  ].join('\n');
}

const AUDIT_TIMEOUT_MS = 5_000;
const AUDIT_POLL_MS = 250;

/**
 * The only thing this audit needs of its subject. Declared structurally (a
 * `Locator` satisfies it) so the unit test can drive the polling loop with a
 * scripted sequence of snapshots instead of a browser.
 */
type AriaSnapshotSource = Pick<Locator, 'ariaSnapshot'>;

/**
 * Fail if `main` contains an operable control with no accessible name that is
 * not already recorded in `KNOWN_UNNAMED_CONTROLS`.
 *
 * Polls rather than reading once: a stage captured mid-entrance can briefly
 * expose a control before its label renders, and a one-shot read would make
 * that a flake. A run that is going to fail pays the timeout once; a passing
 * run costs a single snapshot read.
 */
export async function expectNoUnnamedControls(
  main: AriaSnapshotSource,
  key: string,
): Promise<void> {
  const known = [...(KNOWN_UNNAMED_CONTROLS[key] ?? [])].toSorted();
  const expected = known.join(', ');
  const deadline = Date.now() + AUDIT_TIMEOUT_MS;
  let observed: string[] = [];

  for (;;) {
    observed = findUnnamedControls(await main.ariaSnapshot()).toSorted();
    if (observed.join(', ') === expected) return;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, AUDIT_POLL_MS));
  }

  throw new Error(describeFailure(key, observed, known));
}
