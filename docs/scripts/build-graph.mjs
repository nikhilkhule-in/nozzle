/**
 * Build docs/src/lib/graph.json — the topic graph of the documentation:
 * nodes = pages, edges = internal links (plus optional `related` lists in
 * frontmatter). Consumed by the interactive graph page, the local-graph
 * panel in the TOC column, and per-page backlinks.
 *
 * Run automatically before `dev` and `build` (see package.json).
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const contentDir = path.join(root, '..', 'content', 'docs');
const outFile = path.join(root, '..', 'src', 'lib', 'graph.json');

/** slug of `content/docs/<...path>.mdx` — index.mdx collapses into the collection root */
function toSlug(rel) {
  const noExt = rel.replace(/\.mdx?$/, '');
  return noExt.endsWith('/index') ? noExt.slice(0, -'/index'.length) : noExt;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end === -1) return {};
  const block = text.slice(3, end).split('\n');
  const out = {};
  let inList = null;
  for (const line of block) {
    const listMatch = line.match(/^\s+- (.+)$/);
    if (inList && listMatch) {
      (out[inList] ??= []).push(listMatch[1].trim().replace(/\?.+$/, ''));
      continue;
    }
    if (inList && !line.trim() + ''.startsWith(' ') && line.trim() !== '') inList = null;
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    if (raw === '') {
      inList = key;
      out[key] = [];
    } else if (raw.startsWith('[') && raw.endsWith(']')) {
      out[key] = raw
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, '').replace(/\?.+$/, ''))
        .filter(Boolean);
      inList = null;
    } else {
      out[key] = raw.replace(/^['"]|['"]$/g, '');
      inList = null;
    }
  }
  return out;
}

const LINK_RE = /\]\((\/docs\/[^)\s]+)\)/g;

async function collect() {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.mdx?$/.test(entry.name)) files.push(path.relative(contentDir, full));
    }
  }
  await walk(contentDir);
  files.sort(); // readdir order is not stable — keep output byte-deterministic

  const slugs = new Set(files.map((f) => toSlug(f)));
  const nodes = [];
  const edges = [];
  const seen = new Set();

  for (const rel of files) {
    const slug = toSlug(rel);
    const text = await readFile(path.join(contentDir, rel), 'utf8');
    const fm = parseFrontmatter(text);
    const section = slug === '' ? '' : slug.split('/')[0];
    nodes.push({
      id: slug,
      title: typeof fm.title === 'string' && fm.title ? fm.title : slug.split('/').pop(),
      section,
    });

    const targets = [];
    for (const match of text.matchAll(LINK_RE)) {
      let to = match[1]
        .replace(/^\/docs\//, '')
        .replace(/\/$/, '')
        .replace(/#.*$/, '')
        .replace(/\?.*$/, '');
      if (to.endsWith('.md')) to = to.replace(/\.md$/, '');
      if (to === slug || !slugs.has(to)) continue;
      targets.push(to);
    }
    for (const to of typeof fm.related === 'string' ? [fm.related] : (fm.related ?? [])) {
      if (slugs.has(to) && to !== slug) targets.push(to);
    }
    for (const to of targets) {
      const key = `${slug} -> ${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([slug, to]);
    }
  }

  await writeFile(outFile, JSON.stringify({ nodes, edges }, null, 2) + '\n');
  console.log(`graph.json: ${nodes.length} nodes, ${edges.length} edges`);
}

collect();
