const MAX_FILES = 6;
const MAX_BYTES = 4 * 1024 * 1024;

export async function filesToDataUrls(files: FileList | File[]): Promise<string[]> {
  const list = Array.from(files);
  if (list.length > MAX_FILES) {
    throw new Error(`At most ${MAX_FILES} photos`);
  }
  const out: string[] = [];
  for (const f of list) {
    if (!f.type.startsWith("image/")) {
      throw new Error(`${f.name} is not an image`);
    }
    if (f.size > MAX_BYTES) {
      throw new Error(`${f.name} is too large (max 4 MB)`);
    }
    out.push(await readFileAsDataUrl(f));
  }
  return out;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}
