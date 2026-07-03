export type PickedFile = {
  name: string;
  file: File;
};

export async function pickProtocolFile(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // `.netcanvas` has no iOS UTI, so any mime constraint greys the file out in
    // the Files picker. Hint the extension only and rely on post-selection zip
    // validation (extractZip in importProtocol) to reject non-protocol files.
    input.accept = '.netcanvas';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, file } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
