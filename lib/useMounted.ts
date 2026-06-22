"use client";

import { useEffect, useState } from "react";

/** True only after the first client render — used to defer Recharts
 *  ResponsiveContainers, which need a measured DOM box. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount flag
  useEffect(() => setMounted(true), []);
  return mounted;
}
