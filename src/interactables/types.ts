import { camera } from "../camera";
import type { Humanoid } from "../humanoid";
import type { SimTool } from "../tools";
import { spriteFor, spriteReady } from "../sprites";
import { PALETTE } from "../theme";

export abstract class Interactable {
  abstract name: string;
  abstract onGroundDescription: string | ((humanoid: Humanoid) => string);

  // art for the thing as it lies on the floor: the image is drawn centred on
  // its position at `width` world units across, and its height follows from the
  // file's own aspect. Without one, the name is drawn instead — which is all
  // most interactables need, and all any of them had before.
  onGroundArt: { src: string; width: number } | null = null;

  position: { x: number; y: number } | null = null;

  constructor(x?: number, y?: number) {
    if (x !== undefined && y !== undefined) {
      this.position = { x, y };
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.imageSmoothingEnabled = false;
    // carried items have no position — they live in the holder's hands, and
    // nothing is drawn for them
    if (this.position) {
      if (this.drawArt(ctx)) return;
      ctx.save();

      ctx.font = "6px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // outlined, because the floor underneath it can be any material
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.strokeStyle = PALETTE.itemTextShadow;
      ctx.strokeText(this.name, this.position.x, this.position.y);
      ctx.fillStyle = PALETTE.itemText;
      ctx.fillText(this.name, this.position.x, this.position.y);

      ctx.restore();
    }
  }

  // true once the art has been drawn; false while it is still loading, or when
  // there is none, so the caller falls back to the name
  private drawArt(ctx: CanvasRenderingContext2D): boolean {
    const art = this.onGroundArt;
    if (!art || !this.position) return false;
    const image = spriteFor(art.src);
    if (!spriteReady(image)) return false;
    const height = (art.width * image.naturalHeight) / image.naturalWidth;
    // these files are far bigger than the few world units they're drawn at, so
    // they're always being minified: filter, or the edges crawl as the camera
    // moves. Same call the humanoid sprites make.
    ctx.save();
    ctx.imageSmoothingEnabled = art.width * camera.zoom < image.naturalWidth;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      image,
      this.position.x - art.width / 2,
      this.position.y - height / 2,
      art.width,
      height,
    );
    ctx.restore();
    return true;
  }

  onGroundTools(_humanoid: Humanoid): SimTool[] {
    return [];
  }

  // an amusement: something to do purely for its own sake. Offered to everyone
  // except a humanoid with murder on their mind, who would otherwise stand at
  // the cabinet playing rhythm games because it is the one concrete, zero-risk
  // action in the room and the intent is only prose.
  distraction = false;
}

// items live either in a Room's interactables array (with a position) or in
// a Humanoid's carrying array (position null)
export abstract class Item extends Interactable {
  abstract inInventoryDescription: string | ((humanoid: Humanoid) => string);

  inInventoryTools(_humanoid: Humanoid): SimTool[] {
    return [];
  }

  // whether this person may take it right now. It still shows up in the room's
  // description when this is false — it is there to be seen, just not carried
  // off — but pick_up won't offer it, so the model never picks a move it can't
  // make.
  canBeTakenBy(_humanoid: Humanoid): boolean {
    return true;
  }
}

export abstract class Drinkable extends Item {
  abstract onDrink(humanoid: Humanoid): void;
}
