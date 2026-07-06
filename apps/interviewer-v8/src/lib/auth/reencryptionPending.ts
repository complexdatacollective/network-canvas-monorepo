// A "the on-enrol re-encryption sweep did not finish" signal, persisted in
// localStorage rather than in the Dexie/IndexedDB settings row the sweep itself
// writes to. That independence is the point: if the IndexedDB store is what
// failed (e.g. a QuotaExceededError that also aborted the sweep), writing the
// retry flag back to the same store could fail too, silently losing the signal
// and permanently defeating the retry — leaving plaintext rows on a device the
// user believes is secured. localStorage has its own quota and already holds the
// vault record, so a tiny boolean here survives an IndexedDB failure.
const KEY = 'interviewer-v8:reencryption-pending';

export function setReencryptionPending(pending: boolean): void {
  try {
    if (pending) {
      localStorage.setItem(KEY, '1');
    } else {
      localStorage.removeItem(KEY);
    }
  } catch (error) {
    // Surface rather than swallow: if even this write fails, the retry signal is
    // lost and the next unlock won't re-sweep. There is no more-durable medium to
    // fall back to, so the console error is the last resort.
    console.error('Persisting the re-encryption-pending flag failed', error);
  }
}

export function isReencryptionPending(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
