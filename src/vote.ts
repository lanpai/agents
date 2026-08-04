// the audience's phone screen: pick a display name, watch the show, and
// call two things — who the killer will turn out to be, and who dies first.
// Each right call earns up to 1000 points, decaying to zero at the moment
// the killer goes for the kill — and changing a pick re-stamps it, so later
// switches are worth less. Once the kill happens this page becomes the
// final scoreboard.

type Question = "killer" | "victim";
const QUESTIONS: {
  key: Question;
  title: string;
  stamp: string;
  counted: (count: number) => string;
}[] = [
  {
    key: "killer",
    title: "Who is the killer?",
    stamp: "suspect",
    counted: (count) => `${count} accusation${count === 1 ? "" : "s"}`,
  },
  {
    key: "victim",
    title: "Who dies first?",
    stamp: "victim",
    counted: (count) => `${count} prediction${count === 1 ? "" : "s"}`,
  },
];

type ResultRow = {
  user: string;
  killerPick: string | null;
  victimPick: string | null;
  killerPoints: number;
  victimPoints: number;
  points: number;
};

type VoteState = {
  active: boolean;
  cast?: string[];
  startAt?: number;
  tally?: Record<Question, Record<string, number>>;
  ended?: boolean;
  answers?: Record<Question, string> | null;
  results?: ResultRow[] | null;
};

const app = document.getElementById("app")!;
let user = localStorage.getItem("vote.name") ?? "";
const picks: Record<Question, string> = {
  killer: localStorage.getItem("vote.pick.killer") ?? "",
  victim: localStorage.getItem("vote.pick.victim") ?? "",
};
let state: VoteState = { active: false };
let recast = false; // re-register saved picks once, in case the server restarted
// the stamp only slams in on the render right after its tap; polling
// re-renders keep it still
let justPicked: { question: Question; name: string } | null = null;

function setPick(question: Question, name: string) {
  picks[question] = name;
  if (name) localStorage.setItem(`vote.pick.${question}`, name);
  else localStorage.removeItem(`vote.pick.${question}`);
}

async function refresh() {
  try {
    const response = await fetch("/api/vote/state");
    state = (await response.json()) as VoteState;
  } catch {
    // server briefly away — keep showing the last known state
  }
  // picks left over from an older round no longer apply — the saved round
  // stamp (startAt) is what tells this round from the previous one, since a
  // reset game usually has the exact same cast
  const roundStamp = String(state.startAt ?? "");
  if (state.active && localStorage.getItem("vote.round") !== roundStamp) {
    setPick("killer", "");
    setPick("victim", "");
    localStorage.setItem("vote.round", roundStamp);
    recast = true; // nothing to re-register in a fresh round
  }
  for (const { key } of QUESTIONS) {
    if (state.active && picks[key] && !(state.cast ?? []).includes(picks[key])) {
      setPick(key, "");
    }
  }
  if (!recast && state.active && !state.ended && user) {
    recast = true;
    // same picks keep their server-side timestamps
    for (const { key } of QUESTIONS) {
      if (picks[key]) void send(key, picks[key]);
    }
  }
  render();
}

async function send(question: Question, name: string) {
  try {
    await fetch("/api/vote/cast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user, question, pick: name }),
    });
  } catch {
    // dropped vote — the next tap retries
  }
}

function castVote(question: Question, name: string) {
  setPick(question, name);
  justPicked = { question, name };
  render();
  void send(question, name).then(refresh);
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
  header(
    "Call the killer and the first victim. Call early for more points — changing a pick costs you.",
  );
  for (const question of QUESTIONS) {
    const tally = state.tally?.[question.key] ?? {};
    const total = Math.max(
      1,
      Object.values(tally).reduce((sum, count) => sum + count, 0),
    );
    app.append(el("h2", "section-h", question.title));
    // sorted by votes, each list doubles as that question's live scoreboard
    const names = [...(state.cast ?? [])].sort(
      (a, b) => (tally[b] ?? 0) - (tally[a] ?? 0),
    );
    for (const name of names) {
      const count = tally[name] ?? 0;
      const button = el("button", "suspect");
      const who = el("span", "who");
      who.append(
        el("span", "name", name),
        el("span", "tail", question.counted(count)),
      );
      const heat = el("span", "heat");
      heat.style.width = `${(count / total) * 100}%`;
      button.append(mugshot(name), who);
      if (name === picks[question.key]) {
        button.classList.add("picked");
        const stamp = el("span", "stamp", question.stamp);
        if (
          justPicked?.question === question.key &&
          justPicked.name === name
        ) {
          stamp.classList.add("slam");
          justPicked = null; // consumed — the next render keeps it still
        }
        button.append(stamp);
      }
      button.append(heat);
      button.onclick = () => castVote(question.key, name);
      app.append(button);
    }
  }
  app.append(el("p", "footer"));
  const footer = app.lastElementChild!;
  footer.append(el("b", undefined, user));
  footer.append(
    picks.killer ? ` · accusing ${picks.killer}` : " · no accusation yet",
  );
  footer.append(
    picks.victim ? ` · fears for ${picks.victim}` : " · no prediction yet",
  );
}

function renderResults() {
  app.replaceChildren();
  header("The case is closed.", "spellbrush p.d. · case closed");
  if (state.answers?.killer) {
    app.append(el("p", "reveal", `The killer was ${state.answers.killer}.`));
  }
  if (state.answers?.victim) {
    app.append(
      el("p", "reveal", `The first victim was ${state.answers.victim}.`),
    );
  }
  const results = state.results ?? [];
  results.forEach((result, i) => {
    const row = el("div", "verdict-row");
    if (i === 0) row.classList.add("first");
    if (result.user === user) row.classList.add("me");
    const det = el("span", "det", result.user + " ");
    const calls = [
      result.killerPick ? `accused ${result.killerPick}` : "no accusation",
      result.victimPick ? `feared for ${result.victimPick}` : "no prediction",
    ];
    det.append(el("span", "accused", calls.join(" · ")));
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
