import type { Humanoid } from "../humanoid";

export abstract class Status {
  abstract name: string;
  owner: Humanoid;

  abstract describeStatus(
    _humanoid: Humanoid,
    _viewer: Humanoid,
  ): string | null;
  update(_dt: number, _now: number, _world: Humanoid[]) {}

  remove() {
    this.owner.statuses.delete(this.name);
  }

  constructor(owner: Humanoid) {
    this.owner = owner;
  }
}
