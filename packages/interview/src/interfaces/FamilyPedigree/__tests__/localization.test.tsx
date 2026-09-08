import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import Form from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { interviewCatalogs } from '../../../locales/catalogs';
import BiologicalSexField from '../components/BiologicalSexField';
import ParentPartnershipsStep from '../components/quickStartWizard/ParentPartnershipsStep';
import { buildNodeOptions } from '../components/wizards/buildNodeOptions';
import BioTriadStep, {
  BioTriadConfigProvider,
} from '../components/wizards/steps/BioTriadStep';
import NewParentPartnershipsStep from '../components/wizards/steps/NewParentPartnershipsStep';
import {
  extractCustomAttributes,
  runFamilyPedigreeTransform,
} from '../components/wizards/transforms/personAttributes';
import { FamilyPedigreeContext } from '../FamilyPedigreeContext';
import { getFramingTerms } from '../framingTerms';
import {
  computeRelationshipsToEgo,
  getDisplayLabel,
} from '../pedigree-layout/utils/getDisplayLabel';
import { createFamilyPedigreeStore, type VariableConfig } from '../store';
import { validatePedigreeCompleteness } from '../utils/validatePedigree';

// These tests render the real field, radio, form and locale providers. Only
// unrelated protocol-defined additional fields are absent from the fixture.
vi.mock('../../../hooks/useStageSelector', () => ({
  useStageSelector: () => undefined,
}));
vi.mock('../../../forms/useProtocolForm', () => ({
  default: () => ({ fieldComponents: null }),
}));

// jsdom has no viewport observer; the real SubmitButton uses one for its icon.
beforeAll(() =>
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  ),
);

const config: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'relationshipType',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGestationalCarrier',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};
const literalName = '**Irene** <strong>Ana</strong> :smile:';
const nodes = new Map<string, NcNode>([
  ['ego', { _uid: 'ego', type: 'person', attributes: { isEgo: true } }],
  ['egg', { _uid: 'egg', type: 'person', attributes: {} }],
  [
    'sperm',
    { _uid: 'sperm', type: 'person', attributes: { name: literalName } },
  ],
]);
const edges = new Map<string, NcEdge>([
  [
    'egg-ego',
    {
      _uid: 'egg-ego',
      type: 'family',
      from: 'egg',
      to: 'ego',
      attributes: { relationshipType: ['biological'], gameteRole: ['egg'] },
    },
  ],
  [
    'sperm-ego',
    {
      _uid: 'sperm-ego',
      type: 'family',
      from: 'sperm',
      to: 'ego',
      attributes: { relationshipType: ['biological'], gameteRole: ['sperm'] },
    },
  ],
]);
const es = createAppIntl({ locale: 'es', messages: interviewCatalogs.es });

function familyWrapper() {
  const store = createFamilyPedigreeStore(
    nodes,
    edges,
    new Map(),
    config,
    undefined,
    undefined,
    undefined,
    undefined,
    'gamete',
  );
  return function Family({ children }: { children: ReactNode }) {
    return (
      <FamilyPedigreeContext.Provider value={store}>
        {children}
      </FamilyPedigreeContext.Provider>
    );
  };
}

function Values() {
  const values = useFormValue(['egg-source', 'sperm-source', 'biologicalSex']);
  return <output data-testid="values">{JSON.stringify(values)}</output>;
}

function PreparePartnerships() {
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  return (
    <button
      type="button"
      onClick={() => {
        setFieldValue('egg-source', 'new');
        setFieldValue('sperm-source', 'sperm');
        setFieldValue('new-egg-source.name', 'Ana');
        setFieldValue('egg-parent.name', literalName);
        setFieldValue('sperm-parent.name', 'Irene');
      }}
    >
      Prepare partnership answers
    </button>
  );
}

