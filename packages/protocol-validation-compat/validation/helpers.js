export const errToString = (error) => {
  if (typeof error === 'string') {
    return error;
  }

  const path = Array.isArray(error?.path) ? error.path.join('.') : '';
  const message = error?.message ?? String(error);

  return path ? `${path}: ${message}\n` : `${message}\n`;
};
