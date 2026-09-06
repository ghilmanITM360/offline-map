Owner: useMapMode selects priority; MapChromePolicy owns visibility; HomeScreen and NavigationChrome V1/V2 render it.
Inputs/states: Existing canonical MapMode only; no mutable mode or banner manager.
Why: Prevent P1-HIGH navigation/arrival and discovery chrome collisions without changing routing or GIS.
Invariant: One mode owns chrome; selected/preview recenter only, navigation compass/recenter, arrival destination and Done only.
Regression test: MapChromePolicy.test.ts matrix; HomeScreen.test.tsx transitions; MapControls and NavigationChrome V1/V2 visibility/actions.
