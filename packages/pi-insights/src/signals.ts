// pi-insights — signal classification adapters.
// Conservative, bounded string matching over tool inputs. Never executes
// commands for classification; patterns are hints, not a shell parser.

export type CallCategory =
  | "generic"
  | "edit"
  | "git_inspect"
  | "git_mutate"
  | "pr"
  | "validation"
  | "ansible"
  | "deploy"
  | "infra";

export type MilestoneKind =
  | "commit_created"
  | "pr_opened"
  | "pr_merged"
  | "validation_passed"
  | "validation_failed"
  | "infra_checked"
  | "deployment_attempted";

export interface Milestone {
  kind: MilestoneKind;
  key: string; // semantic dedup key
  at: number;
  count: number;
  note?: string; // e.g. "after failure"
}

export interface PendingCall {
  category: CallCategory;
  commandKey: string | null;
  milestonePlan: MilestonePlan | null;
}

export interface MilestonePlan {
  kind: MilestoneKind;
  key: string;
  note?: string;
}

const CATEGORY_PATTERNS: Array<{ category: CallCategory; re: RegExp }> = [
  { category: "pr", re: /\bgh\s+pr\s+(create|view|checks|checkout|merge|ready|edit)\b/ },
  { category: "git_mutate", re: /\bgit\s+(add|commit|push|merge|rebase|cherry-pick|tag)\b/ },
  { category: "git_inspect", re: /\bgit\s+(status|diff|log|show|rev-parse|branch)\b/ },
  {
    category: "validation",
    re: /\b(pytest|vitest|jest|unittest)\b|\b(npm|pnpm|yarn)\s+(run\s+)?(test|lint|typecheck)\b|\b(cargo|go)\s+test\b/,
  },
  { category: "ansible", re: /\bansible-playbook\b/ },
  { category: "deploy", re: /\b(kubectl\s+(apply|rollout)|helm\s+(upgrade|install)|terraform\s+apply)\b/ },
  { category: "infra", re: /\b(systemctl\s+(status|is-active|restart)|journalctl|nvidia-smi)\b/ },
];

/** Stable per-command identity for validation dedup: last non-`cd` shell
 *  segment's first two words (leading `cd path &&` chains are ignored). */
export function validationKey(command: string): string {
  const segments = command.split(/&&|\|\|/).map((s) => s.trim()).filter(Boolean);
  const meaningful = segments.filter((s) => !/^cd\s/.test(s));
  const target = meaningful.length ? meaningful[meaningful.length - 1] : command;
  let words = target
    .replace(/^[=!(\s]+/, "")
    .trim()
    .split(/\s+/)
    .filter((w) => !w.startsWith("-"))
    .map((w) => w.toLowerCase());
  if ((words[0] === "npm" || words[0] === "pnpm" || words[0] === "yarn") && words[1] === "run" && words[2]) {
    words = words.slice(0, 3); // keep the distinguishing script name
  } else {
    words = words.slice(0, 2);
  }
  return words.join(" ");
}

/** Classify a bash command input. Returns null when the tool is not bash. */
export function classifyBash(command: string): { category: CallCategory; commandKey: string; plan: MilestonePlan | null } {
  for (const { category, re } of CATEGORY_PATTERNS) {
    if (re.test(command)) {
      const key = validationKey(command);
      return { category, commandKey: key, plan: milestonePlanFor(category, command, key) };
    }
  }
  return { category: "generic", commandKey: validationKey(command), plan: null };
}

function milestonePlanFor(category: CallCategory, command: string, key: string): MilestonePlan | null {
  switch (category) {
    case "git_mutate": {
      if (/\bgit\s+commit\b/.test(command)) {
        const msg = command.match(/-m\s+["']([^"']{1,40})["']/);
        const slug = msg ? msg[1].toLowerCase().replace(/\s+/g, "-") : key;
        return { kind: "commit_created", key: `commit:${slug}` };
      }
      if (/\bgit\s+(merge|rebase|cherry-pick)\b/.test(command)) return { kind: "commit_created", key: `vcs:${key}` };
      return null; // add/push/tag: activity only
    }
    case "pr": {
      if (/\bgh\s+pr\s+create\b/.test(command)) return { kind: "pr_opened", key: `pr_open:${key}` };
      if (/\bgh\s+pr\s+merge\b/.test(command)) return { kind: "pr_merged", key: `pr_merge:${key}` };
      return null;
    }
    case "validation":
      return { kind: "validation_passed", key: `validation:${key}` }; // outcome decided at execution end
    case "ansible":
      if (/--check\b/.test(command)) return null; // check mode is inspection, not a deployment attempt
      return { kind: "deployment_attempted", key: `deploy:${key}` };
    case "deploy":
      return { kind: "deployment_attempted", key: `deploy:${key}` };
    case "infra":
      return { kind: "infra_checked", key: `infra:${key}` };
    default:
      return null;
  }
}