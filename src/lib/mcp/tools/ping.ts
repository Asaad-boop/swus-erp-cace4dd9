import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "ping",
  title: "Ping",
  description: "Health check that echoes a message back. Use to verify the MCP server is reachable.",
  inputSchema: {
    message: z.string().min(1).describe("Text to echo back."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ message }) => ({
    content: [{ type: "text", text: `pong: ${message}` }],
  }),
});