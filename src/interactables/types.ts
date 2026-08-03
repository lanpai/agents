import type { Humanoid } from "../humanoid";
import type { SimTool } from "../tools";
import { PALETTE } from "../theme";

export abstract class Interactable {
  abstract name: string;
  abstract onGroundDescription: string | ((humanoid: Humanoid) => string);

  position: { x: number; y: number } | null = null;

  constructor(x?: number, y?: number) {
    if (x !== undefined && y !== undefined) {
      this.position = { x, y };
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.imageSmoothingEnabled = false;
    if (this.position) {
      ctx.save();

      ctx.font = "6px monospace";
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

  onGroundTools(_humanoid: Humanoid): SimTool[] {
    return [];
  }
}

// items live either in a Room's interactables array (with a position) or in
// a Humanoid's carrying array (position null)
export abstract class Item extends Interactable {
  abstract inInventoryDescription: string | ((humanoid: Humanoid) => string);

  inInventoryTools(_humanoid: Humanoid): SimTool[] {
    return [];
  }
}

export abstract class Drinkable extends Item {
  abstract onDrink(humanoid: Humanoid): void;
}
