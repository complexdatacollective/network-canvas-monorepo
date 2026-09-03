'use client';

import { invariant } from 'es-toolkit';
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useContext,
} from 'react';

import type {
  AnyDialog,
  DialogContextType,
  WizardStep,
} from '@codaco/fresco-ui/dialogs/DialogProvider';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';

import {
  FamilyPedigreeContext,
  FamilyPedigreeStoreBridge,
} from './FamilyPedigreeContext';
import type { FamilyPedigreeStoreApi } from './store';

/**
 * The dialog opener every pedigree dialog is opened through. Exported so the
 * wizard openers can type their `openDialog` parameter against this module
 * rather than fresco-ui's `useDialog`, keeping one entry point for the whole
 * interface.
 */
export type OpenPedigreeDialog = DialogContextType['openDialog'];

/**
 * `openDialog` is imperative: the element it is handed is stored in
 * DialogProvider state and rendered from DialogProvider's own subtree
 * (`DialogProvider.tsx`, siblings of its `{children}`). DialogProvider is
 * mounted above the stage (`Shell.tsx`), so `FamilyPedigreeProvider` is a
 * DESCENDANT of it and its context does not reach dialog content — React
 * resolves context by render position, not by where the element was created.
 *
 * Every pedigree dialog whose content reads the pedigree store therefore has to
 * re-provide it. Doing that by hand at each call site has now failed twice
 * (`e87cb05a0` patched Add-partner; #1390 was the same omission in Edit), so
 * the bridge is applied here, by construction, to every renderable slot of the
 * dialog config.
 */
function bridgeNode(store: FamilyPedigreeStoreApi, node: ReactNode): ReactNode {
  return (
    <FamilyPedigreeStoreBridge store={store}>{node}</FamilyPedigreeStoreBridge>
  );
}

function bridgeComponent<P extends object>(
  store: FamilyPedigreeStoreApi,
  Component: ComponentType<P>,
): ComponentType<P> {
  return function BridgedPedigreeContent(props: P) {
    return (
      <FamilyPedigreeStoreBridge store={store}>
        <Component {...props} />
      </FamilyPedigreeStoreBridge>
    );
  };
}

/**
 * Bridge a renderable slot, but only when there is something to render.
 *
 * A falsy node is left exactly as it was, because the dialog chrome tests these
 * slots for truthiness before rendering them (`Dialog.tsx` gates its
 * description, `DialogFooter` renders nothing when empty). Wrapping `''`/`null`/
 * `false` in a provider element would make it truthy, and the dialog would grow
 * an empty description or footer it never had. Absent slots stay absent: the
 * caller spreads this into `...dialog`, which already carries the original.
 */
function bridgeSlot(
  store: FamilyPedigreeStoreApi,
  key: string,
  node: ReactNode,
): Record<string, ReactNode> {
  return node ? { [key]: bridgeNode(store, node) } : {};
}

function bridgeStep(
  store: FamilyPedigreeStoreApi,
  step: WizardStep,
): WizardStep {
  return {
    ...step,
    // Titles and descriptions render in the dialog chrome, outside the step
    // content, so a live title (e.g. one reflecting the chosen framing) needs
    // its own bridge.
    ...bridgeSlot(store, 'title', step.title),
    ...bridgeSlot(store, 'description', step.description),
    content: bridgeComponent(store, step.content),
  };
}

function bridgeAnyDialog(
  store: FamilyPedigreeStoreApi,
  dialog: AnyDialog,
): AnyDialog {
  const children = bridgeSlot(store, 'children', dialog.children);

  switch (dialog.type) {
    case 'wizard':
      return {
        ...dialog,
        ...children,
        steps: dialog.steps.map((step) => bridgeStep(store, step)),
        // `progress` is three-state: a component renders a custom step
        // indicator, `null` suppresses the default one (`useWizardState`
        // reads `progress !== null`), and `undefined` keeps the default.
        // Only a real component can be bridged — wrapping `null` would turn
        // every pedigree wizard's deliberate suppression into a visible
        // indicator.
        ...(dialog.progress
          ? { progress: bridgeComponent(store, dialog.progress) }
          : {}),
      };
    case 'custom':
      return {
        ...dialog,
        ...children,
        ...bridgeSlot(store, 'footer', dialog.footer),
      };
    default:
      return { ...dialog, ...children };
  }
}

/**
 * Wrap every renderable slot of a dialog config in the pedigree store bridge.
 * Runs once per `openDialog` call, so a wizard step's bridged component
 * identity is stable for that dialog's lifetime and `useWizardState` never
 * remounts a step (which would drop its in-progress values).
 */
export function bridgeDialogContent<D extends AnyDialog>(
  store: FamilyPedigreeStoreApi,
  dialog: D,
): D {
  // The mapping only ever replaces a renderable slot with an equivalent of the
  // same kind, so the dialog's own shape is unchanged. The assertion restores
  // the caller's concrete dialog type, which `openDialog` needs to infer the
  // type its promise resolves to.
  return bridgeAnyDialog(store, dialog) as D;
}

/**
 * The FamilyPedigree interface's single dialog entry point. Identical to
 * fresco-ui's `useDialog`, except that everything opened through it can read
 * the pedigree store.
 *
 * `confirm` passes through untouched: its `title`/`description` are strings,
 * not nodes, so it has nothing to bridge.
 */
export function useFamilyPedigreeDialog(): {
  openDialog: OpenPedigreeDialog;
  confirm: DialogContextType['confirm'];
} {
  const store = useContext(FamilyPedigreeContext);
  invariant(
    store,
    'useFamilyPedigreeDialog must be used within a FamilyPedigreeProvider',
  );

  const { openDialog, confirm } = useDialog();

  const openPedigreeDialog = useCallback<OpenPedigreeDialog>(
    (dialog) => openDialog(bridgeDialogContent(store, dialog)),
    [openDialog, store],
  );

  return { openDialog: openPedigreeDialog, confirm };
}
