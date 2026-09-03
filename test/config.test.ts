import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_HIDDEN_STATUSES,
  loadStatuslineConfig,
  parseStatuslineConfig,
  writeStatuslineConfig,
} from "../src/config.js";

const tempDirs: string[] = [];

function agentDir(): { readonly dir: string; readonly env: NodeJS.ProcessEnv } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-statusline-"));
  tempDirs.push(dir);
  return { dir, env: { PI_CODING_AGENT_DIR: dir } };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("parseStatuslineConfig", () => {
  it("falls back to defaults for an absent file", () => {
    const { config, warnings } = parseStatuslineConfig(undefined);
    expect(config).toEqual({ version: 1, enabled: true, hiddenStatuses: [...DEFAULT_HIDDEN_STATUSES] });
    expect(warnings).toEqual([]);
  });

  it("reads enabled and hiddenStatuses", () => {
    const { config } = parseStatuslineConfig({ version: 1, enabled: false, hiddenStatuses: ["venice"] });
    expect(config.enabled).toBe(false);
    expect(config.hiddenStatuses).toEqual(["venice"]);
  });

  it("allows an explicitly empty hide list", () => {
    const { config, warnings } = parseStatuslineConfig({ hiddenStatuses: [] });
    expect(config.hiddenStatuses).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("warns instead of throwing on bad shapes", () => {
    const notArray = parseStatuslineConfig({ hiddenStatuses: "venice" });
    expect(notArray.config.hiddenStatuses).toEqual([...DEFAULT_HIDDEN_STATUSES]);
    expect(notArray.warnings.join(" ")).toContain("hiddenStatuses");

    const notBoolean = parseStatuslineConfig({ enabled: "yes" });
    expect(notBoolean.config.enabled).toBe(true);
    expect(notBoolean.warnings.join(" ")).toContain("enabled");

    const notObject = parseStatuslineConfig([]);
    expect(notObject.config.enabled).toBe(true);
    expect(notObject.warnings.join(" ")).toContain("defaults");
  });
});

describe("loadStatuslineConfig / writeStatuslineConfig", () => {
  it("round-trips through the agent directory", () => {
    const { dir, env } = agentDir();
    const written = writeStatuslineConfig(
      { version: 1, enabled: false, hiddenStatuses: ["goosedump", "custom-ext"] },
      env,
      dir,
    );
    expect(written).toBe(path.join(dir, "pi-statusline.json"));
    expect(fs.existsSync(written)).toBe(true);

    const loaded = loadStatuslineConfig(env, dir);
    expect(loaded.config).toEqual({ version: 1, enabled: false, hiddenStatuses: ["goosedump", "custom-ext"] });
    expect(loaded.warnings).toEqual([]);
  });

  it("leaves no temporary file behind", () => {
    const { dir, env } = agentDir();
    writeStatuslineConfig({ version: 1, enabled: true, hiddenStatuses: [] }, env, dir);
    const leftovers = fs.readdirSync(dir).filter((entry) => entry.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("reports defaults with a warning when the file is not parseable", () => {
    const { dir, env } = agentDir();
    fs.writeFileSync(path.join(dir, "pi-statusline.json"), "{ nope", "utf8");
    const loaded = loadStatuslineConfig(env, dir);
    expect(loaded.config.enabled).toBe(true);
    expect(loaded.warnings.join(" ")).toContain("using pi-statusline defaults");
  });

  it("uses the home fallback when PI_CODING_AGENT_DIR is unset", () => {
    const { dir } = agentDir();
    fs.mkdirSync(path.join(dir, ".pi", "agent"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".pi", "agent", "pi-statusline.json"), JSON.stringify({ enabled: false }), "utf8");
    const loaded = loadStatuslineConfig({}, dir);
    expect(loaded.config.enabled).toBe(false);
  });
});
