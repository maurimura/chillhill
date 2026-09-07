# Streaming performance

## What caused the recurring hitch

Traffic visuals were indexed by their position in the traffic array. Removing its first vehicle shifted every survivor into another slot. That could synchronously rebuild several complete procedural cars — including rounded boxes, wheel geometry, materials and badge textures — in one render call. The associated short-lived allocation also put pressure on garbage collection.

The controlled local Chrome profile reproduced traffic-update spikes up to **251.8 ms**, with render calls up to **265.7 ms**, at those replacement events. New 180 m terrain chunks were also generated synchronously in the render loop, costing up to **6.7 ms** in the same run.

No unbounded main-thread heap or GPU-resource growth was found in this finite test. That is not proof that every browser/session is leak-free; the evidence points to synchronous rebuilds as the reproduced recurring stall.

## Changes

- `TrafficVisuals` now keys live instances by stable vehicle ID, so survivors keep their models when the array changes order.
- Five traffic model templates are built once when entering Drift king. Instances share their immutable geometry and badge textures, but have independent materials, paint, lamps and animated wheel/body groups. A new traffic ID needs only a cheap instance, not another procedural build.
- Instances dispose only their own materials. Templates own geometry/textures and are released after all their instances on softness changes, leaving Drift king, or scene disposal. There is no history of retired cars or cache for every softness value.
- `TerrainPrefetch` uses one module worker to prepare the next forward-streamed terrain mesh. Typed-array buffers transfer back without copying. The worker calls the original terrain generator, preserving the same seeded vertices, normals and colors.
- The prefetcher holds at most one running job and one completed mesh; obsolete destinations are replaced, not queued indefinitely. Shape/world changes cancel the old worker, and generation IDs reject stale results. Scene disposal terminates the worker and clears the buffers.
- Initial scenery, abrupt teleports/camera direction changes, and unsupported/blocked workers retain a synchronous fallback. A missing prefetch never produces a road gap. Normal world streaming still has exactly seven resident chunks.

The debug telemetry at `window.__chillhill.environment` includes `trafficCache` and `terrainPrefetch`. During ordinary forward travel, template `builds` should stay at five, worker `hits` should increase, and initial terrain `fallbacks` should stop growing. Changing softness legitimately rebuilds the templates; switching world geometry legitimately resets worker preparation.

## Reproduce a profile

With Vite running, use:

```sh
npm run test:performance
PERF_TAG=slow-cpu PERF_CPU=4 npm run test:performance
```

Chrome runs in an isolated profile. Reports and DevTools-loadable `.cpuprofile` files go to ignored `artifacts/performance-<tag>.*`. `PERF_CPU` sets Chrome's CPU-throttling rate (1–6); it is an approximation, not a physical mobile-device test.

The workload measures 1,080 animation frames across dense forest, city and lakes: 54 streamed chunk replacements, 27 traffic replacements, and hitbox debug enabled for a third of the frames. Travel is intentionally accelerated to exercise loading boundaries frequently. It uses the real renderer at 1280 × 800, pixel ratio 1, softness 65%, and tree density 1.5. The app's separate welcome animation is stopped, and initial scene/template construction is outside the measured steady-state render calls. Driving physics/HUD work and GPU completion time are not included in the render-call timings. This is not an end-to-end FPS guarantee.

Local unthrottled before/after results (same workload):

| Measurement                      |     Before |      After |
| -------------------------------- | ---------: | ---------: |
| Worst render call                |   265.7 ms |    11.5 ms |
| Render calls over 50 ms          |         27 |          0 |
| Worst traffic update             |   251.8 ms |     0.5 ms |
| Worst main-thread chunk assembly |     6.7 ms |     1.7 ms |
| Per-batch render p95             | 6.1–8.9 ms | 3.7–4.2 ms |

All 54 forward-streaming terrain builds were prefetch hits after the initial synchronous scenery. Main-thread heap snapshots after forced GC remained roughly 15.6–16.7 MiB across both runs, with a small warm-up rise. Forced GC runs **between** timed batches; CPU profiles therefore include explicit GC that should not be mistaken for spontaneous gameplay pauses. The reported heap is the page isolate, not the worker's heap or total GPU memory.

Remaining costs include first-time model/shader initialization, full world edits/season rebuilds, synchronous fallbacks on sudden camera changes, and GPU load at high pixel ratios. Physical Safari/Android testing is still needed. Use the existing render-quality setting when pixel fill/shadows are the limiting factor.

## Regression coverage

`npm test` covers the bounded worker queue, stale jobs, cancellation, unsupported workers and disposal. The full browser suite verifies 120 traffic replacements without rebuilding, stable survivor identities, independent paint/wheel animation, shared-resource lifetime, softness invalidation, and exact equality of 922,320 terrain attribute values across all six landscapes and two softness settings. Existing driving/collision/camera/garage tests remain in place.
