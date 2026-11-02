# Performance and stress — bounded emulator measurements

Accepted APK7b343f5b15a3588bd78fb670e0d2123b3e373259f74d512c290a8a9918d9030f, API36 ARM64, host GPU,2guest cores/2048MB. These results do not certify physical performance or leak freedom.

20/20 background→foreground cycles retained manual guide step2.20/20 new manual sessions reached step2 and exited to the directory via actual touches. Per-iteration UI XML, exact touch coordinates/commands and JSONL remain external. Background cycles total48.379s,median2.356s; manual sessions total136.031s,median5.94s (first19.945s includes locating stage controls). These include ADB/UIAutomator/assertion overhead, not app response latency.

| Sample | PSS KiB | RSS KiB | Swap PSS KiB |
|---|---:|---:|---:|
| before-stress-memory.txt | 124197 | 217896 | 377 |
| after-background-memory.txt | 116167 | 211068 | 239 |
| session-05-memory.txt | 148726 | 244292 | 239 |
| session-10-memory.txt | 175675 | 271424 | 239 |
| session-15-memory.txt | 156969 | 252776 | 239 |
| session-20-memory.txt | 181833 | 277668 | 239 |

PSS fell after foreground cycles, grew during new sessions, fell at15 and rose again at20. No retained-heap/allocator/GPU attribution or plateau has been proved. Memory-growth characterization remains OPEN; do not call this a proven leak or a leak-free pass. Next action: same binary, longer bounded blocks with quiet baselines and native heap/GPU attribution before choosing a source correction.

Android gfxinfo for the restored accepted app:3270frames,382janky(11.68%); frame percentiles16/18/25/48ms at50/90/95/99; GPU13/16/17/24ms. This is emulator cumulative rendering, not isolated routing latency. Latest1000-line log slice had no app-named ANR/FATAL match; this does not prove absence across an unrecorded interval. Pack-lab current-PID top second sample measured2.0%CPU and216MBRES; an earlier stale-PID top file is explicitly not app performance evidence.

Fresh offline cold launch am-start TotalTime833ms; corrected initial cold990ms. Shipped startup display on fresh offline storage reported install196ms(copy74/read0),recover61ms,open60ms,0verification-read bytes because pinned bundled input path was used. Native pack lab reported5281MB free. Actual timings are single observations, not percentiles.

UIAutomator intermittently timed out before actions; screenshot/ADB later recovered. Emulator logged bad color buffer handle333; host memory free34–35% during one interruption. No causal GPU, host-pressure, framework or SDK attribution is proved. Retried premature candidate/demo-tool actions are recorded as automation errors, not app failures.

Rapid permission races, duplicate/out-of-order noisy fixes, repeated reroutes,20Live sessions,20Live lifecycle races, small-screen/three-button layouts, native accessibility-service traversal, timer/listener/watch leak attribution and long-running CPU/ANR tests remain NOT RUN. iOS stress BLOCKED by Pods. Human TalkBack/VoiceOver remain external.
