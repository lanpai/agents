import type { Humanoid } from "../humanoid";

export abstract class Interactable {
  abstract name: string;
  abstract onGroundDescription: string | ((humanoid: Humanoid) => string);

  droppedPosition: { x: number; y: number } | null = null;

  constructor(x: number, y: number) {
    this.droppedPosition = { x, y };
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.imageSmoothingEnabled = false;
    if (this.droppedPosition) {
      ctx.save();

      ctx.font = "6px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#000";
      ctx.fillText(this.name, this.droppedPosition.x, this.droppedPosition.y);

      ctx.restore();
    }
  }
}

export abstract class Item extends Interactable {
  abstract inInventoryDescription: string | ((humanoid: Humanoid) => string);

  holder: Humanoid | null = null;

  constructor(x: number, y: number) {
    super(x, y);
  }
}
