/**
 * Everything a host has to do for this package, and nothing else.
 *
 * Written down here because it is the deliverable: a future Studio integration
 * needs to know what it is signing up for, and the list a reader can check
 * against is the one the proof host is actually built from — every line below
 * is a call `StudioHostSurface` or `StageEditorStoryHost` makes.
 *
 * What is NOT on the list is as much the point. There is no store, no router,
 * no protocol document, no codebook model, no undo stack and no validation of
 * the host's own: the session owns all of it, and a host that tried to keep a
 * second copy would be the thing that drifts.
 *
 * A module of its own rather than a constant inside the proof host's surface,
 * because three readers outside that file need it: the package README's host
 * contract section is generated from it (`__tests__/readme.test.ts`), Studio's
 * adapter test pins which of these it discharges, and the proof host's stories
 * count it. A `.stories.tsx` cannot be any of their sources.
 */
export const HOST_RESPONSIBILITIES: readonly string[] = Object.freeze([
  'Open the session on the stage the researcher chose, with the protocol’s sections, the revision they were read at, and the access the section lock granted.',
  'Commit each batch of commands in the order it is made, then answer with receiveAuthoritativeUpdate and acknowledge under the revision that committed it.',
  'Pass on what changes elsewhere: receiveAuthoritativeUpdate for a newer revision, and replaceAuthoritativeStage when the stage itself moved while this session was only reading.',
  'Own the section lock: setAccess to read-only the moment it is lost, and back to editable when it is regained under its new epoch.',
  'Carry a compound edit to the protocol as one atomic change, and answer with what it applied, blocked or refused.',
  'Provide the resource gateway, and apply a finish’s stage document and its resource manifest in the same revision.',
]);

/**
 * The session option or method that discharges each responsibility above, in
 * the same order.
 *
 * Sentences cannot be read by a test. These can: a host's source either names
 * the option it passes and the method it calls or it does not, which is how
 * `apps/studio/client/src/editor/__tests__/hostResponsibilities.test.ts` says
 * which of the six Studio's adapter wires today without anybody keeping a
 * second list of them.
 *
 * A responsibility is discharged when the host names EVERY call on its row.
 * The rows are the calls that cannot be substituted for one another: opening a
 * session without `access` is not opening it, and answering a commit without
 * `acknowledge` leaves the batch pending for ever.
 */
export const HOST_RESPONSIBILITY_CALLS: readonly (readonly string[])[] =
  Object.freeze([
    Object.freeze(['protocolSections', 'manifestRevision', 'access']),
    Object.freeze(['onCommands', 'acknowledge']),
    Object.freeze(['receiveAuthoritativeUpdate', 'replaceAuthoritativeStage']),
    Object.freeze(['setAccess']),
    Object.freeze(['onCompoundEdit']),
    Object.freeze(['resourceGateway']),
  ]);
