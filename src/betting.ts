import type { Humanoid } from "./humanoid";

export function initBetting(humanoids: Humanoid[]) {
  const select = document.createElement("select");
  select.name = "bet";
  for (const name of humanoids.map((humanoid) => humanoid.character.name)) {
    const option = document.createElement("option");
    option.value = name;
    option.innerText = name;
    select.appendChild(option);
  }

  Object.assign(select.style, {
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
    // display: "none",
    zIndex: "10",
  });
  document.body.appendChild(select);
}
