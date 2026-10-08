import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, useMemo, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  FormSubmissionResult,
  ValidationContext,
} from '@codaco/fresco-ui/form/store/types';
import type { Codebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { writeSubmissionResult } from '../../../../forms/writeSubmissionResult';
import { runtimeMessages } from '../../../../i18n/runtimeMessages';

// The stable `name` is protocol bookkeeping; only the localized `label` is
// shown to the participant, so the two deliberately differ.
const { nodeTypeDefinition } = vi.hoisted(() => ({
  nodeTypeDefinition: {
    name: 'person_internal',
    label: { en: 'Friend' },
    shape: 'circle',
  },
}));

vi.mock('../../../../hooks/useCelebrate', () => ({
  useCelebrate: () => vi.fn(),
}));

// QuickAddField reads node presentation state through useStageSelector.
// Dispatch on the selector sentinel exported by the (mocked) selector modules.
vi.mock('../../../../selectors/session', () => ({
  getNodeColorSelector: 'getNodeColorSelector',
  getNodeTypeDefinition: 'getNodeTypeDefinition',
  getPromptAdditionalAttributes: 'getPromptAdditionalAttributes',
  resolveNodeShape: () => 'circle',
}));

vi.mock('../../../../selectors/name-generator', () => ({
  getCanAddMultipleNodes: 'getCanAddMultipleNodes',
  getNodeIconName: 'getNodeIconName',
}));

vi.mock('../../../../hooks/useStageSelector', () => ({
  useStageSelector: (selector: unknown) => {
    switch (selector) {
      case 'getNodeColorSelector':
        return 'node-color-seq-1';
      case 'getNodeTypeDefinition':
        return nodeTypeDefinition;
      case 'getPromptAdditionalAttributes':
        return {};
      case 'getNodeIconName':
        return 'add-a-person';
      case 'getCanAddMultipleNodes':
        return true;
      default:
        return undefined;
    }
  },
}));

import { TestProtocolLocalization } from '../../../__tests__/TestProtocolLocalization';
import QuickAddField from '../QuickAddField';

const renderField = (ui: ReactElement) =>
  render(ui, { wrapper: TestProtocolLocalization });

// A refused add's reason is shown with Motion's viewport features, which use
// IntersectionObserver; jsdom has none.
class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

type Add = (values: Record<string, unknown>) => Promise<FormSubmissionResult>;

const added: FormSubmissionResult = { success: true };
const refused = writeSubmissionResult({ meta: { requestStatus: 'rejected' } });
const refusalReason = runtimeMessages.submissionFailed.defaultMessage;

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// Adds that wait until `answer` says how the oldest one still waiting went.
function heldAdds() {
  const waiting: ((result: FormSubmissionResult) => void)[] = [];
  const onAdd = vi.fn<Add>(
    () =>
      new Promise((resolve) => {
        waiting.push(resolve);
      }),
  );
  return {
    onAdd,
    answer: (result: FormSubmissionResult) => waiting.shift()?.(result),
  };
}

const codebook: Codebook = {
  node: {
    person: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: { name: { name: 'Name', label: 'Name', type: 'text' } },
    },
  },
  edge: {},
  ego: { variables: {} },
};

// The people already named, as the field's rules see them.
function contextNaming(names: string[]): ValidationContext {
  return {
    stageSubject: { entity: 'node', type: 'person' },
    codebook,
    network: {
      ego: {
        [entityPrimaryKeyProperty]: 'ego',
        [entityAttributesProperty]: {},
      },
      nodes: names.map((name, index) => ({
        [entityPrimaryKeyProperty]: `person-${index}`,
        type: 'person',
        [entityAttributesProperty]: { name },
      })),
      edges: [],
    },
  };
}

/**
 * A quick-add whose names must be unique. With `namedBeforeAnswer`, an add
 * names the person among the others before it answers, as storing them does,
 * so by the time it answers the name it was given already fails `unique`.
 */
