/**
 * pi-statusline settings.
 *
 * Stored at `$PI_CODING_AGENT_DIR/pi-statusline.json`, falling back to
 * `~/.pi/agent/pi-statusline.json`. A malformed or unreadable file degrades to
 * defaults with a warning rather than taking the footer down.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const DEFAULT_ENABLED = true;

/**
 * Status keys hidden from the footer. These extensions print a one-line
 * indicator that duplicates what the status line already shows, so rendering
 * them would stack a second bar under the first.
 */
export const DEFAULT_HIDDEN_STATUSES = ["goosedump", "venice"];

export interface StatuslineConfig {
  readonly version: 1;
  readonly enabled: boolean;
  readonly hiddenStatuses: readonly string[];
}

export interface LoadedStatuslineConfig {
  readonly config: StatuslineConfig;
  readonly warnings: string[];
  readonly path: string;
}

export function defaultConfig(): StatuslineConfig {
  return { version: 1, enabled: DEFAULT_ENABLED, hiddenStatuses: [...DEFAULT_HIDDEN_STATUSES] };
}

export function parseStatuslineConfig(raw: unknown): { readonly config: StatuslineConfig; readonly warnings: string[] } {
  const warnings: string[] = [];
  if (raw !== undefined && !isRecord(raw)) {
    warnings.push("Configuration is not a JSON object; using pi-statusline defaults.");
    return { config: defaultConfig(), warnings };
  }
  const value: Partial<Record<keyof StatuslineConfig, unknown>> = isRecord(raw) ? raw : {};

  if (value.version !== undefined && value.version !== 1) {
    warnings.push("Only pi-statusline configuration version 1 is supported.");
  }

  let enabled = DEFAULT_ENABLED;
  if (value.enabled !== undefined) {
    if (typeof value.enabled === "boolean") {
      enabled = value.enabled;
    } else {
      warnings.push("The enabled field must be a boolean; using the default.");
    }
  }

  let hiddenStatuses: string[] = [...DEFAULT_HIDDEN_STATUSES];
  if (value.hiddenStatuses !== undefined) {
    if (Array.isArray(value.hiddenStatuses) && value.hiddenStatuses.every((entry) => typeof entry === "string")) {
      hiddenStatuses = value.hiddenStatuses as string[];
    } else {
      warnings.push("The hiddenStatuses field must be an array of strings; using the default.");
    }
  }

  return { config: { version: 1, enabled, hiddenStatuses }, warnings };
}

export function configPath(
  env: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir(),
): { readonly primary: string; readonly fallback: string } {
  const agentDir = env.PI_CODING_AGENT_DIR?.trim() || path.join(homeDirectory, ".pi", "agent");
  const fallback = path.join(homeDirectory, ".pi", "agent", "pi-statusline.json");
  return { primary: path.join(agentDir, "pi-statusline.json"), fallback };
}

export function loadStatuslineConfig(
  env: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir(),
): LoadedStatuslineConfig {
  const { primary, fallback } = configPath(env, homeDirectory);
  const candidates = primary === fallback ? [primary] : [primary, fallback];
  const warnings: string[] = [];
  let raw: unknown;

  for (const candidate of candidates) {
    try {
      raw = JSON.parse(fs.readFileSync(candidate, "utf8")) as unknown;
      break;
    } catch (error: unknown) {
      if (isFileNotFound(error)) continue;
      warnings.push(`Could not read ${candidate}; using pi-statusline defaults.`);
      break;
    }
  }

  const parsed = parseStatuslineConfig(raw);
  return { config: parsed.config, warnings: [...warnings, ...parsed.warnings], path: primary };
}

/** Writes atomically: temp file, fsync, rename. Mirrors how pi-git stores settings. */
export function writeStatuslineConfig(
  config: StatuslineConfig,
  env: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir(),
): string {
  const { primary: target } = configPath(env, homeDirectory);
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.pi-statusline.${process.pid}.${Date.now()}.tmp`);
  const serializable = {
    version: 1,
    enabled: config.enabled,
    hiddenStatuses: [...config.hiddenStatuses],
  };

  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, "w", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(serializable, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, target);
    try {
      fs.chmodSync(target, 0o600);
    } catch {
      // The rename already landed; chmod is best effort on platforms that ignore it.
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(temporary);
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
  return target;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}
