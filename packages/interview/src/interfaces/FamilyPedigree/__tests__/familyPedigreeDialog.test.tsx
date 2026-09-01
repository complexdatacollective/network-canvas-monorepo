import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type {
  CustomDialog,
  WizardDialog,
} from '@codaco/fresco-ui/dialogs/DialogProvider';

import { useFamilyPedigreeStore } from '../FamilyPedigreeContext';
import { bridgeDialogContent } from '../familyPedigreeDialog';
import { createFamilyPedigreeStore, type VariableConfig } from '../store';

const VAR_CONFIG: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'label',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'relationshipType',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGestationalCarrier',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

function makeStore() {
  return createFamilyPedigreeStore(
    new Map(),
    new Map(),
    new Map(),
    VAR_CONFIG,
    undefined,
    undefined,
    undefined,
    undefined,
    'gendered',
  );
}

/**
 * Reads the pedigree store, so it renders its framing only where the bridge
 * reached and throws the provider invariant everywhere else.
 */
function StoreProbe() {
  const framing = useFamilyPedigreeStore((s) => s.framing);
  return <span>framing:{framing}</span>;
}

describe('bridgeDialogContent', () => {
  it('bridges dialog children', () => {
    const bridged = bridgeDialogContent(makeStore(), {
      type: 'form',
      title: 'Edit',
      children: <StoreProbe />,
    });

    render(<>{bridged.children}</>);
    expect(screen.getByText('framing:gendered')).toBeVisible();
  });

  it('bridges a custom dialog footer', () => {
    const bridged: CustomDialog = bridgeDialogContent(makeStore(), {
      type: 'custom',
      title: 'Custom',
      footer: <StoreProbe />,
    });

    render(<>{bridged.footer}</>);
    expect(screen.getByText('framing:gendered')).toBeVisible();
  });

  it('bridges every wizard step slot — title, description and content', () => {
    const bridged: WizardDialog = bridgeDialogContent(makeStore(), {
      type: 'wizard',
      title: 'Add child',
      steps: [
        {
          title: <StoreProbe />,
          description: <StoreProbe />,
          content: StoreProbe,
        },
      ],
    });

    const step = bridged.steps[0];
    if (!step) throw new Error('expected a bridged step');
    const StepContent = step.content;

    render(
      <>
        {step.title}
        {step.description}
        <StepContent />
      </>,
    );
    expect(screen.getAllByText('framing:gendered')).toHaveLength(3);
  });

  // The dialog chrome gates these slots on truthiness before rendering them, so
  // a bridged `''`/`null` would become a truthy element and grow an empty
  // description paragraph or footer the caller never asked for.
  it('leaves a falsy renderable slot falsy', () => {
    const bridged: WizardDialog = bridgeDialogContent(makeStore(), {
      type: 'wizard',
      title: 'Add child',
      steps: [{ title: 'Details', description: '', content: StoreProbe }],
    });

    expect(bridged.steps[0]?.description).toBe('');
  });

  it('preserves non-renderable step properties', () => {
    const skip = () => true;
    const bridged: WizardDialog = bridgeDialogContent(makeStore(), {
      type: 'wizard',
      title: 'Add child',
      cancelLabel: 'Stop',
      steps: [
        { title: 'Details', content: StoreProbe, skip, nextLabel: 'Onwards' },
      ],
    });

    expect(bridged.cancelLabel).toBe('Stop');
    expect(bridged.steps[0]?.skip).toBe(skip);
    expect(bridged.steps[0]?.nextLabel).toBe('Onwards');
  });

  it('bridges a wizard progress component and forwards its props', () => {
    function Progress({
      currentStep,
      totalSteps,
    }: {
      currentStep: number;
      totalSteps: number;
    }) {
      const framing = useFamilyPedigreeStore((s) => s.framing);
      return (
        <span>
          {framing}:{currentStep}/{totalSteps}
        </span>
      );
    }

    const bridged: WizardDialog = bridgeDialogContent(makeStore(), {
      type: 'wizard',
      title: 'Add child',
      progress: Progress,
      steps: [{ title: 'Details', content: StoreProbe }],
    });

    const BridgedProgress = bridged.progress;
    if (!BridgedProgress) throw new Error('expected a bridged progress');

    render(<BridgedProgress currentStep={1} totalSteps={3} />);
    expect(screen.getByText('gendered:1/3')).toBeVisible();
  });

  // `progress` is three-state and `null` is load-bearing: `useWizardState`
  // computes `showProgress = progress !== undefined ? progress !== null : true`.
  // Wrapping `null` would make it a component, flipping every pedigree wizard's
  // deliberately suppressed step indicator back on.
  it('passes a null progress through untouched', () => {
    const bridged: WizardDialog = bridgeDialogContent(makeStore(), {
      type: 'wizard',
      title: 'Add child',
      progress: null,
      steps: [{ title: 'Details', content: StoreProbe }],
    });

    expect(bridged.progress).toBeNull();
  });

  it('leaves an absent progress absent', () => {
    const bridged: WizardDialog = bridgeDialogContent(makeStore(), {
      type: 'wizard',
      title: 'Add child',
      steps: [{ title: 'Details', content: StoreProbe }],
    });

    expect('progress' in bridged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Structural guard
// ---------------------------------------------------------------------------

const USE_DIALOG_MODULE = '@codaco/fresco-ui/dialogs/useDialog';
const DIALOG_PROVIDER_MODULE = '@codaco/fresco-ui/dialogs/DialogProvider';

/**
 * Does an import clause (everything between `import` and `from`) bring any
 * VALUE into scope? A type-only import cannot reach the runtime and so cannot
 * produce the missing-provider crash the guard below is about.
 */
function isValueImportClause(clause: string): boolean {
  const trimmed = clause.trim();
  if (trimmed.startsWith('type ')) return false;

  const namedOnly = /^\{([\s\S]*)\}$/.exec(trimmed);
  if (namedOnly?.[1] !== undefined) {
    return namedOnly[1]
      .split(',')
      .map((binding) => binding.trim())
      .filter((binding) => binding.length > 0)
      .some((binding) => !binding.startsWith('type '));
  }

  return trimmed.length > 0;
}

/**
 * Every value-import clause in `source` that names `moduleSpecifier`.
 *
 * The `(?:(?!\bimport\b|;)[\s\S])*?` body is load-bearing, not defensive
 * padding: a plain lazy `[\s\S]*?` anchors at the FIRST `import` token in the
 * file and happily swallows whole statements until it reaches the target
 * module, so the clause it captures belongs to some earlier import. That reads
 * a file whose first import happens to be `import type …` as having no value
 * import at all — which silently exempts most of this interface's files from
 * the guard below — and conversely flags a legitimate type-only import that
 * follows any value import. Refusing to cross an `import` keyword or a `;`
 * pins each match to its own statement.
 */
function valueImportClausesFrom(
  source: string,
  moduleSpecifier: string,
): string[] {
  const pattern = new RegExp(
    `\\bimport\\b((?:(?!\\bimport\\b|;)[\\s\\S])*?)\\bfrom\\s*['"]${moduleSpecifier.replaceAll('/', '\\/')}['"]`,
    'g',
  );
  return [...source.matchAll(pattern)]
    .map((match) => match[1] ?? '')
    .filter((clause) => isValueImportClause(clause));
}

function importsValueFrom(source: string, moduleSpecifier: string): boolean {
  return valueImportClausesFrom(source, moduleSpecifier).length > 0;
}

describe('importsValueFrom', () => {
  const cases: [string, boolean][] = [
    ["import useDialog from 'M';", true],
    ["import { useDialog } from 'M';", true],
    ["import useDialog, { type Foo } from 'M';", true],
    ["import type useDialog from 'M';", false],
    ["import type { Foo } from 'M';", false],
    ["import { type Foo, type Bar } from 'M';", false],
    ["import { type Foo, bar } from 'M';", true],
    // Multi-statement sources: the classifier must attribute each clause to its
    // own statement. Both directions regressed a lazy whole-file match.
    ["import type { Foo } from 'A';\nimport useDialog from 'M';", true],
    ["import bar from 'A';\nimport type useDialog from 'M';", false],
    ["import bar from 'A';\nimport type {\n  Foo,\n} from 'M';", false],
    ["import type { Foo } from 'A';\nimport { useDialog } from 'M';", true],
    ["import a from 'A';\nimport b from 'B';\nimport c from 'M';", true],
    ["import a from 'M';\nimport type b from 'M';", true],
    ["import type a from 'M';\nimport type b from 'M';", false],
  ];

  it.each(cases)('classifies %j', (source, expected) => {
    expect(importsValueFrom(source, 'M')).toBe(expected);
  });
});

describe('FamilyPedigree dialog entry point', () => {
  const interfaceRoot = path.join(import.meta.dirname, '..');
  const entryPoint = path.join(interfaceRoot, 'familyPedigreeDialog.tsx');

  const sourceFiles = readdirSync(interfaceRoot, {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => file !== entryPoint);

  const relative = (file: string) => path.relative(interfaceRoot, file);

  it('scans the interface source files', () => {
    const scanned = sourceFiles.map(relative);
    expect(scanned.length).toBeGreaterThan(20);
    // Named so a move or rename cannot quietly shrink the guard's reach to a
    // pile of stories and tests that still clears a bare count check.
    expect(scanned).toEqual(
      expect.arrayContaining([
        'FamilyPedigree.tsx',
        'FamilyPedigreeContext.tsx',
        'components/PedigreeChecklist.tsx',
        'components/wizards/AddChildWizard.tsx',
        'components/wizards/AddParentWizard.tsx',
        'components/wizards/AddSiblingWizard.tsx',
        'components/wizards/DefineParentsWizard.tsx',
        'components/wizards/EgoCellWizard.tsx',
        'pedigree-layout/components/PedigreeView.tsx',
      ]),
    );
  });

  // Dialog content is rendered from DialogProvider's subtree, where the
  // pedigree store context is out of reach, so every pedigree dialog has to be
  // opened through `useFamilyPedigreeDialog` — which bridges the store back in
  // by construction. Reaching the raw dialog API instead is how #1390 happened
  // (and, before it, the Add-partner recurrence fixed in e87cb05a0), whether
  // that is fresco-ui's `useDialog` or `DialogContext` read directly.
  // Type-only imports are fine: they cannot reach the runtime.
  it('is the only place that reaches the raw fresco-ui dialog API', () => {
    const offenders = sourceFiles.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return (
        importsValueFrom(source, USE_DIALOG_MODULE) ||
        valueImportClausesFrom(source, DIALOG_PROVIDER_MODULE).some((clause) =>
          clause.includes('DialogContext'),
        )
      );
    });

    expect(offenders.map(relative)).toEqual([]);
  });

  // The guard is only worth having if it actually fires. Re-run it against
  // every real interface file with the offending import spliced in, at the top
  // of the import block and at the bottom of it, so neither a leading
  // `import type …` nor a trailing one can hide the next recurrence.
  it('detects the offending import wherever it is added to a real file', () => {
    const offendingImport = `import useDialog from '${USE_DIALOG_MODULE}';`;
    const missed: string[] = [];

    for (const file of sourceFiles) {
      const lines = readFileSync(file, 'utf8').split('\n');
      const importLines = lines
        .map((line, index) => (/^import\b/.test(line) ? index : -1))
        .filter((index) => index !== -1);
      if (importLines.length === 0) continue;

      for (const anchor of [importLines[0]!, importLines.at(-1)!]) {
        const spliced = [
          ...lines.slice(0, anchor),
          offendingImport,
          ...lines.slice(anchor),
        ].join('\n');
        if (!importsValueFrom(spliced, USE_DIALOG_MODULE)) {
          missed.push(`${relative(file)} @ line ${String(anchor + 1)}`);
        }
      }
    }

    expect(missed).toEqual([]);
  });
});
