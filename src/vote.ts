// the audience's phone screen: pick a display name, watch the show, and
// guess the killer. A right guess earns up to 1000 points, decaying to zero
// at the moment the killer goes for the kill — and changing your pick
// re-stamps your vote, so later switches are worth less. Once the kill
// happens this page becomes the final scoreboard.

type VoteState = {
  active: boolean;
  cast?: string[];
  startAt?: number;
  tally?: Record<string, number>;
  ended?: boolean;
  killer?: string | null;
  results?: { user: string; pick: string; points: number }[] | null;
};

const app = document.getElementById("app")!;
let user = localStorage.getItem("vote.name") ?? "";
let pick = localStorage.getItem("vote.pick") ?? "";
let state: VoteState = { active: false };
let recast = false; // re-register the saved pick once, in case the server restarted

async function refresh() {
  try {
    const response = await fetch("/api/vote/state");
    state = (await response.json()) as VoteState;
  } catch {
    // server briefly away — keep showing the last known state
  }
  // a pick left over from an older round no longer applies — the saved
  // round stamp (startAt) is what tells this round from the previous one,
  // since a reset game usually has the exact same cast
  const roundStamp = String(state.startAt ?? "");
  if (state.active && localStorage.getItem("vote.round") !== roundStamp) {
    pick = "";
    localStorage.removeItem("vote.pick");
    localStorage.setItem("vote.round", roundStamp);
    recast = true; // nothing to re-register in a fresh round
  }
  if (state.active && pick && !(state.cast ?? []).includes(pick)) {
    pick = "";
    localStorage.removeItem("vote.pick");
  }
  if (!recast && state.active && !state.ended && user && pick) {
    recast = true;
    void send(pick); // same pick keeps its server-side timestamp
  }
  render();
}

async function send(name: string) {
  try {
    await fetch("/api/vote/cast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user, pick: name }),
    });
  } catch {
    // dropped vote — the next tap retries
  }
}

function castVote(name: string) {
  pick = name;
  localStorage.setItem("vote.pick", name);
  render();
  void send(name).then(refresh);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function header(subtitle: string, eyebrow = "") {
  app.append(el("p", "eyebrow", eyebrow));
  const title = el("h1");
  title.append("Who's the ", el("em", undefined, "killer"), "?");
  app.append(title);
  app.append(el("p", "sub", subtitle));
  app.append(el("hr", "rule"));
}

// the front-facing idle cell of a character's walk sheet, as a mugshot
function mugshot(name: string) {
  const mug = el("span", "mug");
  mug.style.backgroundImage = `url(/${name.toLowerCase()}_walk.png)`;
  return mug;
}

// the name gate renders once and is left alone so polling doesn't wipe the
// half-typed name
function renderNameForm() {
  if (document.getElementById("nameForm")) return;
  app.replaceChildren();
  header(
    "One of your coworkers is secretly white cat in disguise. It's your job to figure out who it is before it's too late.",
  );
  const panel = el("div", "panel");
  panel.id = "nameForm";
  const label = el("label", undefined, "Name");
  const input = el("input");
  input.placeholder = "sign here";
  input.maxLength = 24;
  const join = el("button", "join", "Vote Now");
  join.onclick = () => {
    const name = input.value.trim();
    if (!name) return;
    user = name;
    localStorage.setItem("vote.name", name);
    render();
  };
  input.onkeydown = (event) => {
    if (event.key === "Enter") join.click();
  };
  panel.append(label, input, join);
  app.append(panel);
}

function renderWaiting() {
  app.replaceChildren();
  header("The office is quiet. The case opens with the show.");
  app.append(
    el("p", "footer", "Keep this page open — the suspects arrive shortly."),
  );
}

function renderVoting() {
  app.replaceChildren();
  header("Accuse early for more points. Changing your accusation costs you.");
  const tally = state.tally ?? {};
  const total = Math.max(
    1,
    Object.values(tally).reduce((sum, count) => sum + count, 0),
  );
  // sorted by accusations, this list doubles as the live scoreboard
  const names = [...(state.cast ?? [])].sort(
    (a, b) => (tally[b] ?? 0) - (tally[a] ?? 0),
  );
  for (const name of names) {
    const count = tally[name] ?? 0;
    const button = el("button", "suspect");
    const who = el("span", "who");
    who.append(
      el("span", "name", name),
      el("span", "tail", `${count} accusation${count === 1 ? "" : "s"}`),
    );
    const heat = el("span", "heat");
    heat.style.width = `${(count / total) * 100}%`;
    button.append(mugshot(name), who);
    if (name === pick) {
      button.classList.add("picked");
      button.append(el("span", "stamp", "suspect"));
    }
    button.append(heat);
    button.onclick = () => castVote(name);
    app.append(button);
  }
  app.append(el("p", "footer"));
  const footer = app.lastElementChild!;
  footer.append(el("b", undefined, user));
  footer.append(pick ? ` · accusing ${pick}` : " · tap a suspect to accuse");
}

function renderResults() {
  app.replaceChildren();
  header("The case is closed.", "spellbrush p.d. · case closed");
  if (state.killer) {
    app.append(el("p", "reveal", `The killer was ${state.killer}.`));
  }
  const results = state.results ?? [];
  results.forEach((result, i) => {
    const row = el("div", "verdict-row");
    if (i === 0) row.classList.add("first");
    if (result.user === user) row.classList.add("me");
    const det = el("span", "det", result.user + " ");
    det.append(el("span", "accused", `accused ${result.pick}`));
    row.append(
      el("span", "rank", String(i + 1)),
      det,
      el("span", "pts", String(result.points)),
    );
    app.append(row);
  });
  if (results.length === 0) {
    app.append(
      el("p", "sub", "Nobody signed the case file. The killer walks."),
    );
  }
}

function render() {
  if (!user) return renderNameForm();
  if (!state.active) return renderWaiting();
  if (state.ended) return renderResults();
  renderVoting();
}

void refresh();
setInterval(() => void refresh(), 2000);
