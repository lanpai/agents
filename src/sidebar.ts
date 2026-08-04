import { describeBody, describeMovement } from "./agent";
import { ANGER_MAX, angerRatio, angerTier, isKiller } from "./anger";
import { agentCalls } from "./calls";
import { setCameraAutoFollow } from "./camera";
import type { Humanoid } from "./humanoid";
import { roomOf } from "./locations";
import { selected } from "./selection";

const REFRESH_MS = 250;

let visible = false;

export function isSidebarOpen(): boolean {
  return visible;
}

export function initSidebar(options: {
  isPaused: () => boolean;
  setPaused: (value: boolean) => void;
  clearData: () => void;
  humanoids: Humanoid[];
}) {
  const sidebar = document.createElement("div");
  Object.assign(sidebar.style, {
    position: "fixed",
    top: "0",
    right: "0",
    bottom: "0",
    width: "380px",
    display: "none",
    overflowY: "auto",
    background: "#161a23",
    color: "#d6dbe4",
    borderLeft: "1px solid #2b3140",
    padding: "12px",
    font: "12px sans-serif",
    zIndex: "10",
  });

  const buttonStyle = {
    font: "14px sans-serif",
    padding: "4px 12px",
    background: "#232a36",
    color: "#d6dbe4",
    border: "1px solid #3d4557",
    borderRadius: "0",
    cursor: "pointer",
    marginRight: "8px",
  };

  const pauseButton = document.createElement("button");
  pauseButton.textContent = "pause";
  Object.assign(pauseButton.style, buttonStyle);
  pauseButton.addEventListener("click", () => {
    options.setPaused(!options.isPaused());
    pauseButton.textContent = options.isPaused() ? "play" : "pause";
  });

  const clearButton = document.createElement("button");
  clearButton.textContent = "clear";
  Object.assign(clearButton.style, buttonStyle);
  clearButton.addEventListener("click", () => options.clearData());

  const buttons = document.createElement("div");
  buttons.append(pauseButton, clearButton);

  const angerHeader = document.createElement("h3");
  angerHeader.textContent = "anger";
  const angerSection = document.createElement("div");

  const selectedHeader = document.createElement("h3");
  selectedHeader.textContent = "selected";
  const selectedSection = document.createElement("div");

  const callsHeader = document.createElement("h3");
  callsHeader.textContent = "agent calls";
  const callsSection = document.createElement("div");

  sidebar.append(
    buttons,
    angerHeader,
    angerSection,
    selectedHeader,
    selectedSection,
    callsHeader,
    callsSection,
  );
  document.body.appendChild(sidebar);

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    visible = !visible;
    sidebar.style.display = visible ? "block" : "none";
    // sidebar open = manual camera; closed = camera follows the action
    setCameraAutoFollow(!visible);
  });

  // keep <details> expansion across re-renders
  const openCalls = new Set<string>();
  let lastCallsKey = "";

  setInterval(() => {
    if (!visible) return;
    pauseButton.textContent = options.isPaused() ? "play" : "pause";
    renderAnger();
    renderSelected();
    renderCalls();
  }, REFRESH_MS);

  // every character's gauge, angriest first — the tier colours are the ones a
  // real gauge would use, so this doubles as a preview of it
  function renderAnger() {
    const rows = [...options.humanoids]
      .sort((a, b) => b.anger - a.anger)
      .map((humanoid) => {
        const tier = angerTier(humanoid.anger);
        const percent = Math.round(angerRatio(humanoid) * 100);
        const label = [
          esc(humanoid.character.name),
          ` <span style="color:#8b93a5">×${humanoid.temper.toFixed(2)}</span>`,
          humanoid.carrying.some((item) => item.name === "Knife")
            ? " 🔪"
            : "",
          humanoid.dead ? " (dead)" : "",
          isKiller(humanoid)
            ? ` ☠ KILLER <span style="color:#8b93a5">${Math.round(humanoid.killerFor)}s</span>`
            : "",
          humanoid.hasKilled ? " (killed)" : "",
        ].join("");
        // the floor is what the drift alone has reached; when the bar sits on
        // it, conversation is contributing nothing
        const floor = Math.round((humanoid.angerFloor / ANGER_MAX) * 100);
        return `
          <div style="margin-bottom:5px">
            <div style="display:flex;justify-content:space-between">
              <span style="color:${tier.color}">${label}</span>
              <span style="color:${tier.color}">${humanoid.anger.toFixed(1)} · ${tier.name}</span>
            </div>
            <div style="position:relative;height:6px;background:#0e1015;border:1px solid #2b3140">
              <div style="position:absolute;inset:0 auto 0 0;width:${percent}%;background:${tier.color}"></div>
              <div style="position:absolute;top:0;bottom:0;left:${floor}%;width:1px;background:#8b93a5"></div>
            </div>
          </div>`;
      });
    angerSection.innerHTML = rows.join("");
  }

  function renderSelected() {
    if (selected.size === 0) {
      selectedSection.innerHTML = "<em>none — box-select humanoids</em>";
      return;
    }
    const blocks: string[] = [];
    for (const humanoid of selected) {
      const carrying =
        humanoid.carrying.map((item) => item.name).join(", ") || "nothing";
      const lines = [
        `<strong>${esc(humanoid.character.name)}</strong> — ${esc(roomOf(humanoid.x, humanoid.y).name)}${humanoid.dead ? " (dead)" : ""}`,
        `${esc(describeMovement(humanoid) ?? "standing still")} · stamina ${Math.round(humanoid.stamina)}/100`,
        esc(describeBody(humanoid) ?? "uninjured"),
        `carrying: ${esc(carrying)}`,
      ];
      if (humanoid.longMemory) {
        lines.push(`<em>${esc(humanoid.longMemory)}</em>`);
      }
      blocks.push(
        `<div style="margin-bottom:10px">${lines.join("<br>")}</div>`,
      );
    }
    selectedSection.innerHTML = blocks.join("");
  }

  function renderCalls() {
    // skip the rebuild (which collapses <details>) unless something changed
    const callsKey = agentCalls
      .map((call) => `${call.at}:${call.status}:${call.result.length}`)
      .join("|");
    if (callsKey === lastCallsKey) return;
    lastCallsKey = callsKey;

    callsSection.innerHTML = "";
    for (const call of [...agentCalls].reverse()) {
      if (
        selected.size !== 0 &&
        !selected
          .values()
          .some(
            (selectedHumanoid) =>
              selectedHumanoid.character.name === call.humanoid,
          )
      )
        continue;

      const key = `${call.at}-${call.humanoid}`;
      const details = document.createElement("details");
      details.open = openCalls.has(key);
      details.style.marginBottom = "8px";
      details.addEventListener("toggle", () => {
        if (details.open) openCalls.add(key);
        else openCalls.delete(key);
      });

      const summary = document.createElement("summary");
      summary.style.cursor = "pointer";
      summary.textContent = `${call.humanoid} · ${call.kind} · ${call.status} · ${new Date(call.at).toLocaleTimeString()}`;
      details.appendChild(summary);

      const body = document.createElement("div");
      body.innerHTML = [
        `tools: ${esc(call.tools.join(", "))}`,
        `result: ${call.result.length > 0 ? esc(call.result.join("; ")) : "(pending)"}`,
        `<pre style="white-space:pre-wrap;background:#0e1015;padding:6px;margin:6px 0">${esc(call.messages)}</pre>`,
      ].join("<br>");
      details.appendChild(body);

      callsSection.appendChild(details);
    }
    if (agentCalls.length === 0) {
      callsSection.innerHTML = "<em>no calls yet</em>";
    }
  }
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
