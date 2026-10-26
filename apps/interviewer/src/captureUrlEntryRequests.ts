// Imported by `main.tsx` before anything else, for its side effect alone:
// module evaluation follows import order, so this strips Architect's request
// parameter from the address before analytics initialises and records it.
import { captureUrlEntryRequests } from './lib/handoff/urlEntryRequests';

captureUrlEntryRequests();
