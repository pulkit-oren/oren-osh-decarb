/** Oren 3-dot brand mark. */
export function OrenLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Oren">
      <circle cx={16} cy={16} r={9} fill="#A8D480" />
      <circle cx={32} cy={16} r={9} fill="#F5C447" />
      <circle cx={24} cy={32} r={9} fill="#F2924A" />
    </svg>
  );
}
