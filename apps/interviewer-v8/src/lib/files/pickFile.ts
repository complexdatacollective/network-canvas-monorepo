export type PickedFile = {
  name: string;
  file: File;
};

export async function pickProtocolFile(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.netcanvas,application/zip';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, file } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
