import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_HIDDEN_STATUSES,
  loadStatuslineConfig,
  writeStatuslineConfig,
  type StatuslineConfig,
} from "./src/config.js";
import { registerStatusline } from "./src/statusline.js";

export default function piStatuslineExtension(pi: ExtensionAPI): void {
  const loaded = loadStatuslineConfig();
  let config = loaded.config;

  registerStatusline(pi, config);

  pi.on("session_start", async (_event, ctx) => {
    for (const warning of loaded.warnings) ctx.ui.notify(warning, "warning");
  });

  pi.registerCommand("statusline", {
    description: "Show, toggle, or tune pi-statusline",
    handler: async (args, ctx) => {
      await runStatuslineCommand(args.trim(), ctx, () => config, (next) => {
        config = next;
      });
    },
  });
}

async function runStatuslineCommand(
  args: string,
  ctx: ExtensionCommandContext,
  read: () => StatuslineConfig,
  write: (next: StatuslineConfig) => void,
): Promise<void> {
  const command = args.toLowerCase();
  const current = read();

  if (command === "" || command === "status") {
    const hidden = current.hiddenStatuses.length > 0 ? current.hiddenStatuses.join(", ") : "none";
    ctx.ui.notify(`pi-statusline is ${current.enabled ? "on" : "off"}. Hidden statuses: ${hidden}`, "info");
    return;
  }

  if (command === "on" || command === "off") {
    await persist(ctx, { ...current, enabled: command === "on" }, write);
    return;
  }

  if (command === "reset-hidden") {
    await persist(ctx, { ...current, hiddenStatuses: [...DEFAULT_HIDDEN_STATUSES] }, write);
    return;
  }

  const [verb, ...rest] = command.split(/\s+/);
  const key = rest.join(" ").trim();
  if (!key) {
    ctx.ui.notify("Usage: /statusline [status|on|off|hide <key>|unhide <key>|reset-hidden]", "warning");
    return;
  }

  if (verb === "hide") {
    if (current.hiddenStatuses.includes(key)) {
      ctx.ui.notify(`${key} is already hidden.`, "info");
      return;
    }
    await persist(ctx, { ...current, hiddenStatuses: [...current.hiddenStatuses, key] }, write);
    return;
  }
  if (verb === "unhide") {
    if (!current.hiddenStatuses.includes(key)) {
      ctx.ui.notify(`${key} is not hidden.`, "info");
      return;
    }
    await persist(
      ctx,
      { ...current, hiddenStatuses: current.hiddenStatuses.filter((entry) => entry !== key) },
      write,
    );
    return;
  }

  ctx.ui.notify("Usage: /statusline [status|on|off|hide <key>|unhide <key>|reset-hidden]", "warning");
}

async function persist(
  ctx: ExtensionCommandContext,
  next: StatuslineConfig,
  write: (value: StatuslineConfig) => void,
): Promise<void> {
  try {
    const target = writeStatuslineConfig(next);
    write(next);
    ctx.ui.notify(`Saved pi-statusline settings to ${target}; reloading.`, "info");
  } catch (error: unknown) {
    ctx.ui.notify(`Could not save pi-statusline settings: ${error instanceof Error ? error.message : String(error)}`, "error");
    return;
  }
  await ctx.reload();
}