function UniqueNames({
  answer,
  namedBeforeAnswer,
  required,
}: {
  answer: () => Promise<FormSubmissionResult>;
  namedBeforeAnswer: boolean;
  required?: boolean;
}) {
  const [names, setNames] = useState<string[]>([]);
  const validationContext = useMemo(() => contextNaming(names), [names]);

  const onAdd = async (values: Record<string, unknown>) => {
    if (namedBeforeAnswer) {
      const name = String(values.name);
      setNames((current) => [...current, name]);
      // Let the field see the new name, and its rules run against it, first.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return answer();
  };

  return (
    <QuickAddField
      name="name"
      placeholder="Type a name"
      disabled={false}
      unique="name"
      required={required}
      validationContext={validationContext}
      onAdd={onAdd}
    />
  );
}

const openField = async () => {
  await userEvent.click(screen.getByTestId('quick-add-toggle'));
  return screen.findByTestId('quick-add-input');
};

const submit = (input: HTMLElement) => {
  fireEvent.submit(input.closest('form')!);
};

const expectOpen = () =>
  expect(screen.getByTestId('quick-add-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

describe('QuickAddField', () => {
  afterEach(() => {
    cleanup();
  });

  it('stays open when blur is caused by the submit-disabled input', async () => {
    // Simulate a slow submission (e.g. attribute encryption): the form store
    // renders isSubmitting=true, which disables the input mid-submit. WebKit
    // then blurs the focused-but-now-disabled input and dispatches that blur
    // through React. That blur must not close the field.
    const deferred = createDeferred();
    const onAdd = vi.fn<Add>(async () => {
      await deferred.promise;
      return added;
    });

    renderField(
      <QuickAddField
        name="name"
        placeholder="Type a name"
        disabled={false}
        onAdd={onAdd}
      />,
    );

    const input = await openField();
    await userEvent.type(input, 'Alice');
    submit(input);

    // The submitting render must have committed before the engine-style blur.
    await waitFor(() => expect(input).toBeDisabled());

    // jsdom does not blur a control that becomes disabled, so dispatch the
    // blur WebKit produces in that situation ourselves.
    fireEvent.blur(input);

    deferred.resolve();

    await waitFor(() =>
      expect(screen.getByTestId('quick-add-input')).not.toBeDisabled(),
    );

    // Open, cleared, and ready for the next name.
    expectOpen();
    expect(screen.getByTestId('quick-add-input')).toHaveValue('');
    expect(screen.getByTestId('quick-add-input')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByTestId('quick-add-toggle')).toHaveAccessibleName(
      'Quick add input',
    );
  });

  it('treats a dotted protocol variable containing a dangerous segment as opaque', async () => {
    const onAdd = vi.fn<Add>(async () => added);

    renderField(
      <QuickAddField
        name="safe.__proto__.polluted"
        placeholder="Type a name"
        disabled={false}
        onAdd={onAdd}
      />,
    );

    const input = await openField();
    await userEvent.type(input, 'Alice');
    submit(input);

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith({
        'safe.__proto__.polluted': 'Alice',
      });
    });
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });

  it('names the input after the codebook node type label, not its name', async () => {
    renderField(
      <QuickAddField
        name="name"
        placeholder="Type a name"
        disabled={false}
        onAdd={vi.fn<Add>(async () => added)}
      />,
    );

    const input = await openField();

    expect(input).toHaveAccessibleName(/Friend/);
    expect(input).not.toHaveAccessibleName(/person_internal/);
  });

  it('closes when the user blurs the enabled input', async () => {
    renderField(
      <QuickAddField
        name="name"
        placeholder="Type a name"
        disabled={false}
        onAdd={vi.fn<Add>(async () => added)}
      />,
    );

    const input = await openField();
    fireEvent.blur(input);

    await waitFor(() =>
      expect(screen.getByTestId('quick-add-toggle')).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
  });
});

// Whether a name is cleared is what the add says, never something read off
// the order the form's updates happen to arrive in: the end of the submission,
// the add's own answer, and the field's rules re-running against the network
// the add changed can reach the field in any order.
describe.each([
  {
    ordering: 'the add answers at once',
    namedBeforeAnswer: false,
    held: false,
  },
  {
    ordering: 'the add answers in an update of its own, after a wait',
    namedBeforeAnswer: false,
    held: true,
  },
  {
    ordering:
      "the add has already made the name fail the field's rules when it answers",
    namedBeforeAnswer: true,
    held: false,
  },
])('QuickAddField when $ordering', ({ namedBeforeAnswer, held }) => {
  afterEach(() => {
    cleanup();
  });

  async function enterAndAdd(result: FormSubmissionResult) {
    const adds = heldAdds();
    renderField(
      <UniqueNames
        namedBeforeAnswer={namedBeforeAnswer}
        answer={held ? () => adds.onAdd({}) : async () => result}
      />,
    );

    const input = await openField();
    await userEvent.type(input, 'Alice');
    submit(input);

    if (held) {
      await waitFor(() => expect(adds.onAdd).toHaveBeenCalled());
      await act(async () => adds.answer(result));
    }

    await waitFor(() => expect(input).not.toBeDisabled());
    return input;
  }

  it('clears a name that was added, ready for the next', async () => {
    const input = await enterAndAdd(added);

    expectOpen();
    expect(input).toHaveValue('');
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps a name whose add was refused, and says why', async () => {
    const input = await enterAndAdd(refused);

    expectOpen();
    expect(input).toHaveValue('Alice');
    expect(await screen.findByText(refusalReason)).toBeInTheDocument();
  });
});

describe('QuickAddField after a name was added', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps the next name, and says why, when its add is refused', async () => {
    const adds = heldAdds();
    renderField(
      <UniqueNames namedBeforeAnswer={false} answer={() => adds.onAdd({})} />,
    );

    const input = await openField();
    await userEvent.type(input, 'Alice');
    submit(input);
    await waitFor(() => expect(adds.onAdd).toHaveBeenCalledTimes(1));
    await act(async () => adds.answer(added));
    await waitFor(() => expect(input).toHaveValue(''));
    await waitFor(() => expect(input).not.toBeDisabled());

    await userEvent.type(input, 'Bob');
    submit(input);
    await waitFor(() => expect(adds.onAdd).toHaveBeenCalledTimes(2));
    await act(async () => adds.answer(refused));
    await waitFor(() => expect(input).not.toBeDisabled());

    expectOpen();
    expect(input).toHaveValue('Bob');
    expect(await screen.findByText(refusalReason)).toBeInTheDocument();
  });

  it("shows why the next entry breaks the field's rules", async () => {
    const answer = vi.fn(async () => added);
    renderField(<UniqueNames namedBeforeAnswer answer={answer} required />);

    const input = await openField();
    await userEvent.type(input, 'Alice');
    submit(input);
    await waitFor(() => expect(input).toHaveValue(''));
    await waitFor(() => expect(input).not.toBeDisabled());

    // The same name again: the field's own rules refuse it, so the add is
    // never asked, and the reason is shown where the name was entered.
    await userEvent.type(input, 'Alice');
    submit(input);
    await waitFor(() => expect(input).not.toBeDisabled());

    expect(answer).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('Alice');
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'This value is used elsewhere. It must be unique.',
    );
  });
});
