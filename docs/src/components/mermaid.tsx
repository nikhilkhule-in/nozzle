'use client';

import { useEffect, useId, useRef, useState } from 'react';

type MermaidModule = typeof import('mermaid').default;

let mermaidSingleton: Promise<MermaidModule> | null = null;

function loadMermaid(): Promise<MermaidModule> {
  mermaidSingleton ??= import('mermaid').then((m) => {
    return m.default;
  });
  return mermaidSingleton;
}

/**
 * Renders `mermaid` code fences (fenced blocks are converted to this
 * component by `remarkMdxMermaid`). The mermaid package is heavy, so it is
 * imported on first chart and never blocks page load; diagrams re-render
 * when the site theme toggles.
 */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const read = () => setDark(html.classList.contains('dark'));
    read();
    const observer = new MutationObserver(read);
    observer.observe(html, { attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then(async (mermaid) => {
        if (cancelled || !hostRef.current) return;
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? 'dark' : 'neutral',
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          flowchart: { htmlLabels: false },
        });
        const safeId = `m-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
        const { svg } = await mermaid.render(safeId, chart);
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = svg;
        const el = hostRef.current.firstElementChild;
        if (el instanceof HTMLElement) {
          el.style.width = '100%';
          el.style.height = 'auto';
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [chart, dark, id]);

  return failed ? (
    <pre className="fd-scroll-none overflow-x-auto rounded-lg bg-fd-muted p-4 text-sm">
      <code>{chart}</code>
    </pre>
  ) : (
    <div className="not-prose my-4 w-full overflow-x-auto" ref={hostRef} />
  );
}
