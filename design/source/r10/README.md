# r10 — the pixel contract (ADR-027)

Frozen on 28 Sep 2026 from `design/proposals/r8-*.html` and
`design/proposals/r8/` at round r10.5, as reviewed and accepted by Vipin.
**Do not edit.** Changes to the design are new proposals plus an ADR.

The only change from the proposals is mechanical. These files sit one folder
deeper, so every relative path to `public/` or `node_modules/` gained one
`../` (19 references). Nothing else was touched. The written spec is
`DESIGN.md`. The build plan is `docs/REDESIGN.md`.

`r8/data.js` is invented demo data. The app never reads it (REDESIGN.md, D7).
The Google Fonts `@import` and the `.proto` font switcher in `r8/tokens.css`
and `r8/ui.js` are proposal tooling: the app ships Instrument Sans from
`@fontsource-variable/instrument-sans` (family name `Instrument Sans
Variable`).
