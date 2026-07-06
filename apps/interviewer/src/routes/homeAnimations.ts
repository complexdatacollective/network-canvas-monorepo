export const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      when: 'beforeChildren',
      staggerChildren: 0.05,
    },
  },
  exit: {
    transition: { when: 'afterChildren', staggerChildren: 0.05 },
  },
} as const;

// Cascade variants for the Protocols branch. AnimatePresence needs the
// keyed child to be a motion component so descendant exits can complete
// before unmount; these variants don't visually animate the wrapper —
// `opacity: 1` is an identity value used so motion treats the variant
// as real and reliably propagates the hidden / visible / exit labels
// down to the deck section, chevron row, and StatusRow. With empty
// variants motion can short-circuit on first mount and skip the
// cascade entirely, leaving children at their natural state.
//
// `when: 'beforeChildren'` is intentionally omitted: the wrapper has no
// real animation to "complete" first, and pairing it with empty
// variants is what was suppressing the entry cascade. Instead,
// `delayChildren` + `staggerChildren` drive timing explicitly.
//
// Entry uses staggerDirection: -1 so the cascade walks the JSX tree in
// reverse — StatusRow first, deck section last — matching the visual
// expectation that the deck is the focal element and arrives after its
// surrounding chrome.
export const protocolsContainerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.08,
      staggerChildren: 0.25,
      staggerDirection: -1,
    },
  },
  exit: {
    transition: {
      when: 'afterChildren',
      staggerChildren: 0.06,
      staggerDirection: -1,
    },
  },
} as const;
