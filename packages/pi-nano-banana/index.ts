// pi-nano-banana — Google Gemini image generation for pi.
// Native tools (image_generate / image_edit / image_remix / image_optimize),
// an /image-config wizard (user file shared with the Claude plugin, session
// overrides, or reset), and an /image-gallery of this session's images.
//
// Billing safety (inherited from the Claude plugin): one billable call per
// generation, no automatic retries. Credentials never echo. Generated images
// live on disk; gallery entries record paths only.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { FetchImpl } from "./src/gemini.js";
import { configPath, initConfigFile, loadApiKey, loadSettings, parseSettingsFile, resetUserSettings, saveUserSettings, type Settings } from "./src/config.js";
import { createImageTools, type GalleryEntry } from "./src/tools.js";

const GALLERY_ENTRY_TYPE = "nano-banana-image";

/** Test hook: inject a fetch implementation (no network in tests). */
let fetchImplOverride: FetchImpl | null = null;
export function __setFetchImpl(impl: FetchImpl | null): void {
  fetchImplOverride = impl;
}

export default function (pi: ExtensionAPI): void {
  // Session-scoped state: /image-config (session scope) overrides and the
  // most recent image produced this session (for source: "last").
  let sessionOverrides: Partial<Settings> = {};
  let lastImage: GalleryEntry | null = null;

  const deps = {
    getSessionOverrides(): Partial<Settings> {
      return sessionOverrides;
    },
    recordImage(entry: GalleryEntry): void {
      lastImage = entry;
      try {
        pi.appendEntry<GalleryEntry>(GALLERY_ENTRY_TYPE, entry);
      } catch {
        // gallery bookkeeping must never fail a completed generation
      }
    },
    getLastImage(): GalleryEntry | null {
      return lastImage;
    },
    ...(fetchImplOverride ? { fetchImpl: fetchImplOverride } : {}),
  };

  for (const tool of createImageTools(deps)) {
    pi.registerTool(tool);
  }

  // --- gallery ---------------------------------------------------------------

  function scanGallery(ctx: ExtensionContext): GalleryEntry[] {
    try {
      const branch = ctx.sessionManager.getBranch() as Array<Record<string, unknown>>;
      const entries: GalleryEntry[] = [];
      for (const entry of branch) {
        if (entry?.type === "custom" && entry.customType === GALLERY_ENTRY_TYPE) {
          const data = entry.data as GalleryEntry | undefined;
          if (data?.path) entries.push(data);
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  // --- commands ----------------------------------------------------------------

  pi.registerCommand("image-gallery", {
    description: "List images this session generated (model, path); /image-gallery last opens the newest",
    handler: async (args, ctx) => {
      const arg = (args ?? "").trim().toLowerCase();
      const gallery = scanGallery(ctx);
      if (lastImage && !gallery.some((g) => g.path === lastImage!.path && g.at === lastImage!.at)) {
        gallery.push(lastImage);
      }
      if (gallery.length === 0) {
        if (ctx.hasUI) ctx.ui.notify("pi-nano-banana: no images generated in this session yet", "info");
        return;
      }
      if (arg === "last") {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `pi-nano-banana: last image ${lastImage ? `${lastImage.path} (${lastImage.model}, ${new Date(lastImage.at).toLocaleTimeString()})` : gallery[gallery.length - 1].path}` +
              `\nUse image_edit with source: "last" to edit it.`,
            "info",
          );
        }
        return;
      }
      if (ctx.hasUI) {
        const lines = gallery
          .slice(-8)
          .map((g, i) => `${gallery.length - Math.min(gallery.length, 8) + i + 1}. ${g.path} · ${g.model} · ${g.tool} · ${new Date(g.at).toLocaleTimeString()}`);
        ctx.ui.notify(`pi-nano-banana: ${gallery.length} image(s) this session\n${lines.join("\n")}\n(image_edit accepts source: "last"; pass an explicit path for older images)`, "info");
      }
    },
  });

  // --- config wizard ---------------------------------------------------------

  pi.registerCommand("image-config", {
    description: "Configure image generation defaults (model, aspect, size, output dir, remix refs, key check)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return; // silent in print/JSON modes
      try {
        const settings = loadSettings(undefined, sessionOverrides);
        const key = loadApiKey(settings);
        const keyPick = await ctx.ui.select(
          `GEMINI_API_KEY: ${key ? "found in environment (never displayed)" : "MISSING — generation will fail until GEMINI_API_KEY is set in the environment or ~/.env"}. Continue to defaults?`,
          ["configure defaults", "cancel"],
        );
        if (keyPick === undefined || keyPick === "cancel") return;

        const modelPick = await ctx.ui.select(
          `Default model (current: ${settings.default_model ?? "pro"})`,
          ["pro (gemini-3-pro-image)", "flash (gemini-3.1-flash-image)", "keep current"],
        );
        if (modelPick === undefined) return;

        const aspectPick = await ctx.ui.select(
          `Default aspect ratio (current: ${settings.default_aspect ?? "1:1"})`,
          ["keep current", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        );
        if (aspectPick === undefined) return;

        const sizePick = await ctx.ui.select(
          `Default size tier (current: ${settings.default_size || "none"})`,
          ["keep current", "none", "512 (flash only)", "1K", "2K", "4K"],
        );
        if (sizePick === undefined) return;

        const outDirPick = await ctx.ui.input(
          `Output directory for auto-named images (current: ${settings.output_dir ?? "./.nanobanana/out"}). Relative paths resolve per tool call.`,
          "",
        );
        if (outDirPick === undefined) return;

        const remixPick = await ctx.ui.input(
          `Default max remix reference images, 0–4 (current: ${String(settings.max_remix_images ?? 2)})`,
          "",
        );
        if (remixPick === undefined) return;

        const partial: Partial<Settings> = {};
        if (modelPick.startsWith("pro ")) partial.default_model = "pro";
        else if (modelPick.startsWith("flash ")) partial.default_model = "flash";
        if (aspectPick !== "keep current") partial.default_aspect = aspectPick;
        if (sizePick === "none") partial.default_size = "";
        else if (sizePick.startsWith("512")) partial.default_size = "512";
        else if (sizePick !== "keep current") partial.default_size = sizePick;
        const outDirTrim = outDirPick.trim();
        if (outDirTrim !== "") partial.output_dir = outDirTrim;
        const remixTrim = remixPick.trim();
        if (remixTrim !== "") {
          const remixNum = Number(remixTrim);
          if (!Number.isInteger(remixNum) || remixNum < 0 || remixNum > 4) {
            ctx.ui.notify("pi-nano-banana: max remix references must be an integer 0–4; nothing saved", "warning");
            return;
          }
          partial.max_remix_images = remixNum;
        }

        const scopePick = await ctx.ui.select(
          "Save these defaults where?",
          [`user config (${configPath()}; shared with the Claude plugin)`, "this session only", "reset saved settings", "create user config file only"],
        );
        if (scopePick === undefined) return;

        if (scopePick.startsWith("user config")) {
          const path = saveUserSettings(partial);
          sessionOverrides = {};
          ctx.ui.notify(`pi-nano-banana: saved to ${path}`, "info");
        } else if (scopePick.startsWith("this session")) {
          sessionOverrides = { ...sessionOverrides, ...partial };
          ctx.ui.notify("pi-nano-banana: session-only defaults applied", "info");
        } else if (scopePick.startsWith("reset")) {
          const removed = resetUserSettings();
          sessionOverrides = {};
          ctx.ui.notify(`pi-nano-banana: saved settings ${removed ? "removed" : "were not set"}; defaults restored`, "info");
        } else {
          const path = initConfigFile();
          ctx.ui.notify(`pi-nano-banana: config ready at ${path} (existing file untouched)`, "info");
        }
      } catch (error) {
        // Settings errors can carry legacy-key-adjacent text; keep the message generic.
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`pi-nano-banana: ${message.includes("API key") ? "settings error" : "settings dialog error"} (${message.slice(0, 120)})`, "warning");
      }
    },
  });
}

// Re-exports for tests.
export { parseSettingsFile, loadSettings };