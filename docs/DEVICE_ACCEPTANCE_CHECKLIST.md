# Physical-Device Acceptance Checklist

A fill-in template for one real test cycle on a physical Android phone. It is a procedure, not a result: every row starts **NOT RUN**. Do not carry rows over from an earlier cycle or from an emulator run, and do not copy a PASS from source/Jest evidence (see the evidence levels in `AGENTS.md`).

TalkBack, large-font and small-screen items are **not repeated here**: run the device accessibility checklist in `docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md` alongside section 11 and record its result in the same cycle.

## 0. Cycle record (fill first)

| Field | Value |
|---|---|
| Date / tester | |
| Build commit (from `git rev-parse HEAD` of the build worktree) | |
| APK file and SHA-256 (`shasum -a 256`) | |
| Signing | debug key (testing) / other |
| Phone make, model, Android version, OEM skin | |
| Battery saver / OEM battery optimiser for the app | on / off (state which) |
| Location setting | High accuracy on, app permission "Precise" granted |
| Where tested | real outdoor GPS / indoors / mock-location app (state which; mock = **not** field evidence) |

Install with `adb install -r <apk>` after `adb uninstall com.aicrafted.karachiijtema` for a first-install pass. Capture `adb logcat -v time` to a file for the whole cycle and note any `FATAL EXCEPTION`.

## 1. Result key

`PASS` observed and matches expected · `FAIL` observed and does not match (attach evidence) · `BLOCKED` could not be run (say why) · `N/A` not reachable in this build (say how you checked) · `NOT RUN`.

Evidence for each row: a screenshot or screen recording, plus the log excerpt for anything involving GPS or lifecycle. A row with no evidence is `NOT RUN`.

## 2. First install and onboarding

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 2.1 | Fresh install, cold launch, no dev server | Splash, then Welcome | NOT RUN | |
| 2.2 | Continue, allow location "While using the app" (Precise) | Download Map screen | NOT RUN | |
| 2.3 | Choose the venue-map-only option and confirm | Home map with the gate markers | NOT RUN | |
| 2.4 | Force-stop and relaunch | Lands on the Directory, not onboarding | NOT RUN | |

## 3. Real GPS acquisition and freshness (#46 tier)

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 3.1 | Outdoors, open the Home map | Blue dot appears at your true position; accuracy circle plausible | NOT RUN | |
| 3.2 | Select a destination and open Directions | Start Navigation is disabled until a fresh precise fix exists, then enables | NOT RUN | |
| 3.3 | Turn location off in quick settings, reopen the app | Clear, non-jargon message; no crash; Start stays disabled | NOT RUN | |
| 3.4 | Deny then re-grant precise location | Flow recovers without reinstall | NOT RUN | |
| 3.5 | Grant only approximate location | Start is refused with the precise-location message | NOT RUN | |

