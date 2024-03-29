import { type Event } from '~/app/_actions/actions';

export const getTotalDataExported = (events: Event[]) => {
  const nDataExported = events.reduce((count, event) => {
    if (event.type === 'DataExported') {
      return count + 1;
    }
    return count;
  }, 0);

  return nDataExported;
};
