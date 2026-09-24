// BigInt CIDR parsing, containment, overlap (T001/T004).
// Implemented from the lead-engineer report (docs/implementation-report.md §4).

import type { CIDR } from "./schema.ts";

export interface ParsedCIDR {
  family: "ipv4" | "ipv6";
  prefix: number;
  bits: number;
  start: bigint;
  end: bigint;
}

export type CIDRDiagnostic =
  | { code: "CIDR_INVALID"; message: string }
  | { code: "CIDR_HOST_BITS"; message: string; normalized: string };

function parseIPv4(address: string): bigint | undefined {
  const parts = address.split(".");
  if (parts.length !== 4) return undefined;
  let out = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const n = Number(part);
    if (n > 255) return undefined;
    out = (out << 8n) | BigInt(n);
  }
  return out;
}

function parseIPv6(address: string): bigint | undefined {
  // Handle "::" expansion and embedded IPv4 tails.
  if (address.includes("%")) return undefined; // zone indices unsupported
  // Strict grammar: only hex digits, ":", ".", and at most one "::".
  if (!/^[0-9A-Fa-f:.]+$/.test(address)) return undefined;
  if (address.includes(":::")) return undefined;
  // Leading/trailing SINGLE colons are malformed; "::" forms are valid
  // (compression at the start/end, or the unspecified address "::").
  if (address === "::") return 0n;
  if (address.startsWith(":") && !address.startsWith("::")) return undefined;
  if (address.endsWith(":") && !address.endsWith("::")) return undefined;
  const doubleColon = address.split("::");
  if (doubleColon.length > 2) return undefined;
  const tailStr = doubleColon[1];
  const head = doubleColon[0] ?? "";
  let tail: string[] = [];
  if (doubleColon.length === 2 && tailStr !== undefined) {
    if (tailStr.includes(".")) {
      const groups = tailStr.split(":");
      const last = groups[groups.length - 1];
      if (last === undefined) return undefined;
      const v4 = parseIPv4(last);
      if (v4 === undefined) return undefined;
      const prefix = tailStr.slice(0, tailStr.length - last.length);
      tail = [...prefix.split(":").filter(Boolean), ...hexGroups(v4)];
    } else {
      tail = tailStr.split(":").filter(Boolean);
    }
  }
  const headGroups = head.split(":").filter((g) => g.length > 0);
  if (head.includes(".")) {
    const last = headGroups.pop();
    if (last === undefined) return undefined;
    const v4 = parseIPv4(last);
    if (v4 === undefined) return undefined;
    headGroups.push(...hexGroups(v4));
  }
  for (const grp of [...headGroups, ...tail]) {
    if (!/^[0-9A-Fa-f]{1,4}$/.test(grp)) return undefined;
  }
  const missing = 8 - (headGroups.length + tail.length);
  if (doubleColon.length === 2) {
    // "::" must compress at least one zero group — a trailing/leading "::"
    // with nothing missing is spurious zero-width compression.
    if (missing < 1) return undefined;
  } else if (missing !== 0) {
    return undefined;
  }
  const groups = [...headGroups, ...Array<string>(Math.max(0, missing)).fill("0"), ...tail];
  if (groups.length !== 8) return undefined;
  let out = 0n;
  for (const grp of groups) out = (out << 16n) | BigInt(parseInt(grp, 16));
  return out;
}

function hexGroups(v4: bigint): string[] {
  const hi = Number((v4 >> 16n) & 0xffffn).toString(16);
  const lo = Number(v4 & 0xffffn).toString(16);
  return [hi, lo];
}

export function parseCIDR(value: string): ParsedCIDR | CIDRDiagnostic {
  const slash = value.lastIndexOf("/");
  if (slash === -1) return { code: "CIDR_INVALID", message: `missing prefix length: ${value}` };
  const addr = value.slice(0, slash);
  const prefixStr = value.slice(slash + 1);
  if (!/^\d{1,3}$/.test(prefixStr)) {
    return { code: "CIDR_INVALID", message: `malformed prefix: ${value}` };
  }
  const prefix = Number(prefixStr);
  const isV6 = addr.includes(":");
  const bits = isV6 ? 128 : 32;
  if (prefix > bits) {
    return { code: "CIDR_INVALID", message: `prefix ${prefix} exceeds ${bits} bits: ${value}` };
  }
  const address = isV6 ? parseIPv6(addr) : parseIPv4(addr);
  if (address === undefined) {
    return { code: "CIDR_INVALID", message: `malformed ${isV6 ? "IPv6" : "IPv4"} address: ${value}` };
  }
  const hostBits = BigInt(bits - prefix);
  const start = (address >> hostBits) << hostBits;
  const end = start + (1n << hostBits) - 1n;
  if (address !== start) {
    return {
      code: "CIDR_HOST_BITS",
      message: `address has host bits set: ${value}`,
      normalized: `${formatAddress(start, isV6)}/${prefix}`,
    };
  }
  return { family: isV6 ? "ipv6" : "ipv4", prefix, bits, start, end };
}

export function parseAddress(value: string): { family: "ipv4" | "ipv6"; value: bigint } | CIDRDiagnostic {
  const isV6 = value.includes(":");
  const parsed = isV6 ? parseIPv6(value) : parseIPv4(value);
  if (parsed === undefined) {
    return { code: "CIDR_INVALID", message: `malformed address: ${value}` };
  }
  return { family: isV6 ? "ipv6" : "ipv4", value: parsed };
}

function formatAddress(value: bigint, isV6: boolean): string {
  if (!isV6) {
    return [24, 16, 8, 0].map((s) => Number((value >> BigInt(s)) & 0xffn)).join(".");
  }
  const groups: string[] = [];
  for (let i = 7; i >= 0; i--) {
    groups.push(Number((value >> BigInt(i * 16)) & 0xffffn).toString(16));
  }
  return groups.join(":");
}

export function cidrFamily(value: string): "ipv4" | "ipv6" {
  return value.includes(":") ? "ipv6" : "ipv4";
}

/** True when `child` fits inside `parent` (same family). */
export function containsCIDR(parent: ParsedCIDR, child: ParsedCIDR): boolean {
  return (
    parent.family === child.family &&
    parent.start <= child.start &&
    child.end <= parent.end
  );
}

/** True when the two ranges intersect (same family). */
export function overlapsCIDR(a: ParsedCIDR, b: ParsedCIDR): boolean {
  return a.family === b.family && max(a.start, b.start) <= min(a.end, b.end);
}

/** Longest-prefix selection: the more specific (larger prefix) wins. */
export function longestPrefix(a: ParsedCIDR, b: ParsedCIDR): number {
  return a.prefix >= b.prefix ? a.prefix : b.prefix;
}

function max(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}
function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/** Narrow a schema-level CIDR into a parsed range, or a diagnostic. */
export function parseSchemaCIDR(cidr: CIDR): ParsedCIDR | CIDRDiagnostic {
  const parsed = parseCIDR(cidr.value);
  if ("code" in parsed) return parsed;
  // Declared family must agree with the parsed address family.
  if (cidr.family !== undefined && cidr.family !== parsed.family) {
    return { code: "CIDR_INVALID", message: `declared family ${cidr.family} does not match parsed address family ${parsed.family} (${cidr.value})` };
  }
  return parsed;
}
