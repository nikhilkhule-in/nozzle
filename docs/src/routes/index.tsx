import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import '@/styles/landing.css';
import { initLanding } from '@/lib/landing';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [{ title: 'Nozzle: any pipeline, any runtime, any team' }],
  }),
  component: Landing,
});

const BAD25 = 'color-mix(in srgb,var(--bad) 25%,transparent)';
const OK25 = 'color-mix(in srgb,var(--ok) 25%,transparent)';

function Landing() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) return initLanding(ref.current);
  }, []);

  return (
    <div ref={ref} className="lp">
      <canvas id="bg" aria-hidden="true"></canvas>
      <header><div className="w nav">
        <a className="lg" href="#top"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h18l-6.5 8v5l-3 2.5V11z"/><circle cx="12" cy="21.5" r="1.5"/></svg>nozzle</a>
        <a className="l" href="#promises">Engine</a><a className="l" href="#build">Run it</a><a className="l" href="#deploy">Anywhere</a><a className="l" href="#teams">Teams</a><a className="l" href="/docs">Docs</a><button className="b s ic" id="md" aria-label="Switch between dark and light mode"><svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/></svg></button>
        <a className="b p" href="#start">Get started</a>
      </div></header>

      <main id="top">
        <section className="hero"><div className="w">
          <h1>Any pipeline.<br />Any runtime.<br />Any team.</h1>
          <p className="sub">Nozzle is a workflow engine that owns three things: the <b>order</b> steps run in, the <b>data</b> that flows between them, and the <b>truth</b> about whether it worked. How you write it, where it runs and who does the work stay yours.</p>
          <div className="cta"><a className="b p" href="#start">Get started</a><a className="b" href="#demo">Break a run on purpose</a></div>
          <div className="win" id="demo">
            <div className="wb"><span className="d"></span><span className="d"></span><span className="d"></span><span>workflow.yaml</span><span className="sp"></span><button className="b s p" id="ap" hidden>Approve deploy</button><button className="b s" id="rp">Replay</button></div>
            <div className="wg"><div className="cb" id="yml" tabIndex={0} aria-label="Workflow definition"></div><div className="gv"><svg id="gr" viewBox="0 0 720 250" role="group" aria-label="Run graph"></svg><p className="hint">Click any step to make it fail and watch what the engine does. Failure stays on its own branch.</p></div></div>
            <div className="lgp" id="lg" role="log" aria-label="Run events"></div>
          </div>
        </div></section>

        <section className="w sec" id="promises">
          <h2>The engine’s promises hold in every environment.</h2>
          <p className="lead">Laptop, cluster or edge, dev or prod, the semantics of a run are identical. Nothing below depends on where you deploy.</p>
          <div className="bn">
            <div className="cd s4"><h3>A graph you can trust</h3><p>The workflow is validated before anything runs. Cycles, unknown dependencies and impossible references are rejected in plain language within a second, not nine minutes into a build.</p>
              <pre className="cb" id="cy"></pre><div className="row"><button className="b s" id="cyb">Add a cycle</button></div><div className="err" id="cye" hidden>error: cycle detected: build, test, deploy, build</div></div>
            <div className="cd s2"><h3>Same input, same run</h3><p>Which ready step goes first, what retries and what is skipped are decided by the engine, the same way every time.</p>
              <div className="chips"><span className="chip">build</span><span className="chip">scan</span><span className="chip">test</span></div><div className="chips" style={{ marginTop: 0 }}><span className="chip">build</span><span className="chip">scan</span><span className="chip">test</span></div></div>
            <div className="cd s2"><h3>Failure stays local</h3><p>A failed step blocks only what depends on it and says why. Independent branches keep going, and the exit code is zero only if every step made it.</p>
              <div className="row" style={{ marginTop: 'auto' }}><span className="sq" style={{ borderColor: 'var(--bad)', background: BAD25 }}></span><span className="sq" style={{ borderColor: 'var(--ln2)', opacity: .5 }}></span><span className="sq" style={{ borderColor: 'var(--ok)', background: OK25 }}></span><span className="sq" style={{ borderColor: 'var(--ok)', background: OK25 }}></span></div></div>
            <div className="cd s4"><h3>Data rides the graph</h3><p>A step’s output reaches every step that needs it. Small values arrive as environment variables, so the image tag from step one is simply $IMAGE_TAG in step two. Large ones, like datasets and checkpoints, travel as blobs by reference. If a value can’t be passed safely, the step fails loudly instead of truncating it.</p>
              <div className="chips"><span className="chip">IMAGE_TAG=reg/app:4f2a9c</span><span className="chip">blob://model.ckpt</span></div><div className="err">error: build output can’t be passed safely, so the step failed instead of truncating it</div></div>
            <div className="cd s3"><h3>Retries with memory</h3><p>Attempts are tracked and bounded, with backoff. Leases and heartbeats mean a lost worker loses nothing, and retried work resumes where the schedule left off.</p>
              <div className="row" style={{ marginTop: 'auto' }}><span className="sq" style={{ borderColor: 'var(--bad)' }}></span><span className="mu">backoff</span><span className="sq" style={{ borderColor: 'var(--bad)' }}></span><span className="mu">backoff</span><span className="sq" style={{ borderColor: 'var(--ok)', background: OK25 }}></span></div></div>
            <div className="cd s3"><h3>Gates, conditions and events</h3><p>Conditional steps are skipped honestly, never silently. A gate suspends the run until a human answers. Every lifecycle move is an event, so any run can be replayed exactly.</p>
              <div className="chips"><span className="chip">claimed</span><span className="chip">started</span><span className="chip">retried</span><span className="chip">succeeded</span></div></div>
            <div className="cd s6"><h3>One workflow, every environment</h3><p>Dev, staging and prod run the same file. Steps are local processes on a laptop and containers in prod, prod adds an approval gate, and ordering, data flow and failure semantics stay identical in all three.</p><div className="tabs" data-g="env"><button data-k="dev">Dev</button><button data-k="stg">Staging</button><button data-k="prod">Prod</button></div><pre className="cb" id="ev"></pre></div>
          </div>
          <div className="ar">
            <div className="cd"><h3>Schedule it</h3><p>Add a cron line to the same file. No separate scheduler to keep alive.</p></div>
            <div className="cd"><h3>Watch it</h3><p>The web console listens to the lifecycle stream, so live states, logs and retries never go stale.</p></div>
            <div className="cd"><h3>Replay it</h3><p>A run is its event stream. Replay any run to debug it or show a teammate what happened.</p></div>
            <div className="cd"><h3>Generate clients</h3><p>One HTTP contract defines the engine, so clients generate themselves in any language.</p></div>
          </div>
        </section>

        <section className="w sec" id="build">
          <h2>Write it your way. Run it your way.</h2>
          <p className="lead">The language is your choice and so is the runtime. Neither one changes what the engine guarantees.</p>
          <div className="two">
            <div className="cd"><h3>Many languages, one spec.</h3><div className="tabs" data-g="lang"><button data-k="yaml">YAML</button><button data-k="py">Python</button><button data-k="ts">TypeScript</button></div><pre className="cb" id="lc"></pre><p>Every definition compiles to the same neutral spec. The engine can’t tell a hand-written file from a generated one.</p></div>
            <div className="cd"><h3>One executor per step</h3><div className="tabs" data-g="exe"><button data-k="shell">Local shell</button><button data-k="container">Container</button><button data-k="remote">Remote machine</button><button data-k="function">Cloud function</button><button data-k="more" aria-label="More executors">…</button></div><pre className="cb" id="ec"></pre><p id="ed"></p></div>
          </div>
          <p className="hint">Code samples are illustrative.</p>
        </section>

        <section className="w sec" id="deploy">
          <h2>Many places to run it.</h2>
          <p className="lead">The engine itself runs anywhere, from a laptop to Docker Compose, Kubernetes or the edge, and it can send each step anywhere too. Pick a place below.</p>
          <div className="dep env"><div><pre className="cb" id="xc"></pre><div className="term" id="xt" role="log" aria-live="polite"></div></div><div className="envg" id="xg" role="group" aria-label="Where the step runs"></div></div>
          <p className="hint">Executors are pluggable: pick one per step, or write your own.</p>
        </section>

        <section className="w sec" id="teams">
          <h2>One object at the center of every team’s pipeline.</h2>
          <p className="lead">Five teams, one engine. Each keeps its own language, runtime and location, and none pays a platform tax. Pick a team, or watch them cycle.</p>
          <div className="rf"><div className="tabs v" data-g="tm" id="tmb"></div><div className="cd" id="tmv"></div></div>
        </section>

        <section className="w sec" id="refuse">
          <h2>What Nozzle refuses to do, and what that saves you.</h2>
          <p className="lead">Pick a failure mode and see how it plays out elsewhere and with Nozzle.</p>
          <div className="rf"><div className="tabs v" data-g="no" id="nob"></div><div className="rfp"><div className="cd"><h3>Elsewhere</h3><div className="lgx" id="rb"></div></div><div className="cd"><h3>With Nozzle</h3><div className="lgx" id="rg"></div></div></div></div>
        </section>

        <section className="w sec end" id="start">
          <h2>What’s the one pipeline you’d trust to run while you sleep?</h2>
          <p className="lead" style={{ margin: '0 auto 30px' }}>You decide how and where. It decides order, data and truth.</p>
          <div className="cmdb"><span id="cmdtxt">nzl run <span id="fn">ci.yaml</span></span><button className="b s p" id="cp">Copy</button></div>
        </section>
      </main>
      <footer><div className="w"><span>Nozzle. Steps, and nothing else.</span><a href="#top">Back to top</a></div></footer>
    </div>
  );
}
