import { defineMcp } from "@lovable.dev/mcp-js";
import pingTool from "./tools/ping";

export default defineMcp({
  name: "swus-erp-mcp",
  title: "SWUS ERP MCP",
  version: "0.1.0",
  instructions:
    "Agent integrations for the SWUS ERP app. Use `ping` to verify connectivity. More tools can be added under src/lib/mcp/tools/.",
  tools: [pingTool],
});