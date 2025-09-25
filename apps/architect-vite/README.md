## Outstanding issues

- there's no protocol "name" field in the protocol, so it isn't clear what to do with the protocol name in the UI.
- haven't implemented loading a local protocol. This will need thinking about, as assets will need to be uploaded? perhaps they can be stored in the browser somehow?
- removed sortable HOC, meaning that any components that could previously be dragged to be sorted won't work. Need to reimplement with motion.
- ideally need to refactor away from redux in general (towards zustand), but this is a huge task. perhaps migrating the protocols store would work, keeping form migration until later.
