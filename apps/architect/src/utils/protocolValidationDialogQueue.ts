type InvalidProtocolDialogOpenEvent = {
  type: 'open';
  id: string;
  errorMessage: string;
  onConfirm: () => void;
  onClose: () => void;
};

type InvalidProtocolDialogCloseEvent = {
  type: 'close';
  id: string;
};

export type ProtocolValidationDialogEvent =
  | InvalidProtocolDialogOpenEvent
  | InvalidProtocolDialogCloseEvent;

let pendingEvents: ProtocolValidationDialogEvent[] = [];
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

export const enqueueProtocolValidationDialogEvent = (
  event: ProtocolValidationDialogEvent,
): void => {
  pendingEvents = [...pendingEvents, event];
  emit();
};

export const subscribeProtocolValidationDialogEvents = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const takeProtocolValidationDialogEvents =
  (): ProtocolValidationDialogEvent[] => {
    const taken = pendingEvents;
    if (taken.length === 0) return taken;
    pendingEvents = [];
    return taken;
  };
