import type { Humanoid } from "../humanoid";

export class Status {
  name = "";
  owner: Humanoid;

  describeStatus(_humanoid: Humanoid, _viewer: Humanoid): string | null {
    return null;
  }
  update(_dt: number, _now: number, _world: Humanoid) {}

  remove() {
    this.owner.statuses.delete(this.name);
  }

  constructor(owner: Humanoid) {
    this.owner = owner;
  }
}
