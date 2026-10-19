// Imported by `main.tsx` ahead of `./analytics`, for its side effect alone:
// module evaluation follows import order, so this strips Architect 8's request
// parameters from the address before analytics initialises and records it.
import { captureUrlEntryRequests } from './utils/urlEntryRequests';

captureUrlEntryRequests();