## 4. V2 navigation (default runtime)

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 4.1 | Outside the venue, route to a Block | Route Ready shows distance and time; text says where the route starts | NOT RUN | |
| 4.2 | Start Navigation | Instruction card, progress and ETA update as you walk | NOT RUN | |
| 4.3 | Walk a few metres off the route and keep going | "Rerouting…" appears, then clears with a new route; it does not stay stuck (#143) | NOT RUN | |
| 4.4 | Arrive | Arrival card shows; Done returns to Home; a new trip starts cleanly with no stale arrival (#111, #113) | NOT RUN | |
| 4.5 | Exit mid-trip via the exit control | Confirmation appears; Exit clears the route and restores the normal map | NOT RUN | |

## 5. V1 navigation (retained fallback)

Run only if this build can reach a V1 (legacy) destination. If you cannot, mark every row `N/A` and write how you checked. Do not invent a way to force it.

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 5.1 | Start navigation to a legacy destination | Navigation runs; instruction card and progress update | NOT RUN | |
| 5.2 | Walk off route | Reroute completes (does not hang; #169) | NOT RUN | |
| 5.3 | Exit, then start another trip | No leftover arrival state or reroute cooldown (#149) | NOT RUN | |

## 6. Manual gate retention and #124 scenarios

A physical phone will not be at the #124 coordinates. To run these you must inject a location with a mock-location app (Developer options, "Select mock location app"). Record the result as **mock location on device**, which is not field evidence.

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 6.1 | Mock origin `24.964727, 66.999026`, destination Block 27, automatic gate | Road route from the offline street graph, not "Direct guide"; at time of writing source-level runs pick Gate 08 (see #124) | NOT RUN | |
| 6.2 | Same origin, choose Gate 21 manually | Road route through Gate 21; no "Direct guide" | NOT RUN | |
| 6.3 | Same origin, choose Gate 01 manually | Road route through Gate 01; no "Direct guide" | NOT RUN | |
| 6.4 | Press Retry road route several times on 6.2 and 6.3 | Never falls back to "Direct guide" while a road route exists | NOT RUN | |
| 6.5 | Start navigation on 6.2, then drift off route until it reroutes | The reroute keeps Gate 21; it does not silently switch gate (#160) | NOT RUN | |
| 6.6 | Start a new trip with the gate left on automatic | The previous manual gate is not carried over | NOT RUN | |

## 7. Navigation exit

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 7.1 | Exit at each stage: mid-walk and mid-reroute (Exit control), and at arrival (Done) | Exit asks "Exit navigation?" and then returns to a clean Home with the normal map controls; Done at arrival returns to Home without that prompt | NOT RUN | |
| 7.2 | Android back button during navigation | The same "Exit navigation?" confirmation as the Exit control (they share one handler), not a silent quit | NOT RUN | |

## 8. GPS loss and recovery

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 8.1 | While navigating, go somewhere with no sky view (a covered area or indoors) for about 15 s. Airplane mode alone does not reliably cut GPS, so do not use it for this row | A GPS-lost message appears within roughly 8 s; the position is not shown as live | NOT RUN | |
| 8.2 | Return to open sky | Message clears on the first fresh fix; progress resumes; no false arrival | NOT RUN | |
| 8.3 | Weak-accuracy fix (stand next to a building) | A weak-GPS notice; the route is held stable rather than jumping | NOT RUN | |

## 9. Background and foreground (NAV-004)

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 9.1 | Navigating in V2: press Home, walk for 2 minutes, reopen | A fresh fix is requested at once; progress moves to your new position; no "arrived" or jump from a cached fix | NOT RUN | |
| 9.2 | Navigating in V2: lock the screen for 2 minutes, unlock | Same as 9.1 | NOT RUN | |
| 9.3 | Same as 9.1 in V1, if reachable | A "Waiting for a fresh GPS position…" line appears until the first fresh fix, then clears (needs the NAV-004 change; PR #172) | NOT RUN | |
| 9.4 | Quick app switch (under 5 s) | No stale-position notice | NOT RUN | |

## 10. Process death (#139)

`am kill` and `am force-stop` are different and must be reported separately. `am kill` only ends an app that is in the background, and is the closer stand-in for Android's low-memory kill. `am force-stop` ends it from any state, removes it from recents and puts it in the stopped state. Never use `pm clear` here; it wipes stored data and invalidates the test.

The expected behavior below is **undecided** until the owner chooses restore or notify-and-rebuild (see `docs/audit/ISSUE_139_PROCESS_DEATH_DESIGN.md`). Record what you observe; do not mark PASS or FAIL against a policy that has not been approved. The invariant that already holds: navigation must **never** resume by itself or from a stale position.

Package: `com.aicrafted.karachiijtema`.

| # | Step | Observe | Result | Evidence |
|---|---|---|---|---|
| 10.1 | Navigate, press Home, run `adb shell am kill com.aicrafted.karachiijtema`, confirm with `adb shell pidof com.aicrafted.karachiijtema` (empty), reopen from **recents** | Landing screen; whether any notice or journey appears; Start not active | NOT RUN | |
| 10.2 | Repeat 10.1 but reopen from the **launcher icon** | Same observations | NOT RUN | |
| 10.3 | Navigate, run `adb shell am force-stop com.aicrafted.karachiijtema`, reopen from the launcher | Same observations (report separately from 10.1) | NOT RUN | |
| 10.4 | Navigate, swipe the app away from recents, reopen | Same observations | NOT RUN | |
| 10.5 | Repeat 10.1 with airplane mode on, then with location off | Nothing resumes; any message is neutral about the cause | NOT RUN | |

## 11. Accessibility and font scale

Run the device accessibility checklist in `docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md` (TalkBack announcements, focus on the arrival card, touch targets, maximum font scale on a small screen) for V2 and, if reachable, V1. Record its rows in the same cycle and link them here.

## 12. Offline

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 12.1 | Airplane mode on, force-stop, relaunch | App opens to the Directory; recents and all blocks present | NOT RUN | |
| 12.2 | Offline, route to a Block | Route Ready from bundled data; no online-only error | NOT RUN | |
| 12.3 | Offline, start navigation and walk | Navigation works from bundled data | NOT RUN | |

## 13. Sign-off

Summarise counts of PASS / FAIL / BLOCKED / N/A. Any FAIL needs an issue (search for an existing one first). This cycle may be cited as **PHYSICAL DEVICE VERIFIED** only for rows marked PASS with evidence, on the build recorded in section 0. It says nothing about other builds, other phones, or the venue (#46 needs an actual walk at the venue).
