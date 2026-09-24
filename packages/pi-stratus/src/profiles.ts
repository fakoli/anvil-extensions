// Normalized profile tokens (T002) — insets, spacing, gate thresholds.
// From the lead-engineer report: apply the user's spacing preference as
// ceil(basePadding × 1.25) to left/right/top/bottom — never multiply headers
// or add the header reserve twice.

import type { Face } from "./schema.ts";

export interface Insets {
  headerH: number;
  footerH: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type BoundaryLevel = "cloud" | "region" | "network" | "az" | "subnet";

/** Base insets before the user's 1.25 spacing preference. */
const BASE_INSETS: Record<BoundaryLevel, Insets> = {
  cloud: { headerH: 44, footerH: 0, left: 40, right: 16, top: 4, bottom: 20 },
  region: { headerH: 44, footerH: 0, left: 40, right: 40, top: 16, bottom: 24 },
  network: { headerH: 60, footerH: 0, left: 32, right: 32, top: 24, bottom: 24 },
  az: { headerH: 0, footerH: 32, left: 24, right: 24, top: 16, bottom: 16 },
  subnet: { headerH: 56, footerH: 0, left: 12, right: 12, top: 12, bottom: 12 },
};

const ceil = (n: number) => Math.ceil(n);

/** User-preference-adjusted insets for a boundary level. */
export function insetsFor(level: BoundaryLevel): Insets {
  const b = BASE_INSETS[level];
  return {
    headerH: b.headerH,
    footerH: b.footerH,
    left: ceil(b.left * 1.25),
    right: ceil(b.right * 1.25),
    top: ceil(b.top * 1.25),
    bottom: ceil(b.bottom * 1.25),
  };
}

/** Grid minima — minima, not fixed boxes; measured content may exceed them. */
export const GRID_MINIMA = {
  bareIconCell: { w: 48, h: 48 },
  gatewayCell: { w: 144, h: 88 },
  computeCell: { w: 112, h: 88 },
  publicSubnet: { w: 230, h: 160 },
  privateSubnet: { w: 230, h: 150 },
  az: { w: 310, h: 420 },
  routeCard: { w: 190, h: 116 },
  iconGapX: 90,
  boundaryGapY: 56,
  azGapX: 80,
} as const;

/** Gate thresholds (deterministic, offline). */
export const THRESHOLDS = {
  labelClearance: 8,
  symmetricClearance: 16,
  microSegmentMin: 8,
  interiorSegmentMin: 16,
  stubMin: 16,
  borderRunProximity: 4,
  borderRunOverlap: 16,
  bundleSeparation: 10,
  badgeClearance: 10,
  badgeSize: 28,
  /** Role-aware projected floors (CSS px in the rendered output). */
  projectedPrimaryFloor: 11,
  projectedSublabelFloor: 9,
  desktopViewportW: 1440,
  desktopViewportH: 900,
  availableDiagramW: 930,
  layoutRepairIterations: 8,
} as const;

export const PALETTE = {
  light: {
    background: "#FAFAFA",
    primary: "#1F2933",
    muted: "#52606D",
    ipv4: "#2077C4",
    ipv6: "#E07A2F",
    integration: "#B8860B",
    inverse: "#FFFFFF",
    cloudStroke: "#232F3E",
    regionStroke: "#2077C4",
    networkStroke: "#2FA36B",
    azStroke: "#2077C4",
    subnetPublicFill: "#E5EFE2",
    subnetPrivateFill: "#E2EEF4",
    bandFill: "rgba(74, 144, 217, 0.10)",
    cardHeader: "#2077C4",
  },
  dark: {
    background: "#1A1D21",
    primary: "#E4E7EB",
    muted: "#9AA5B1",
    ipv4: "#5CA8E8",
    ipv6: "#F0A05A",
    integration: "#D4A017",
    inverse: "#1A1D21",
    cloudStroke: "#9AA5B1",
    regionStroke: "#5CA8E8",
    networkStroke: "#4FBF8B",
    azStroke: "#5CA8E8",
    subnetPublicFill: "#22331F",
    subnetPrivateFill: "#1F2E3A",
    bandFill: "rgba(92, 168, 232, 0.14)",
    cardHeader: "#5CA8E8",
  },
} as const;

export type ThemeName = "light" | "dark";

export interface Palette {
  background: string;
  primary: string;
  muted: string;
  ipv4: string;
  ipv6: string;
  inverse: string;
  integration: string;
  cloudStroke: string;
  regionStroke: string;
  networkStroke: string;
  azStroke: string;
  subnetPublicFill: string;
  subnetPrivateFill: string;
  bandFill: string;
  cardHeader: string;
}

export function paletteFor(theme: ThemeName): Palette {
  return PALETTE[theme];
}

export const FONT = {
  family: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  baseSize: 13,
  titleSize: 17,
  sublabelSize: 9,
  cidrSize: 13,
} as const;

export function faceNormal(face: Face): { dx: number; dy: number } {
  switch (face) {
    case "top": return { dx: 0, dy: -1 };
    case "right": return { dx: 1, dy: 0 };
    case "bottom": return { dx: 0, dy: 1 };
    case "left": return { dx: -1, dy: 0 };
  }
}
