import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import {
  type StageFormStoreApi,
  useStageEditorForm,
} from '../../form/stageEditorContext.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { useStageName } from '../useStageName.ts';

const NAME = { name: 'Stage name' } as const;

/**
 * The stage's name as a host mounts it: the title in the header slot, OUTSIDE
 * the `<form>` element. A control drawn outside its form has a form owner only
 * because the `form` attribute gives it one, so a test that mounted the name
 * as a section would pass with the association missing entirely.
 */
describe('the stage name drawn outside the form', () => {
  it('belongs to the stage form it is drawn outside of', () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: <></>,
    });

    const box = screen.getByRole('textbox', NAME);
    // Which form OWNS the control, not which one contains it.
    expect(box.closest('form')).toBeNull();
    expect((box as HTMLTextAreaElement).form?.id).toBe(harness.formId);
  });

  /**
   * Enter saves the stage rather than typing a line into the name. Implicit
   * submission is a property of the control's FORM OWNER: without the
   * association Enter does nothing at all, with no newline and no save.
   */
  it('saves the stage when Enter is pressed in the name', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: <></>,
    });

    await harness.user.type(screen.getByRole('textbox', NAME), ' (revised)');
    await harness.user.keyboard('{Enter}');

    await waitFor(() => {
      expect(harness.protocolSections()['stage:information-1']).toMatchObject({
        label: 'Information (revised)',
      });
    });
  });
});

/** A host's rename dialog, opened and closed while the editor stays open. */
function RenameDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen((was) => !was)}>
        Toggle rename dialog
      </button>
      {open ? <RenameReader /> : null}
    </>
  );
}

function RenameReader() {
  const { value } = useStageName();
  return <p>Renaming: {value}</p>;
}

describe('a second reader of the name', () => {
  /**
   * Holders are counted, so a host may bind the name wherever it likes. When
   * they were not, a rename dialog closing deleted the live field and took its
   * refusals with it: the title was left bound to nothing, and the editor's
   * own "this stage has to be called something" replaced by the form's generic
   * "not finished".
   */
  it('comes and goes without taking the registered field with it', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'information-unnamed',
        type: 'Information',
        fields: { label: 'Named', title: 'Welcome', items: [] },
      },
      sections: <RenameDialog />,
    });

    const box = screen.getByRole('textbox', NAME);
    await harness.user.clear(box);
    expect(await harness.submit()).toBeNull();
    const refusal = await screen.findByText('This field is required.');
    expect(refusal).toBeInTheDocument();

    // Opened, and reading the same name.
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle rename dialog' }),
    );
    expect(screen.getByText(/^Renaming:/)).toBeInTheDocument();

    // Closed again. The field is still registered, still refused, and still
    // the thing the researcher types into.
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle rename dialog' }),
    );
    expect(screen.getByText('This field is required.')).toBeInTheDocument();

    await harness.user.type(screen.getByRole('textbox', NAME), 'Named again');
    expect(screen.getByRole('textbox', NAME)).toHaveValue('Named again');

    // Still a field the FORM holds rather than a value parked beside it:
    // emptied again, the refusal is about the name rather than about a setting
    // nothing shows, which is what reaching the schema instead would look like.
    await harness.user.clear(screen.getByRole('textbox', NAME));
    expect(await harness.submit()).toBeNull();
    expect(harness.problems()).toEqual([]);
  });
});

/**
 * A host with a rename menu and no stage title at all: `useStageName` and
 * nothing else.
 */
function MenuRename() {
  const { value, setValue } = useStageName();

  return (
    <>
      <p>Called: {value}</p>
      <button type="button" onClick={() => setValue('Renamed from a menu')}>
        Rename from a menu
      </button>
      <button type="button" onClick={() => setValue('')}>
        Clear the name
      </button>
    </>
  );
}

/** A host whose only relationship with the name is `useStageName`. */
const menuOnlyHost = {
  sections: <MenuRename />,
  // No title. That is the whole case: this host draws no control at all.
  header: () => null,
} as const;

describe('a host that draws no name control at all', () => {
  it('renames the stage, and the save carries it', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      ...menuOnlyHost,
    });
    await harness.opened();

    await harness.user.click(
      screen.getByRole('button', { name: 'Rename from a menu' }),
    );
    expect(screen.getByText('Called: Renamed from a menu')).toBeInTheDocument();

    const saved = await harness.submit();
    expect(saved?.stageDocument.label).toBe('Renamed from a menu');
  });

  /**
   * And the name is a FIELD of the form, not a value parked beside it. Without
   * the registration the form has nothing at `label` to validate, the submit
   * runs, and the protocol schema refuses about "a setting this editor does
   * not show" instead of about the name just emptied. The save is refused
   * either way, so WHICH refusal it is, is the whole of it.
   *
   * `harness.submit()` cannot be used: it waits for a refusal to appear on
   * screen, and this host draws no control for one to appear beside.
   */
  it('refuses an emptied name as the name, not as a setting nothing shows', async () => {
    let storeApi: StageFormStoreApi | null = null;
    const harness = renderStageEditor({
      stageId: 'information-1',
      ...menuOnlyHost,
      header: () => (
        <FormProbe
          onStore={(api) => {
            storeApi = api;
          }}
        />
      ),
    });
    await harness.opened();

    await harness.user.click(
      screen.getByRole('button', { name: 'Clear the name' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save stage' }),
    );

    await waitFor(() => {
      const state = (storeApi as StageFormStoreApi | null)?.getState();
      expect(state?.getFieldErrors('label')).toHaveLength(1);
    });
    // Refused before the protocol was asked, so the schema said nothing.
    expect(harness.problems()).toEqual([]);
    expect(harness.protocolSections()['stage:information-1']).toMatchObject({
      label: 'Information',
    });
  });
});

/** The stage form's own store, for a host that renders nothing to read. */
function FormProbe({
  onStore,
}: {
  onStore: (storeApi: StageFormStoreApi) => void;
}) {
  onStore(useStageEditorForm().storeApi);
  return null;
}

/**
 * A rename offered to somebody who may not write.
 */
function SpectatorRename() {
  const { setValue } = useStageName();

  return (
    <button type="button" onClick={() => setValue('Renamed by a spectator')}>
      Rename from a menu
    </button>
  );
}

describe('a spectator', () => {
  /**
   * The name is drawn OUTSIDE the editor's own `FieldsDisabled`, so being
   * unable to write is decided by the hook — a host with a rename menu and no
   * control writes through it and nothing else. Refused out loud: a write that
   * vanished would look like one that worked.
   */
  it('cannot rename the stage from a menu', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      readOnly: true,
      sections: <SpectatorRename />,
    });
    await harness.opened();

    const before = screen.getByRole('textbox', NAME);
    expect(before).toHaveValue('Information');

    await harness.user.click(
      screen.getByRole('button', { name: 'Rename from a menu' }),
    );

    expect(screen.getByRole('textbox', NAME)).toHaveValue('Information');
    expect(
      await screen.findByText(
        'This stage is read-only, so your change was not made. Somebody else is editing it.',
      ),
    ).toBeInTheDocument();
  });
});
