// One Image per path, shared by everything that draws it — humanoids, the
// whitecat reveal, items lying on the floor. Nothing here waits for a load:
// callers check `complete` and skip a frame, which is why a sprite can be asked
// for during the first frames without the draw loop stalling.
const cache = new Map<string, HTMLImageElement>();

export function spriteFor(src: string): HTMLImageElement {
  let image = cache.get(src);
  if (!image) {
    image = new Image();
    image.src = src;
    cache.set(src, image);
  }
  return image;
}

export function spriteReady(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0;
}
