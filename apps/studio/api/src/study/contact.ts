// The one spelling of "the same address" (#1900).
//
// `participants.email`, `message_deliveries.recipient_address` and
// `participant_contact_optouts`' primary key all hold the normalised form, so
// an opt-out recorded from a provider callback suppresses a delivery enqueued
// from a participant record whatever case either arrived in. #1305 keys
// opt-outs on this value and #1270 dedupes participants on it, so the two have
// to agree about what counts as one address: one function, called at every
// write, rather than a `lower()` remembered at each call site.
//
// Trim and lower-case, and nothing else. Provider-specific folding — dropping
// Gmail's dots, or a `+tag` suffix — would decide that two addresses a
// researcher entered deliberately are one person, and being wrong about that
// silently merges or suppresses a real participant's messages.

export function normalizeContactAddress(address: string): string {
  return address.trim().toLowerCase();
}
