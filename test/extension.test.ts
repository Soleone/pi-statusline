import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import piStatusline from "../index.js";
import { loadStatuslineConfig } from "../src/config.js";

type Handler = (...args: unknown[]) => unknown;

function fakePi() {
  const events = new Map<string, Handler>();
  const commands = new Map<string, { description?: string; handler: Handler }>();
  const shortcuts = new Map<string, Handler>();
  const pi = {
    on: (event: string, handler: Handler) => { events.set(event, handler); },
    registerCommand: (name: string, options: { description?: string; handler: Handler }) => {
      commands.set(name, options);
    },
    registerShortcut: (key: string, options: { handler: Handler }) => { shortcuts.set(key, options.handler); },
    exec: async () => ({ stdout: "", stderr: "", code: 0 }),
  } as unknown as ExtensionAPI;
  return { pi, events, commands, shortcuts };
}

function fakeContext(agentDir: string) {
  const reload = vi.fn(async () => undefined);
  const notices: Array<{ message: string; level: string | undefined }> = [];
  const ctx = {
    cwd: agentDir,
    mode: "tui",
    hasUI: true,
    sessionManager: { getBranch: () => [], getHeader: () => undefined },
    getContextUsage: () => undefined,
    ui: {
      notify: (message: string, level?: string) => { notices.push({ message, level }); },
      setFooter: () => undefined,
      setStatus: () => undefined,
    },
    reload,
  };
  return { ctx: ctx as never, reload, notices };
}

let agentDir = "";
let savedAgentDir: string | undefined;

beforeEach(() => {
  savedAgentDir = process.env.PI_CODING_AGENT_DIR;
  agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-statusline-ext-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
});

afterEach(() => {
  if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
  fs.rmSync(agentDir, { recursive: true, force: true });
});

describe("pi-statusline extension", () => {
  it("registers the footer handlers and the statusline command", () => {
    const { pi, events, commands } = fakePi();
    piStatusline(pi);
    expect([...events.keys()]).toContain("session_start");
    expect([...events.keys()]).toContain("session_shutdown");
    expect(commands.has("statusline")).toBe(true);
  });

  it("starts with the defaults when no settings file exists", () => {
    const { pi } = fakePi();
    expect(() => piStatusline(pi)).not.toThrow();
    expect(loadStatuslineConfig().config).toMatchObject({ enabled: true });
  });
  it("persists a toggle and reloads", async () => {
    const { pi, commands } = fakePi();
    piStatusline(pi);
    const { ctx, reload } = fakeContext(agentDir);

    await commands.get("statusline")!.handler("off", ctx);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(loadStatuslineConfig().config.enabled).toBe(false);
    expect(fs.existsSync(path.join(agentDir, "pi-statusline.json"))).toBe(true);
  });

  it("edits the hide list and reports state", async () => {
    const { pi, commands } = fakePi();
    piStatusline(pi);
    const { ctx, notices } = fakeContext(agentDir);
    const run = (args: string) => commands.get("statusline")!.handler(args, ctx);

    await run("hide sub-bar");
    expect(loadStatuslineConfig().config.hiddenStatuses).toContain("sub-bar");

    await run("unhide SUB-BAR");
    expect(loadStatuslineConfig().config.hiddenStatuses).not.toContain("sub-bar");

    await run("status");
    expect(notices.at(-1)!.message).toMatch(/Hidden statuses:/);

    await run("nonsense");
    expect(notices.at(-1)!.message).toContain("Usage: /statusline");
  });

  it("surfaces config warnings at session start", async () => {
    fs.writeFileSync(path.join(agentDir, "pi-statusline.json"), "not json", "utf8");
    const { pi, events } = fakePi();
    piStatusline(pi);
    const { ctx, notices } = fakeContext(agentDir);
    await events.get("session_start")!({}, ctx);
    expect(notices.some((entry) => entry.message.includes("pi-statusline defaults"))).toBe(true);
  });
});
