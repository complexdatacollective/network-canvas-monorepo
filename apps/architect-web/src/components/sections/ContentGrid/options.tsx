export const typeOptions = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'text', label: 'Text' },
];

// Optional display-size treatment for image and video items. "Full size" (the
// empty value) leaves the item unconstrained so it renders at its natural size.
export const sizeOptions = [
  { value: '', label: 'Full size' },
  { value: 'SMALL', label: 'Small' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LARGE', label: 'Large' },
];
