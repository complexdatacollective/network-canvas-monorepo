import getEvents from '~/db/getEvents';

export const getTotalProtocolsInstalled = async () => {
  const events = await getEvents();

  const nProtocolsInstalled = events.reduce((count, event) => {
    if (event.type === 'ProtocolInstalled') {
      return count + 1;
    }
    return count;
  }, 0);

  return nProtocolsInstalled;
};
