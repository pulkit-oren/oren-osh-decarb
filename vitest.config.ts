import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    // Engine tests are pure → node. Component tests opt into jsdom via
    // a `// @vitest-environment jsdom` comment at the top of the file.
    environment: "node",
    globals: true,

    /* Half the cores, not all of them.

       Vitest's default spawns a worker per core less one. On the jsdom
       integration tests — which render the whole Shell and click through it —
       that oversubscribes badly enough to STARVE them: measured on a 12-core
       machine, `create-goal-flow` takes 745 ms alone and 5,261 ms in a full
       run, and it crossed the 5 s timeout and failed while passing on its own.
       Four more tests sat between 2.9 and 3.7 s, queued up to flake next.

       Capping at 50% is free. Wall clock over the whole suite: 45.1 s at the
       default (with failures), 45.7 s at six workers, and slower below that —
       the extra workers were buying contention, not speed. Expressed as a
       percentage rather than a number so a smaller CI box scales down with it.

       Raising `testTimeout` instead would have hidden this: the timeout's job
       is to catch a hung test, and a test that honestly costs 745 ms does not
       need a bigger budget — it needs a runner that will schedule it. */
    maxWorkers: "50%",

    /* A hang detector, not a performance budget.

       The default 5 s was never calibrated against this suite. Its heaviest
       tests render the whole Shell and click through it, and one of them now
       runs the mix optimiser twice; measured in isolation on an idle machine
       they take 2-3 s. A 5 s ceiling over 2.5 s of honest work is 2x headroom,
       which is not a hang detector — it is a coin flip that comes up tails
       whenever the machine is busy.

       This does NOT replace the maxWorkers cap above, and must not be read as
       superseding it. That cap fixed a real defect: the runner was starving
       its own tests 4-7x by oversubscribing the cores, and raising the timeout
       instead would have hidden it while every test stayed needlessly slow.
       With scheduling fixed, what is left is a threshold set too close to the
       work. Both are needed, for different reasons.

       20 s still catches a genuine hang in a fifth of a minute. */
    testTimeout: 20_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
