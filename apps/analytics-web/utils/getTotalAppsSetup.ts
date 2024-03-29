import { type Event } from '~/app/_actions/actions';

export const getTotalAppsSetup = (events: Event[]) => {
  const nAppsSetup = events.reduce((count, event) => {
    if (event.type === 'AppSetup') {
      return count + 1;
    }
    return count;
  }, 0);

  return nAppsSetup;
};
