import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ArrayField, { type ArrayFieldItemProps } from './ArrayField';

/**
 * Where a removal confirmation sends focus, asked of the confirmation itself.
 *
 * The answer cannot be read off `document.activeElement`: Base UI resolves a
 * return target inside its own popup teardown, and that teardown does not run
 * under jsdom — focus stays wherever the removed control left it whether or
 * not a target was named, so a test written against the focused element passes
 * identically with this feature present and absent.
 *
 * The confirmation is captured instead, and its `finalFocus` resolved at the
 * moment Base UI would resolve it: after the removal has landed.
 */
type CapturedConfirm = {
  finalFocus?: unknown;
  onConfirm?: () => void;
};

const confirms = vi.hoisted(() => [] as CapturedConfirm[]);

vi.mock('../../../dialogs/useDialog', () => ({
  default: () => ({
    confirm: (options: CapturedConfirm) => {
      confirms.push(options);
      return Promise.resolve(true);
    },
  }),
}));

beforeEach(() => {
  confirms.length = 0;
});

type Row = { id: string; label: string };

const promptLabel = {
  id: 'test.arrayField.deleteFocus.prompt',
  defaultMessage: 'prompt',
};

/**
 * A row that registers the control opening its removal, which is how the list
 * finds the row that takes this one's place.
 */
function NamedRow({
  item,
  onDelete,
  deleteTriggerRef,
}: ArrayFieldItemProps<Row>) {
  return (
    <div>
      <span>{item.label}</span>
      <button
        type="button"
        ref={deleteTriggerRef}
        onClick={onDelete}
        aria-label={`Remove ${item.label ?? ''}`}
      >
        Remove
      </button>
    </div>
  );
}

/** A row that registers nothing, for the fallback these tests also pin. */
function AnonymousRow({ item, onDelete }: ArrayFieldItemProps<Row>) {
  return (
    <div>
      <span>{item.label}</span>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Remove ${item.label ?? ''}`}
      >
        Remove
      </button>
    </div>
  );
}

const renderList = (
  labels: string[],
  itemComponent: typeof NamedRow = NamedRow,
) =>
  render(
    <ArrayField<Row>
      value={labels.map((label) => ({ id: label, label }))}
      getId={(item) => item.id}
      onChange={() => undefined}
      itemComponent={itemComponent}
      itemLabel={promptLabel}
      confirmDelete
    />,
  );

const lastConfirm = () => {
  const confirm = confirms.at(-1);
  expect(confirm).toBeDefined();
  return confirm!;
};

/**
 * Answers the confirmation the way the researcher's Delete click does, then
 * resolves the target it named.
 *
 * In that order, because the target does not exist until the removal has
 * landed: a resolver called while the row is still there would answer with the
 * row itself, and a target captured when the confirmation opened would be a
 * detached node by now.
 */
const confirmAndResolveFocus = async (opener: HTMLElement) => {
  const { finalFocus, onConfirm } = lastConfirm();
  expect(typeof finalFocus).toBe('function');
  onConfirm?.();
  await waitFor(() => expect(opener).not.toBeInTheDocument());
  return (finalFocus as () => HTMLElement | null)();
};

const openRemoval = async (
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) => {
  const opener = screen.getByRole('button', { name: `Remove ${label}` });
  await user.click(opener);
  return opener;
};

/**
 * Confirming destroys both the row and the control that opened the
 * confirmation, so focus has nowhere of its own to return to. Sent to the add
 * button it walks the researcher out of the middle of a list they were working
 * down; sent nowhere at all it lands on `<body>`, which Base UI resolves to
 * the first tabbable element in the whole document.
 */
describe('focus after a confirmed removal', () => {
  it('names the row that takes the removed one’s place', async () => {
    const user = userEvent.setup();
    renderList(['one', 'two', 'three']);

    const opener = await openRemoval(user, 'two');

    expect(await confirmAndResolveFocus(opener)).toBe(
      screen.getByRole('button', { name: 'Remove three' }),
    );
  });

  it('names the last row when the last one is removed', async () => {
    const user = userEvent.setup();
    renderList(['one', 'two']);

    const opener = await openRemoval(user, 'two');

    expect(await confirmAndResolveFocus(opener)).toBe(
      screen.getByRole('button', { name: 'Remove one' }),
    );
  });

  it('names the add button when the list is emptied', async () => {
    const user = userEvent.setup();
    renderList(['one']);

    const opener = await openRemoval(user, 'one');

    expect(await confirmAndResolveFocus(opener)).toBe(
      screen.getByRole('button', { name: 'Add Item' }),
    );
  });

  /**
   * A row that registers no control keeps the answer an emptied list gets.
   * Answering `null` would put focus on `<body>` for every list whose rows run
   * their delete from something the list cannot address.
   */
  it('names the add button when the rows register no control', async () => {
    const user = userEvent.setup();
    renderList(['one', 'two'], AnonymousRow);

    const opener = await openRemoval(user, 'one');

    expect(await confirmAndResolveFocus(opener)).toBe(
      screen.getByRole('button', { name: 'Add Item' }),
    );
  });
});
