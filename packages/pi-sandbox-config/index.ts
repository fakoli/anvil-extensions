// pi-sandbox-config — pi-native configurator for the anvil pi sandbox
// (packaging/pi/sandbox in the anvil repo).
//
//   /sandbox              command — per-option dialogs to edit the run config,
//                         plus a resolved-config precheck (read-only)
//   sandbox_config_read   tool — read + validate saved configs (headless-safe)
//   sandbox_config_write  tool — validate, cross-check against anvil's own
//                         fail-closed validator, then write atomically (0600)
//   sandbox_precheck      tool — read-only resolution preview of exactly what
//                         a launch would use (no launch)
//
// Security posture mirrors anvil's scripts/pi-sandbox-config.mjs: security
// fields (image/network/caps) are trusted-scope only; a project-scope file may
// set max_containers only; images must be digest-pinned; network may never be
// looser than the profile posture. Launches are NOT performed here — the
// agent/system drives scripts/pi-sandbox-docker.sh (e.g. via a background
// task) after a precheck; this extension is file-plumbing and dialogs only.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CAPS_PRESETS,
  MAX_CONTAINERS_MAX,
  MAX_CONTAINERS_MIN,
  USER_CONFIG_PATH,
  effectiveConfig,
  projectConfigPath,
  readConfigFile,
  validateConfigDoc,
  writeConfigAtomic,
  type ConfigScope,
} from "./src/config.js";
import {
  AnvilError,
  crossCheckConfig,
  findSandboxPolicy,
  resolvePreview,
  type SandboxPolicy,
} from "./src/anvil.js";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function cwdOf(ctx: unknown): string {
  const c = ctx as { cwd?: string } | undefined;
  return c?.cwd ?? process.cwd();
}

function summarize(eff: ReturnType<typeof effectiveConfig>): string {
  return [
    `image: ${eff.image || "(launcher default / ANVIL_SANDBOX_IMAGE env)"}`,
    `caps: ${eff.caps}`,
    `max_containers: ${eff.maxContainers ?? "unlimited"}`,
    `source: ${eff.source}`,
    `network: (profile posture — selected at launch, never loosened by config)`,
  ].join("\n");
}

