import { type Event } from '~/app/_actions/actions';

export const getTotalProtocolsInstalled = (events: Event[]) => {
  const nProtocolsInstalled = events.reduce((count, event) => {
    if (event.type === 'ProtocolInstalled') {
      return count + 1;
    }
    return count;
  }, 0);

  return nProtocolsInstalled;
};
