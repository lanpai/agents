import type { Humanoid } from "../humanoid";

export abstract class Interactable {
  abstract name: string;
  abstract onGroundDescription: string | ((humanoid: Humanoid) => string);

  position: { x: number; y: number } | null = null;

  constructor(x: number, y: number) {
    this.position = { x, y };
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.imageSmoothingEnabled = false;
    if (this.position) {
      ctx.save();

      ctx.font = "6px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#000";
      ctx.fillText(this.name, this.position.x, this.position.y);

      ctx.restore();
    }
  }

  canInteract(_humanoid: Humanoid) {
    return false;
  }
  interact(_humanoid: Humanoid) {}
}

export abstract class Item extends Interactable {
  abstract inInventoryDescription: string | ((humanoid: Humanoid) => string);

  holder: Humanoid | null = null;

  constructor(x: number, y: number) {
    super(x, y);
  }
}

export abstract class Drinkable extends Item {
  abstract onDrink(humanoid: Humanoid): void;
}
