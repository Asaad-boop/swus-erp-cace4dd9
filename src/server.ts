import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

const RUNTIME_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_SERVICE_ROLE_KEY",
] as const;

declare global {
  // Runtime-only secret bridge for the server bundle. This is never exposed to
  // browser code; it only exists inside the server fetch handler runtime.
  // eslint-disable-next-line no-var
  var __LOVABLE_RUNTIME_ENV__: Record<string, string> | undefined;
}

function attachRuntimeEnv(env: unknown) {
  if (!env || typeof env !== "object") return;
  const runtimeEnv = env as Record<string, unknown>;
  globalThis.__LOVABLE_RUNTIME_ENV__ ??= {};

  for (const key of RUNTIME_ENV_KEYS) {
    const value = runtimeEnv[key];
    if (typeof value === "string" && value.length > 0) {
      globalThis.__LOVABLE_RUNTIME_ENV__[key] = value;
      if (!process.env[key]) process.env[key] = value;
    }
  }

  if (!globalThis.__LOVABLE_RUNTIME_ENV__.SUPABASE_PUBLISHABLE_KEY) {
    const anonKey = globalThis.__LOVABLE_RUNTIME_ENV__.SUPABASE_ANON_KEY;
    if (anonKey) globalThis.__LOVABLE_RUNTIME_ENV__.SUPABASE_PUBLISHABLE_KEY = anonKey;
  }
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      attachRuntimeEnv(env);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
