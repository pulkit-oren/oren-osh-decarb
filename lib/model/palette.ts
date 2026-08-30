/* ============================================================
   Chart colour, by lever family.

   The previous palette was eight hues because the wedge chart draws
   eight wedges, and it failed three of the five checks a categorical
   palette has to pass:

     - green #3FB76E against olive #7FA05A sat at ΔE 7.6 for NORMAL
       colour vision, below the 15 threshold — full-sighted readers
       could not reliably separate them;
     - olive against terracotta sat at ΔE 3.1 under deuteranopia,
       which is roughly one man in twelve seeing one colour;
     - two of the eight fell under the chroma floor and read as grey,
       and three fell under 3:1 contrast against the surface.

   Those were the colours carrying the wedge chart and the MACC — the
   two charts whose entire job is to say which lever did what.

   The cause was not taste. Eight distinct categorical hues is past
   what anyone reliably distinguishes. But the eight wedges are really
   FOUR FAMILIES SPLIT IN TWO — efficiency, electrification and fuel
   switch each split mobile/stationary, refrigerant split leak/gas —
   so the second distinction belongs on a second channel. Family picks
   the hue; the split picks a deeper step of that same hue. Identity
   survives, and the palette drops to six hues, which is comfortably
   inside what works.

   Deeper rather than lighter for the split, deliberately: a lighter
   tint would fall below the 3:1 contrast floor against the surface,
   and a contrast failure is not dismissable by adding a legend.

   The six base hues are validated in BOTH light and dark against each
   mode's own surface — worst adjacent pair ΔE 15.1 under deuteranopia
   and 23.5 under normal vision, every slot inside the lightness band
   and above the chroma floor, all six at or above 3:1 contrast.
   ============================================================ */

/** Every lever family that can appear on a chart. */
export type LeverFamily =
  | "efficiency" | "electrify" | "fuelSwitch" | "refrigerant"
  | "generation" | "procurement" | "contracted";

/** The one hue per family. Assign in this fixed order; never cycle. */
export const FAMILY_HUE: Record<LeverFamily, string> = {
  efficiency: "#0E9AA7",
  electrify: "#7A5AF8",
  fuelSwitch: "#C2410C",
  refrigerant: "#B8860B",
  generation: "#C2185B",
  procurement: "#3E6FB0",
  /* Not a lever and not a categorical peer: electricity already under contract
     is context the plan starts from. A neutral says "this is background", which
     spending a scarce hue on it would not. */
  contracted: "#7C8A8F",
};

/** The deeper step of each hue, for the second half of a split family. */
export const FAMILY_HUE_DEEP: Record<LeverFamily, string> = {
  efficiency: "#0A6E78",
  electrify: "#5333C9",
  fuelSwitch: "#8E2F09",
  refrigerant: "#855F08",
  generation: "#8C1142",
  procurement: "#2C5081",
  contracted: "#5A6669",
};

/* ---------- The wire format ----------
   Wedges and lever rows carry a numeric `colorIdx`, which is persisted inside
   saved scenarios. Keeping that shape means old saves keep rendering; only what
   each index POINTS AT changes. */

export const FAMILY_IDX = {
  efficiency: 0,
  electrify: 1,
  fuelSwitch: 2,
  refrigerant: 3,
  generation: 4,
  procurement: 5,
  contracted: 6,
  /* Split halves — same family, deeper step. */
  efficiencyDeep: 7,
  electrifyDeep: 8,
  fuelSwitchDeep: 9,
  refrigerantDeep: 10,
} as const;

export type FamilyIdx = (typeof FAMILY_IDX)[keyof typeof FAMILY_IDX];

/** Indexed by FAMILY_IDX. Exported as an array because that is what the charts
 *  and the MACC layout already consume. */
export const FAMILY_COLORS: string[] = [
  FAMILY_HUE.efficiency,      // 0
  FAMILY_HUE.electrify,       // 1
  FAMILY_HUE.fuelSwitch,      // 2
  FAMILY_HUE.refrigerant,     // 3
  FAMILY_HUE.generation,      // 4
  FAMILY_HUE.procurement,     // 5
  FAMILY_HUE.contracted,      // 6
  FAMILY_HUE_DEEP.efficiency, // 7
  FAMILY_HUE_DEEP.electrify,  // 8
  FAMILY_HUE_DEEP.fuelSwitch, // 9
  FAMILY_HUE_DEEP.refrigerant,// 10
];

/** Fallback for an index outside the table — a neutral, never a guessed hue.
 *  A generated colour would silently join the categorical set and break the
 *  separation the rest of this file exists to guarantee. */
export const FAMILY_COLOR_FALLBACK = FAMILY_HUE.contracted;

export function familyColor(idx: number): string {
  return FAMILY_COLORS[idx] ?? FAMILY_COLOR_FALLBACK;
}
