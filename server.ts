import Anthropic from "@anthropic-ai/sdk";

// fail fast: a hung upstream request would otherwise pin a frontend decision
// slot for the SDK default of 10 minutes
const client = new Anthropic({ timeout: 15000, maxRetries: 1 });

Bun.serve({
  port: 3001,
  routes: {
    "/api/agent": {
      POST: async (req) => {
        const body = (await req.json()) as {
          system: string;
          messages: Anthropic.MessageParam[];
          tools: Anthropic.Tool[];
          tool_choice?: Anthropic.ToolChoice;
          max_tokens?: number;
        };
        try {
          const message = await client.messages.create({
            model: "claude-sonnet-5",
            max_tokens: Math.min(body.max_tokens ?? 300, 1000),
            system: body.system,
            messages: body.messages,
            tools: body.tools,
            tool_choice: body.tool_choice ?? { type: "any" },
            thinking: { type: "disabled" },
            output_config: { effort: "low" },
          });
          return Response.json(message);
        } catch (error) {
          if (error instanceof Anthropic.RateLimitError) {
            return Response.json({ error: "rate limited" }, { status: 429 });
          }
          if (error instanceof Anthropic.APIError) {
            return Response.json({ error: error.message }, { status: error.status ?? 500 });
          }
          return Response.json({ error: String(error) }, { status: 500 });
        }
      },
    },
  },
});

console.log("agent API listening on http://localhost:3001");
