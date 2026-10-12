// This tab's identity, which is what its protocol-builder locks belong to.
//
// Minted once per page load and kept in module memory alone. What a lock has
// to survive is the sockets one document opens — a network blip must not turn
// a researcher into a stranger to the section they still have open — and this
// survives every one of them. It deliberately does not survive a reload: a
// reload takes the draft with it (lock loss discards the draft, #1483), and an
// id kept in `sessionStorage` would be copied into a duplicated tab, where two
// documents presenting one id would both be granted the same section and write
// over each other. A duplicate is a second editor, and the second opens
// read-only behind the first (#1275).

import { createUuid } from './createUuid.ts';

let minted: string | undefined;

export function clientSessionId(): string {
  minted ??= createUuid();
  return minted;
}
