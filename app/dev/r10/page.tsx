import { notFound } from "next/navigation";

import { PrimitiveAStubs } from "./primitives-a";
import { PrimitiveBStubs } from "./primitives-b";

export default function R10Preview() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main className="r10" data-theme="dark">
      <div className="ambient" aria-hidden="true" />
      <div className="app">
        <div className="frame page">
          <header className="page-head">
            <div>
              <p className="label gold">Foundation preview</p>
              <h1 className="display-lg">The credential</h1>
              <p className="lede">
                r10 tokens, bezel surfaces and the type scale at the approved
                desk widths.
              </p>
            </div>
            <span className="pill pill-ok">Dark / ready</span>
          </header>

          <section className="card" aria-labelledby="preview-surface">
            <div className="section-head">
              <h2 id="preview-surface" className="label">
                Surface
              </h2>
              <span className="mono ink-3">ACC-180</span>
            </div>
            <div className="glass" style={{ padding: "var(--s-6)", borderRadius: "var(--r-lg)" }}>
              <p className="label ink-2">Glass sheet surface</p>
              <p className="display-md">12:40</p>
              <p className="body-sm ink-2">
                The plate stays solid by default and earns blur only on a
                wide, hover-capable surface.
              </p>
            </div>
          </section>

          <section className="section" aria-labelledby="preview-type">
            <div className="section-head">
              <h2 id="preview-type" className="label">
                Type scale
              </h2>
            </div>
            <div className="card">
              <p className="display-xl">612</p>
              <p className="display-lg">Approved</p>
              <p className="display-sm">People and passes</p>
              <p className="body-sm ink-2">
                Instrument Sans carries sentences. Oswald carries labels.
                Anton carries names and numbers.
              </p>
              <button className="btn btn-primary" type="button">
                Continue
              </button>
            </div>
          </section>
        </div>
      </div>
      <PrimitiveAStubs />
      <PrimitiveBStubs />
    </main>
  );
}
