// the voice of God: pressing Enter opens a line at the bottom of the screen;
// Enter with text sends it straight into Divine Right's head (no one else
// hears anything, and it isn't logged); Enter on an empty line closes it

import { divineRight } from "./characters/divineRight";
import type { Humanoid } from "./humanoid";
import { simNow } from "./time";

export function initGodVoice(humanoids: Humanoid[]) {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Inject thoughts into Divine Right";
  Object.assign(input.style, {
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "420px",
    maxWidth: "calc(100vw - 40px)",
    boxSizing: "border-box",
    font: "14px monospace",
    padding: "6px 8px",
    background: "#fff",
    border: "1px solid #000",
    borderRadius: "0",
    display: "none",
    zIndex: "10",
  });
  document.body.appendChild(input);

  const close = () => {
    input.value = "";
    input.style.display = "none";
    input.blur();
  };

  input.addEventListener("keydown", (e) => {
    // typing must not trip global hotkeys (Tab sidebar toggle, etc.)
    e.stopPropagation();
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key !== "Enter") return;
    const text = input.value.trim();
    if (!text) {
      close();
      return;
    }
    const prophet = humanoids.find(
      (humanoid) => humanoid.character === divineRight && !humanoid.dead,
    );
    if (!prophet) return; // absent or dead — the message stays in the box
    prophet.remember(`You think to yourself: "${text}"`);
    // a message from God is worth reacting to right away
    prophet.nextThinkAt = Math.min(prophet.nextThinkAt, simNow() + 1000);
    input.value = ""; // sent — the next Enter (empty) closes the line
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement | null;
    if (target === input) return; // the input's own listener handles it
    // don't hijack Enter aimed at other controls (sidebar buttons)
    if (target && (target.tagName === "INPUT" || target.tagName === "BUTTON"))
      return;
    e.preventDefault();
    input.style.display = "block";
    input.focus();
  });
}
