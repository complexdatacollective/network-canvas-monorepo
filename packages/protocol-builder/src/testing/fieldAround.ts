/** The field a control belongs to: the element `Field` stamps with its name. */
export const fieldAround = (control: HTMLElement): HTMLElement => {
  const field = control.closest<HTMLElement>('[data-field-name]');
  if (field === null) throw new Error('The control is not inside a field.');
  return field;
};
