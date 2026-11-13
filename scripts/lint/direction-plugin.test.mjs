import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

/**
 * The right-to-left lint rules in tooling/oxlint/plugins/direction.mjs, run
 * through the real oxlint binary on fixture files, so a rule that stops
 * loading or stops matching fails here rather than going quiet in every app.
 */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PLUGIN = join(REPO_ROOT, 'tooling/oxlint/plugins/direction.mjs');
const OXLINT = join(REPO_ROOT, 'node_modules/.bin/oxlint');

const workDirectory = mkdtempSync(join(tmpdir(), 'direction-lint-'));
afterAll(() => rmSync(workDirectory, { recursive: true, force: true }));

const configPath = join(workDirectory, 'oxlintrc.json');
writeFileSync(
  configPath,
  JSON.stringify({
    jsPlugins: [PLUGIN],
    plugins: [],
    categories: {},
    rules: JSON.parse(
      readFileSync(join(REPO_ROOT, 'tooling/oxlint/direction.json'), 'utf8')
        .split('\n')
        .filter((line) => !/^\s*\/\//.test(line))
        .join('\n'),
    ).rules,
  }),
);

let fixtureCount = 0;

/** The rule names oxlint reports for one fixture file, one per finding. */
const lint = (source) => {
  fixtureCount += 1;
  const file = join(workDirectory, `fixture-${fixtureCount}.tsx`);
  writeFileSync(file, source);
  let output;
  try {
    output = execFileSync(
      OXLINT,
      ['-c', configPath, '--disable-nested-config', '-f', 'json', file],
      { encoding: 'utf8' },
    );
  } catch (error) {
    // oxlint exits 1 when it reports an error; the report is still on stdout.
    output = error.stdout;
  }
  return JSON.parse(output).diagnostics.map((diagnostic) =>
    diagnostic.code.replace(/^direction\((.*)\)$/, '$1'),
  );
};

describe('inline-arrow-turns', () => {
  it.each([
    [
      'an arrow drawn with no turn',
      `import { ChevronRight } from 'lucide-react';
       export const A = () => <ChevronRight className="size-4" />;`,
    ],
    [
      'an arrow drawn with no className at all',
      `import { ArrowLeft } from 'lucide-react';
       export const A = () => <ArrowLeft />;`,
    ],
    [
      'an arrow imported under another name',
      `import { ChevronsLeft as First } from 'lucide-react';
       export const A = () => <First aria-hidden />;`,
    ],
    [
      'an arrow passed on as a component',
      `import { ArrowRight } from 'lucide-react';
       export const icons = { next: ArrowRight };`,
    ],
    [
      'an arrow handed to a component that does not turn it',
      `import { ArrowRight } from 'lucide-react';
       declare const Badge: (props: { icon: unknown }) => null;
       export const A = () => <Badge icon={ArrowRight} />;`,
    ],
    [
      'an arrow in a listed component’s other prop',
      `import { ArrowRight } from 'lucide-react';
       declare const NavItem: (props: { badge: unknown }) => null;
       export const A = () => <NavItem badge={ArrowRight} />;`,
    ],
    [
      'an arrow in story args whose meta names a component that does not turn it',
      `import { ArrowRight } from 'lucide-react';
       declare const Badge: unknown;
       export default { component: Badge };
       export const Story = { args: { icon: ArrowRight } };`,
    ],
  ])('reports %s', (_label, source) => {
    expect(lint(source)).toEqual(['inline-arrow-turns']);
  });

  it.each([
    [
      'turned with a scale',
      `import { ChevronRight } from 'lucide-react';
       export const A = () => <ChevronRight className="size-4 rtl:-scale-x-100" />;`,
    ],
    [
      'turned with a rotation inside cx()',
      `import { ArrowLeftToLine } from 'lucide-react';
       const cx = (...c: string[]) => c.join(' ');
       export const A = () => <ArrowLeftToLine className={cx('size-4', 'rtl:rotate-180')} />;`,
    ],
    [
      'turned by a same-file class constant',
      `import { ChevronLeft } from 'lucide-react';
       const iconClass = 'size-4 rtl:-scale-x-100';
       export const A = () => <ChevronLeft className={iconClass} />;`,
    ],
    [
      'turned by fresco-ui’s inlineIconClass',
      `import { MoveRight } from 'lucide-react';
       declare const inlineIconClass: (icon: unknown) => string;
       export const A = () => <MoveRight className={inlineIconClass(MoveRight)} />;`,
    ],
    [
      'handed to a component listed as turning that prop',
      `import { ArrowLeft } from 'lucide-react';
       declare const NavItem: (props: { icon: unknown }) => null;
       export const A = () => <NavItem icon={ArrowLeft} />;`,
    ],
    [
      'in story args whose meta names a component that turns it',
      `import { ArrowLeft } from 'lucide-react';
       declare const NavItem: unknown;
       export default { component: NavItem };
       export const Back = { args: { icon: ArrowLeft, label: 'Back' } };`,
    ],
  ])('accepts an arrow %s', (_label, source) => {
    expect(lint(source)).toEqual([]);
  });

  it.each([
    ['a diagonal arrow', 'ArrowUpRight'],
    ['a two-headed arrow', 'ArrowLeftRight'],
    ['a vertical chevron', 'ChevronDown'],
  ])('leaves %s alone', (_label, icon) => {
    expect(
      lint(`import { ${icon} } from 'lucide-react';
            export const A = () => <${icon} />;`),
    ).toEqual([]);
  });

  it('leaves an arrow from another library alone', () => {
    expect(
      lint(`import { ChevronRight } from './icons';
            export const A = () => <ChevronRight />;`),
    ).toEqual([]);
  });
});

describe('typed-text-matches-parent', () => {
  it.each([
    ['with no className', '<span dir="auto">{name}</span>'],
    ['with other classes', '<p dir="auto" className="truncate">{name}</p>'],
    ['as an expression', `<td dir={'auto'} className="p-2">{name}</td>`],
  ])('reports dir="auto" %s', (_label, jsx) => {
    expect(
      lint(`export const A = ({ name }: { name: string }) => ${jsx};`),
    ).toEqual(['typed-text-matches-parent']);
  });

  it.each([
    [
      'with text-match-parent',
      '<span dir="auto" className="text-match-parent truncate">{name}</span>',
    ],
    ['on a text box', '<input dir="auto" defaultValue={name} />'],
    ['on a text area', '<textarea dir="auto" defaultValue={name} />'],
    ['with another dir', '<span dir="ltr">{name}</span>'],
  ])('accepts dir="auto" %s', (_label, jsx) => {
    expect(
      lint(`export const A = ({ name }: { name: string }) => ${jsx};`),
    ).toEqual([]);
  });

  it('reads a same-file class constant', () => {
    expect(
      lint(`const labelClasses = 'truncate text-match-parent';
            export const A = ({ name }: { name: string }) =>
              <span dir="auto" className={labelClasses}>{name}</span>;`),
    ).toEqual([]);
  });
});

// Fixtures name values they never define; only this rule's reports count.
const textEntryReports = (source) =>
  lint(source).filter((code) => code === 'text-entry');

describe('text-entry', () => {
  it.each([
    ['a text input', '<input aria-label="Name" />'],
    ['a typed text input', '<input type="text" aria-label="Name" />'],
    ['a search input', '<input type="search" aria-label="Search" />'],
    ['a phone input', '<input type="tel" aria-label="Phone" />'],
    [
      'an input whose type is an expression',
      '<input type={kind} aria-label="Name" />',
    ],
    ['a text area', '<textarea aria-label="Notes" />'],
    ['an editable element', '<div contentEditable aria-label="Notes" />'],
    ['a text area with other classes', '<textarea className="w-full p-2" />'],
  ])('reports %s that takes the interface’s direction', (_label, jsx) => {
    expect(
      textEntryReports(
        `export const A = ({ kind }: { kind: string }) => ${jsx};`,
      ),
    ).toEqual(['text-entry']);
  });

  it.each([
    ['with a dir', '<input dir="ltr" aria-label="Phone" />'],
    ['with a computed dir', '<textarea dir={direction} />'],
    [
      'with text-own-direction',
      '<textarea className="text-own-direction w-full" />',
    ],
    [
      'inside an element with a dir',
      '<fieldset dir="ltr"><input aria-label="Code" /></fieldset>',
    ],
    ['hidden from everyone', '<input aria-hidden="true" readOnly />'],
    [
      'inside a hidden element',
      '<div aria-hidden="true"><input name="trap" /></div>',
    ],
    ['drawn by the browser', '<input type="checkbox" aria-label="Agree" />'],
    ['a date', '<input type="date" aria-label="When" />'],
    ['typed by a spread', '<input {...getInputProps()} />'],
    ['not editable', '<div contentEditable={false} />'],
  ])('accepts a box %s', (_label, jsx) => {
    expect(
      textEntryReports(`declare const direction: string;
            declare const getInputProps: () => object;
            export const A = () => ${jsx};`),
    ).toEqual([]);
  });

  it('reads a same-file class constant', () => {
    expect(
      textEntryReports(`const boxClasses = 'text-own-direction w-full';
            export const A = () => <textarea className={boxClasses} />;`),
    ).toEqual([]);
  });
});

describe('logical-popup-side', () => {
  it.each(['left', 'right'])('reports side="%s"', (side) => {
    expect(
      lint(`declare const Content: (p: { side: string }) => null;
            export const A = () => <Content side="${side}" />;`),
    ).toEqual(['logical-popup-side']);
  });

  it.each(['inline-start', 'inline-end', 'top', 'bottom'])(
    'accepts side="%s"',
    (side) => {
      expect(
        lint(`declare const Content: (p: { side: string }) => null;
              export const A = () => <Content side="${side}" />;`),
      ).toEqual([]);
    },
  );
});

describe('base-ui-number-locale', () => {
  it.each([
    [
      'a progress bar',
      `import { Progress } from '@base-ui/react/progress';
       export const A = () => <Progress.Root value={4} />;`,
    ],
    [
      'a number field',
      `import { NumberField } from '@base-ui/react/number-field';
       export const A = () => <NumberField.Root />;`,
    ],
    [
      'a meter imported from the package root',
      `import { Meter } from '@base-ui/react';
       export const A = () => <Meter.Root value={4} />;`,
    ],
    [
      'a slider that formats its value',
      `import { Slider } from '@base-ui/react/slider';
       export const A = () => <Slider.Root format={{ style: 'percent' }} />;`,
    ],
  ])('reports %s with no locale', (_label, source) => {
    expect(lint(source)).toEqual(['base-ui-number-locale']);
  });

  it.each([
    [
      'a progress bar given the locale',
      `import { Progress } from '@base-ui/react/progress';
       export const A = ({ locale }: { locale: string }) => <Progress.Root value={4} locale={locale} />;`,
    ],
    [
      'a slider that formats nothing',
      `import { Slider } from '@base-ui/react/slider';
       export const A = () => <Slider.Root />;`,
    ],
    [
      'a part other than the root',
      `import { Progress } from '@base-ui/react/progress';
       export const A = () => <Progress.Track />;`,
    ],
  ])('accepts %s', (_label, source) => {
    expect(lint(source)).toEqual([]);
  });
});

describe('the workspaces offered right to left', () => {
  // Every workspace whose interface is shown right to left extends the shared
  // config; dropping it from one would switch every rule off there silently.
  it.each([
    'apps/architect',
    'apps/documentation',
    'apps/fresco',
    'apps/interviewer',
    'apps/networkcanvas.com',
    'apps/studio/web',
    'packages/fresco-ui',
    'packages/interview',
    'packages/protocol-builder',
    'packages/site-navigation-element',
    'tooling/storybook',
  ])('%s extends tooling/oxlint/direction.json', (workspace) => {
    const config = readFileSync(
      join(REPO_ROOT, workspace, '.oxlintrc.json'),
      'utf8',
    );
    expect(config).toMatch(/"(?:\.\.\/)+tooling\/oxlint\/direction\.json"/);
  });
});
