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
    input.style.display = 'none';
    const finish = (picked: PickedFile | null) => {
      input.remove();
      resolve(picked);
    };
    input.onchange = () => {
      const file = input.files?.[0];
      finish(file ? { name: file.name, file } : null);
    };
    input.oncancel = () => finish(null);
    // Safari — most reliably as an installed/standalone PWA — can suspend or
    // GC a file input that is not in the document while the system picker is
    // open, so change/cancel never fire (#886). Keep the input attached for
    // the duration of the pick.
    document.body.appendChild(input);
    input.click();
  });
}
