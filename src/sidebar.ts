import { describeBody, describeMovement } from "./agent";
import { agentCalls } from "./calls";
import { setCameraAutoFollow } from "./camera";
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
    background: "#fff",
    borderLeft: "1px solid #000",
    padding: "12px",
    font: "12px monospace",
    zIndex: "10",
  });

  const buttonStyle = {
    font: "14px monospace",
    padding: "4px 12px",
    background: "#fff",
    border: "1px solid #000",
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

  const selectedHeader = document.createElement("h3");
  selectedHeader.textContent = "selected";
  const selectedSection = document.createElement("div");

  const callsHeader = document.createElement("h3");
  callsHeader.textContent = "agent calls";
  const callsSection = document.createElement("div");

  sidebar.append(
    buttons,
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
    renderSelected();
    renderCalls();
  }, REFRESH_MS);

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
        `<pre style="white-space:pre-wrap;background:#f4f4f4;padding:6px;margin:6px 0">${esc(call.messages)}</pre>`,
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
