// ring buffer of recent agent API calls, for the debug sidebar

export type AgentCall = {
  humanoid: string;
  kind: "decision" | "memory" | "phonemes" | "warp" | "subtitle" | "tts";
  messages: string; // the user prompt sent
  tools: string[]; // tool names offered
  result: string[]; // tool calls returned (or the error)
  status: "pending" | "ok" | "error";
  at: number; // wall-clock, display only
};

const MAX_CALLS = 80;

export const agentCalls: AgentCall[] = [];

export function recordAgentCall(
  call: Pick<AgentCall, "humanoid" | "kind" | "messages" | "tools">,
): AgentCall {
  const record: AgentCall = {
    ...call,
    result: [],
    status: "pending",
    at: Date.now(),
  };
  agentCalls.push(record);
  if (agentCalls.length > MAX_CALLS) agentCalls.shift();
  return record;
}