// Cross-check the exact bytes of `probeFile` against anvil's own validator
// BEFORE anything is written to a real config path. No anvil checkout → skip
// (local schema validation already ran; documented degrade).
async function probeValidate(
  policy: SandboxPolicy | null,
  doc: Record<string, unknown>,
  profile: string | undefined,
  signal?: AbortSignal,
): Promise<void> {
  if (!policy) return;
  const probeDir = mkdtempSync(join(tmpdir(), "pi-sandbox-config-probe-"));
  const probeFile = join(probeDir, "sandbox.config.json");
  try {
    writeConfigAtomic(probeFile, doc);
    const cc = await crossCheckConfig(policy, probeFile, { profile, signal });
    if (!cc.ok) {
      throw new Error(
        `anvil validator refused the config: ${cc.message}\nNothing was written. Fix the config and retry.`,
      );
    }
  } finally {
    try {
      rmSync(probeDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

function firstProfileName(policy: SandboxPolicy | null): string {
  return policy?.profiles[0]?.name ?? "unattended-exec";
}

export default function (pi: ExtensionAPI) {
  // ---- tools ---------------------------------------------------------------

  pi.registerTool({
    name: "sandbox_config_read",
    label: "Sandbox Config Read",
    description:
      "Read + validate the anvil pi-sandbox run config (image/network/caps/max_containers). " +
      "Returns the raw user- and project-scope docs, the effective resolved view, validation status, " +
      "and the available sandbox profiles. Read-only; use before sandbox_config_write or sandbox_precheck.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const cwd = cwdOf(ctx);
      const policy = findSandboxPolicy(cwd);
      const user = readConfigFile(USER_CONFIG_PATH, "user");
      const project = readConfigFile(projectConfigPath(cwd), "project");
      const eff = effectiveConfig(user, project);
      const lines: string[] = [
        `## user config (${USER_CONFIG_PATH})`,
        user.exists ? JSON.stringify(user.doc, null, 2) : "(not present)",
      ];
      if (user.exists && !user.validation.ok) lines.push(`INVALID: ${user.validation.errors.join("; ")}`);
      lines.push(
        ``,
        `## project config (${projectConfigPath(cwd)})`,
        project.exists ? JSON.stringify(project.doc, null, 2) : "(not present)",
      );
      if (project.exists && !project.validation.ok) lines.push(`INVALID: ${project.validation.errors.join("; ")}`);
      lines.push(``, `## effective (trusted > defaults; project max merges most-restrictive)`, summarize(eff));
      if (policy) {
        lines.push(
          ``,
          `## profiles (${policy.allowlistPath})`,
          ...policy.profiles.map(
            (p) => `- ${p.name} (network: ${p.network})${p.description ? ` — ${p.description}` : ""}`,
          ),
        );
      } else {
        lines.push(
          ``,
          `## profiles`,
          "(anvil checkout not found from this cwd — set ANVIL_ROOT or run inside an anvil repo; " +
            "profile names are free-text until the policy surface is found)",
        );
      }
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { found: { user: user.exists, project: project.exists }, policyFound: Boolean(policy) },
      };
    },
  });

  pi.registerTool({
    name: "sandbox_config_write",
    label: "Sandbox Config Write",
    description:
      "Validate + write the anvil pi-sandbox run config. Scope rules are fail-closed: scope 'user' " +
      "accepts image (digest-pinned), network, caps, max_containers; scope 'project' accepts " +
      "max_containers ONLY (the workspace is untrusted input). The exact bytes are cross-checked " +
      "against anvil's own validator BEFORE the write; rejected configs never land on disk. " +
      "Writes are atomic (tmp + rename) with mode 0600.",
    parameters: Type.Object({
      scope: Type.Union([Type.Literal("user"), Type.Literal("project")], {
        description: "user = trusted scope (all fields); project = workspace scope (max_containers only)",
      }),
      config: Type.Record(Type.String(), Type.Unknown(), {
        description: `Config object, e.g. {"caps":"docker-default","max_containers":4}. Unknown keys are refused.`,
      }),
      profile: Type.Optional(
        Type.String({ description: "Profile name used for the cross-check (defaults to the first allowlist profile)." }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { scope, config: doc } = params as { scope: ConfigScope; config: Record<string, unknown> };
      if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
        throw new Error("config must be a JSON object");
      }
      const validation = validateConfigDoc(doc, scope);
      if (!validation.ok) {
        throw new Error(`config refused (${scope} scope):\n- ${validation.errors.join("\n- ")}`);
      }
      const policy = findSandboxPolicy(cwdOf(ctx));
      await probeValidate(policy, doc, (params as { profile?: string }).profile, signal);
      const target = scope === "user" ? USER_CONFIG_PATH : projectConfigPath(cwdOf(ctx));
      writeConfigAtomic(target, doc);
      return {
        content: [{ type: "text", text: `Wrote ${scope}-scope config to ${target}\n${JSON.stringify(doc, null, 2)}` }],
        details: { path: target },
      };
    },
  });

  pi.registerTool({
    name: "sandbox_precheck",
    label: "Sandbox Precheck",
    description:
      "Read-only resolution preview of the anvil pi-sandbox run: exactly the image/network/caps/" +
      "max_containers a launch would use, validated by anvil's own fail-closed resolver. " +
      "NEVER launches anything. Call before launching scripts/pi-sandbox-docker.sh (e.g. in a " +
      "background task) and surface failures instead of launching blindly.",
    parameters: Type.Object({
      profile: Type.String({ description: "Sandbox profile name, e.g. unattended-exec or read-only-review." }),
      workspace: Type.Optional(Type.String({ description: "Workspace dir (defaults to the session cwd)." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { profile, workspace } = params as { profile: string; workspace?: string };
      if (!profile.trim()) throw new Error("profile is required");
      const ws = workspace ?? cwdOf(ctx);
      const policy = findSandboxPolicy(cwdOf(ctx));
      if (!policy) {
        throw new Error(
          "anvil checkout not found from this cwd (looked for packaging/pi/sandbox/allowlist.json via " +
            "ANVIL_SANDBOX_ALLOWLIST / ANVIL_ROOT / walk-up) — cannot precheck without the policy surface",
        );
      }
      try {
        const preview = await resolvePreview(policy, { profile, workspace: ws, signal });
        const text =
          `PRECHECK OK (source: ${preview.configSource})\n` +
          `image: ${preview.image || "(launcher default / ANVIL_SANDBOX_IMAGE env)"}\n` +
          `network: ${preview.network}\ncaps: ${preview.caps}\n` +
          `max_containers: ${preview.maxContainers || "unlimited"}\n\n` +
          `launch command template:\n  scripts/pi-sandbox-docker.sh ${profile} <task-file> ${ws}`;
        return { content: [{ type: "text", text }], details: { ...preview } };
      } catch (e) {
        if (e instanceof AnvilError) throw new Error(`precheck refused: ${e.message}`);
        throw e;
      }
    },
  });

  // ---- /sandbox command (TUI; per-option dialogs) ----------------------------

  pi.registerCommand("sandbox", {
    description: "Configure the anvil pi sandbox (caps/image/max containers) with dialogs",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        throw new Error(
          "/sandbox needs an interactive UI — use the sandbox_config_read / sandbox_config_write / " +
            "sandbox_precheck tools instead",
        );
      }
      const cwd = cwdOf(ctx);
      const policy = findSandboxPolicy(cwd);
      const action = await ctx.ui.select("pi sandbox configurator", [
        "Edit trusted config (user scope: caps / image / max containers)",
        "Set project max_containers only",
        "Show resolved config (precheck, read-only)",
      ]);
      if (!action) return;

      if (action.startsWith("Edit trusted")) {
        const current = readConfigFile(USER_CONFIG_PATH, "user");
        const currentDoc = current.exists && current.validation.ok ? current.doc : {};
        const profileChoices = policy
          ? [...policy.profiles.map((p) => `${p.name} — network ${p.network}`), "(profile: keep unset)"]
          : ["(profile: keep unset)"];
        const profilePick = await ctx.ui.select("Profile (cross-check target from the sandbox allowlist)", profileChoices);
        if (profilePick === undefined) return;
        const pickedProfile = profilePick.startsWith("(") ? undefined : profilePick.split(" — ")[0];
        const capsPick = await ctx.ui.select("Capability preset", [...CAPS_PRESETS, "(caps: keep unset)"]);
        if (capsPick === undefined) return;
        const imagePick = await ctx.ui.input(
          "Image — digest-pinned <repo>@sha256:<64 hex>; empty leaves it unset (launcher default or ANVIL_SANDBOX_IMAGE env)",
          "ghcr.io/fakoli/anvil-pi-sandbox@sha256:…",
        );
        if (imagePick === undefined) return;
        const maxPick = await ctx.ui.input(
          `Max concurrent sandbox containers (${MAX_CONTAINERS_MIN}-${MAX_CONTAINERS_MAX}); empty leaves it unset`,
          "e.g. 4",
        );
        if (maxPick === undefined) return;

        const doc: Record<string, unknown> = { ...currentDoc };
        if (capsPick && !capsPick.startsWith("(")) doc.caps = capsPick;
        else delete doc.caps;
        if (imagePick.trim()) doc.image = imagePick.trim();
        else delete doc.image;
        if (maxPick.trim()) doc.max_containers = Number(maxPick.trim());
        else delete doc.max_containers;

        const validation = validateConfigDoc(doc, "user");
        if (!validation.ok) {
          ctx.ui.notify(`Refused: ${validation.errors.join("; ")}`, "error");
          return;
        }
        const ok = await ctx.ui.confirm(
          "Write trusted config?",
          `${USER_CONFIG_PATH}\n${JSON.stringify(doc, null, 2)}\n\ncross-check profile: ${pickedProfile ?? firstProfileName(policy)}`,
        );
        if (!ok) return;
        try {
          await probeValidate(policy, doc, pickedProfile);
          writeConfigAtomic(USER_CONFIG_PATH, doc);
          ctx.ui.notify(`Saved ${USER_CONFIG_PATH}`, "info");
        } catch (e) {
          ctx.ui.notify(`Failed: ${errorText(e)}`, "error");
        }
        return;
      }

      if (action.startsWith("Set project")) {
        const maxPick = await ctx.ui.input(
          `Project max_containers (${MAX_CONTAINERS_MIN}-${MAX_CONTAINERS_MAX}); empty writes an empty override object`,
          "e.g. 4",
        );
        if (maxPick === undefined) return;
        const doc: Record<string, unknown> = maxPick.trim() ? { max_containers: Number(maxPick.trim()) } : {};
        const validation = validateConfigDoc(doc, "project");
        if (!validation.ok) {
          ctx.ui.notify(`Refused: ${validation.errors.join("; ")}`, "error");
          return;
        }
        const target = projectConfigPath(cwd);
        try {
          writeConfigAtomic(target, doc);
          ctx.ui.notify(maxPick.trim() ? `Saved ${target}` : `Cleared override (empty object at ${target})`, "info");
        } catch (e) {
          ctx.ui.notify(`Failed: ${errorText(e)}`, "error");
        }
        return;
      }

      // Show resolved
      if (!policy) {
        ctx.ui.notify("anvil checkout not found — set ANVIL_ROOT or run inside an anvil repo", "error");
        return;
      }
      try {
        const preview = await resolvePreview(policy, { profile: firstProfileName(policy), workspace: cwd });
        ctx.ui.notify(
          `source=${preview.configSource} image=${preview.image || "(default)"} network=${preview.network} ` +
            `caps=${preview.caps} max=${preview.maxContainers || "unlimited"}`,
          "info",
        );
      } catch (e) {
        ctx.ui.notify(`Precheck failed: ${errorText(e)}`, "error");
      }
    },
  });
}

