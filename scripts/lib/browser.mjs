// Shared Chromium launch args for the two scripts that must produce
// byte-comparable screenshots of DIFFERENT documents in the SAME run:
// capture-design-reference.mjs (the approved bundle) and visual-check.mjs
// (our app). Both launch their own `chromium.launch()` — two separate
// browser processes — and on CI's headless Linux runners, Chromium's
// default LCD/subpixel text rendering path is not guaranteed to rasterize
// identical glyphs identically across two separate process launches: text
// hinting can pick a different subpixel rounding depending on GPU/software
// rasterizer state at the moment each process starts. macOS Chromium does
// not show this because CoreGraphics smooths over it; Linux's FreeType
// backend does not.
//
// Evidence this is rendering noise, not a real regression: CI's own
// `visual-diffs` artifact (e.g. run 34770874991) shows `.diff.png` fringing
// on literally every glyph, on every screen, while vector chrome — borders,
// dividers, the sticky-nav rules — stays pixel-identical. A real layout or
// color defect would show as solid rectangular blocks or missing/shifted
// elements, not glyph-shaped edge fringing on 100% of the text and nothing
// else. See docs/DESIGN-SYSTEM.md for the dated writeup.
//
// The fix: force both processes onto the same deterministic, grayscale,
// non-LCD text path so two separate launches agree byte-for-byte.
export const FONT_STABLE_ARGS = [
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--disable-font-subpixel-positioning',
  '--force-color-profile=srgb',
]