describe('pedigree built-in localization and recorded data', () => {
  it('localizes framing, relationship fallbacks and validation while preserving stored values', () => {
    const before = JSON.stringify({ nodes: [...nodes], edges: [...edges] });
    expect(getFramingTerms('gamete').eggParent).toBe('Egg Parent');
    expect(getFramingTerms('gamete', es).eggParent).toBe(
      'Progenitor que aportó el óvulo',
    );
    expect(getFramingTerms('gendered', es).eggParent).toBe('Madre');
    expect(
      getDisplayLabel('egg', 'ego', nodes, edges, config, 'gamete', es),
    ).toBe('Progenitor que aportó el óvulo');
    expect(
      getDisplayLabel('sperm', 'ego', nodes, edges, config, 'gamete', es),
    ).toBe(literalName);
    expect(
      computeRelationshipsToEgo('ego', nodes, edges, config).get('egg'),
    ).toBe('Parent');
    const issues = validatePedigreeCompleteness(
      nodes,
      new Map(),
      config,
      { requireGrandparents: 'off', requireChildrenContributors: 'off' },
      false,
      es,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toBe(
      'Debes tener al menos dos progenitores definidos.',
    );
    expect(JSON.stringify({ nodes: [...nodes], edges: [...edges] })).toBe(
      before,
    );
  });

  it('keeps queued person choices and selected identities live when the language changes', async () => {
    const Family = familyWrapper();
    // Created once in English, as an imperative wizard launcher does.
    const options = buildNodeOptions(
      nodes,
      edges,
      config,
      new Set(['egg', 'sperm']),
      'gamete',
    );
    const queuedConfig = {
      existingNodes: options,
      preselection: { eggSource: 'egg', spermSource: 'sperm' },
    };
    const view = (locale: string) => (
      <InterviewI18nProvider requestedLocale={locale}>
        <Family>
          <Form onSubmit={() => ({ success: true })}>
            <Values />
            <BioTriadConfigProvider value={queuedConfig}>
              <BioTriadStep />
            </BioTriadConfigProvider>
          </Form>
        </Family>
      </InterviewI18nProvider>
    );
    const rendered = render(view('en'));
    const eggGroup = screen.getByRole('radiogroup', {
      name: 'Who provided the egg?',
    });
    expect(
      within(eggGroup).getByRole('radio', { name: 'Egg Parent' }),
    ).toBeChecked();
    expect(
      within(eggGroup).getByRole('radio', { name: literalName }),
    ).toBeInTheDocument();
    const before = screen.getByTestId('values').textContent;
    rendered.rerender(view('es'));
    const translated = screen.getByRole('radiogroup', {
      name: '¿Quién aportó el óvulo?',
    });
    expect(
      within(translated).getByRole('radio', {
        name: 'Progenitor que aportó el óvulo',
      }),
    ).toBeChecked();
    expect(
      within(translated).getByRole('radio', { name: literalName }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('values')).toHaveTextContent(before!);
    rendered.rerender(view('en-GB'));
    expect(
      within(
        screen.getByRole('radiogroup', { name: 'Who provided the egg?' }),
      ).getByRole('radio', { name: 'Egg Parent' }),
    ).toBeChecked();
  });

  it('keeps all five biological-sex values and a submitted failure across en, es and en-GB', async () => {
    const submit = vi.fn(() =>
      runFamilyPedigreeTransform(() => {
        extractCustomAttributes({ invalid: { nested: true } });
        return { success: true } as const;
      }),
    );
    const view = (locale: string) => (
      <InterviewI18nProvider requestedLocale={locale}>
        <Form onSubmit={submit}>
          <BiologicalSexField subject="self" />
          <Values />
          <SubmitButton>Submit answers</SubmitButton>
        </Form>
      </InterviewI18nProvider>
    );
    const rendered = render(view('en'));
    const group = screen.getByRole('radiogroup', {
      name: 'What sex were you recorded as at birth?',
    });
    expect(within(group).getAllByRole('radio')).toHaveLength(5);
    await userEvent.click(
      within(group).getByRole('radio', { name: 'Prefer not to say' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit answers' }),
    );
    expect(
      await screen.findByText('An error occurred while submitting the form.'),
    ).toBeInTheDocument();
    rendered.rerender(view('es'));
    const spanish = screen.getByRole('radiogroup', {
      name: '¿Qué sexo se registró cuando naciste?',
    });
    expect(
      within(spanish)
        .getAllByRole('radio')
        .map((el) => el.getAttribute('data-value')),
    ).toEqual(['female', 'male', 'intersex', 'unknown', 'preferNotToSay']);
    expect(
      within(spanish).getByRole('radio', { name: 'Prefiero no responder' }),
    ).toBeChecked();
    expect(screen.getByTestId('values')).toHaveTextContent(
      '"biologicalSex":"preferNotToSay"',
    );
    expect(
      await screen.findByText('Se produjo un error al enviar el formulario.'),
    ).toBeInTheDocument();
    rendered.rerender(view('en-GB'));
    expect(
      screen.getByRole('radio', { name: 'Prefer not to say' }),
    ).toBeChecked();
    expect(
      await screen.findByText('An error occurred while submitting the form.'),
    ).toBeInTheDocument();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('renders names literally in rich field questions and uses the locale conjunction for partnerships', async () => {
    const Family = familyWrapper();
    const view = (locale: string) => (
      <InterviewI18nProvider requestedLocale={locale}>
        <Family>
          <Form onSubmit={() => ({ success: true })}>
            <PreparePartnerships />
            <ParentPartnershipsStep />
            <BioTriadConfigProvider
              value={{ existingNodes: [{ value: 'sperm', label: 'Irene' }] }}
            >
              <NewParentPartnershipsStep />
            </BioTriadConfigProvider>
          </Form>
        </Family>
      </InterviewI18nProvider>
    );
    const rendered = render(view('en'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Prepare partnership answers' }),
    );
    expect(
      screen.getByRole('group', {
        name: `Please indicate which of these people are partners of ${literalName}.`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(literalName, { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Are Ana and Irene partners?' }),
    ).toBeInTheDocument();
    rendered.rerender(view('es'));
    expect(
      screen.getByRole('radiogroup', {
        name: '¿Ana e Irene son o fueron pareja?',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', {
        name: `Indica cuáles de estas personas son o fueron pareja de ${literalName}.`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(literalName, { selector: 'strong' }),
    ).toBeInTheDocument();
  });
});
