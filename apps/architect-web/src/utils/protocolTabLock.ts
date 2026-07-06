// Coordinates which tab is the sole editor of a given protocol library row.
//
// Two tabs editing DIFFERENT protocols are independent (separate rows), but two
// tabs on the SAME protocol both autosave into one row (last-writer-wins). To
// prevent that, tabs announce their active protocol over a same-origin
// BroadcastChannel; the second tab to claim an id is told it is not exclusive
// and becomes a read-only view (autosave disabled).
//
// This is a leaf module (no app imports) so it can't create import cycles. A
// redux listener middleware bridges it to the store.

type ClaimMessage = {
  type: 'claim';
  id: string;
  from: string;
  // True when this claim is a re-claim of a just-released protocol. Two ex-
  // duplicates can re-claim the same freed id at the same moment; the flag lets
  // the receiver tie-break by `from` instead of both answering "held" (which
  // would demote both into read-only with no editor).
  reclaim?: boolean;
};
type HeldMessage = { type: 'held'; id: string; from: string };
type ReleaseMessage = { type: 'release'; id: string; from: string };
type LockMessage = ClaimMessage | HeldMessage | ReleaseMessage;

const CHANNEL_NAME = 'architect-protocol-lock';

type ChannelFactory = (name: string) => BroadcastChannel | null;

const defaultChannelFactory: ChannelFactory = (name) => {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(name);
  } catch {
    return null;
  }
};

export type ProtocolTabLock = {
  // Announce this tab is editing `id`. If another tab already holds it, this
  // tab becomes non-exclusive (see onExclusivityChange / isExclusive).
  claimProtocol: (id: string) => void;
  // Announce this tab has stopped editing its current protocol.
  releaseProtocol: () => void;
  // Whether this tab is the sole editor of its currently-claimed protocol.
  isExclusive: () => boolean;
  close: () => void;
};

type CreateOptions = {
  channelFactory?: ChannelFactory;
  onExclusivityChange?: (exclusive: boolean) => void;
};

const isLockMessage = (data: unknown): data is LockMessage => {
  if (typeof data !== 'object' || data === null) return false;
  if (!('type' in data) || !('id' in data)) return false;
  const { type, id } = data;
  return (
    (type === 'claim' || type === 'held' || type === 'release') &&
    typeof id === 'string'
  );
};

export const createProtocolTabLock = (
  options: CreateOptions = {},
): ProtocolTabLock => {
  const channelFactory = options.channelFactory ?? defaultChannelFactory;
  const onExclusivityChange = options.onExclusivityChange;

  const tabId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const channel = channelFactory(CHANNEL_NAME);

  let claimedId: string | null = null;
  // The protocol this tab intends to hold, tracked separately from the transient
  // channel claim: it survives a `pagehide` (which releases the channel claim so
  // a peer can take over while we're frozen) so a `pageshow` bfcache restore —
  // which does not remount React or re-run the hook — can re-claim it.
  let desiredId: string | null = null;
  let exclusive = true;
  // Whether our current claim is a re-claim of a just-freed protocol. Only used
  // to tie-break the simultaneous-re-claim race; a fresh (user/bfcache) claim
  // leaves it false so an established holder always wins over a newcomer.
  let claimedViaReclaim = false;

  const setExclusive = (next: boolean) => {
    if (next === exclusive) return;
    exclusive = next;
    onExclusivityChange?.(exclusive);
  };

  const post = (message: LockMessage) => {
    channel?.postMessage(message);
  };

  const onChannelMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!isLockMessage(data)) return;

    switch (data.type) {
      case 'claim': {
        // Another tab wants `data.id`. If we hold it, normally answer "held" so
        // they yield to us. But if we BOTH just re-claimed the same freed
        // protocol at the same moment, mutual "held" would demote both of us to
        // read-only with no editor and no recovery. In that one case break the
        // tie by `from`: the higher tab id yields instead of answering.
        if (data.id === claimedId && exclusive) {
          const mutualReclaim = claimedViaReclaim && data.reclaim === true;
          if (mutualReclaim && tabId > data.from) {
            setExclusive(false);
            claimedViaReclaim = false;
          } else {
            post({ type: 'held', id: claimedId, from: tabId });
          }
        }
        break;
      }
      case 'held': {
        // A tab that already holds our claimed protocol answered our claim;
        // we are the newcomer and must not edit it.
        if (data.id === claimedId) {
          setExclusive(false);
          claimedViaReclaim = false;
        }
        break;
      }
      case 'release': {
        // The holder of a protocol we're waiting on has let it go. Re-claim it;
        // if no one else answers "held", we become the exclusive editor. Mark it
        // as a re-claim so a simultaneous re-claim by another ex-waiter is
        // tie-broken by `from` rather than demoting us both.
        if (data.id === claimedId && !exclusive) {
          claimedViaReclaim = true;
          setExclusive(true);
          post({ type: 'claim', id: claimedId, from: tabId, reclaim: true });
        }
        break;
      }
    }
  };

  channel?.addEventListener('message', onChannelMessage);

  // Broadcast a release for whatever we were holding. Clear `claimedId` FIRST:
  // a waiting duplicate reacts to the release synchronously (real channels are
  // async, but the fake test bus is sync), re-claims, and we must no longer
  // answer "held" for the id we just let go.
  const releaseCurrent = () => {
    const previousId = claimedId;
    claimedId = null;
    if (previousId !== null) {
      post({ type: 'release', id: previousId, from: tabId });
    }
  };

  const claim = (id: string) => {
    if (id === claimedId) return;
    releaseCurrent();
    claimedId = id;
    // A fresh (user-initiated or bfcache-restore) claim, not a race re-claim: an
    // established holder always wins over it.
    claimedViaReclaim = false;
    // Optimistically assume exclusivity; a "held" reply demotes us.
    setExclusive(true);
    post({ type: 'claim', id, from: tabId });
  };

  // Release our claim when the tab is unloaded (closed or navigated away) so a
  // duplicate tab waiting on the same protocol can reclaim it. pagehide is more
  // reliable than beforeunload/unload for this (fires on mobile bfcache too).
  // `desiredId` is kept so a bfcache restore (onPageShow) can re-claim.
  const onPageHide = () => {
    releaseCurrent();
  };
  // A bfcache restore brings the page back WITHOUT remounting React, so the hook
  // never re-runs to re-claim — but pagehide already released our channel claim
  // and a peer may have taken over. Re-assert the intended claim: if a peer now
  // holds it, its "held" reply demotes us (disabling autosave); otherwise we
  // regain exclusivity. Without this, a restored tab would keep autosave enabled
  // while no longer answering "held", letting two tabs autosave one protocol.
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted && desiredId !== null) {
      claim(desiredId);
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
  }

  return {
    claimProtocol: (id: string) => {
      desiredId = id;
      claim(id);
    },
    releaseProtocol: () => {
      desiredId = null;
      claimedViaReclaim = false;
      releaseCurrent();
      setExclusive(true);
    },
    isExclusive: () => exclusive,
    close: () => {
      desiredId = null;
      releaseCurrent();
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('pageshow', onPageShow);
      }
      channel?.removeEventListener('message', onChannelMessage);
      channel?.close();
    },
  };
};
