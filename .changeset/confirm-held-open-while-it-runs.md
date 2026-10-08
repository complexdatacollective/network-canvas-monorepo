---
'@codaco/fresco-ui': minor
---

A confirm dialog (`useDialog().confirm()`) whose `onConfirm` returns a promise
can no longer be cancelled or dismissed while that promise is pending: Cancel
is disabled, the close button is hidden, and Escape and clicks outside it are
ignored until the action completes or fails. Before, cancelling resolved the
confirm as cancelled while the action carried on, so a deletion, reset or
revocation could complete after the person had been told nothing happened.

An action that really stops when its `signal` aborts can opt back in with the
new `abortable: true` option. Cancel and the other ways out then stay
available while it runs, abort the signal, and resolve the confirm as
cancelled.

A promise that rejects with an `AbortError` the dialog did not cause, such as
a request's own timeout, is now shown as an error that can be retried, rather
than leaving the dialog waiting.

The same rule now applies to two other fresco-ui dialogs:

- A wizard dialog cannot be cancelled, dismissed or stepped back while Next is
  running a step's async `beforeNext` handler, and a second press of Next is
  ignored. Before, cancelling mid-way resolved the wizard as cancelled while
  the handler's work, such as an enrolment or a server call, carried on.
- The app update dialog cannot be dismissed while the update is installing.
