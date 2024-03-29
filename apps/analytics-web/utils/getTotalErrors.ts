import { type Event } from '~/app/_actions/actions';

export const getTotalErrors = (events: Event[]) => {
  const nErrors = events.reduce((count, event) => {
    if (event.type === 'Error') {
      return count + 1;
    }
    return count;
  }, 0);

  return nErrors;
};
