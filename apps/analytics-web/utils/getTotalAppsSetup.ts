import getEvents from '~/db/getEvents';

export const getTotalAppsSetup = async () => {
  const events = await getEvents();

  const nAppsSetup = events.reduce((count, event) => {
    if (event.type === 'AppSetup') {
      return count + 1;
    }
    return count;
  }, 0);

  return nAppsSetup;
};
