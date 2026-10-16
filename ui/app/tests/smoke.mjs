// Task 7.2 verification: browser smoke against the local stack.
// Seeds one workflow via the API, then drives Chromium: sidebar renders,
// workflows table lists it, trigger dialog blocks invalid JSON, valid
// trigger creates a run and navigates to the workflow view showing it.
import { chromium } from '@playwright/test';

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8003';
const DAG = {
  tasks: [{ name: 't0', runtime: 'local-process' }],
  edges: [],
};

async function api(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

const browser = await chromium.launch();
try {
  await api('/workflows', { id: 'smoke-ui', language: 'python', bundle: 'local-dev', dag: DAG });

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/app/`, { waitUntil: 'networkidle' });
  await page.getByText('smoke-ui').first().waitFor();

  await page.getByRole('button', { name: 'Trigger run' }).click();
  await page.getByLabel('Workflow').selectOption('smoke-ui');
  await page.getByLabel('Run inputs (JSON)').fill('{invalid');
  await page.getByRole('button', { name: 'Create run', exact: true }).click();
  await page.getByText('Invalid JSON').waitFor();

  await page.getByLabel('Run inputs (JSON)').fill('{"date": "2026-10-16"}');
  await page.getByRole('button', { name: 'Create run', exact: true }).click();
  await page.waitForURL('**/workflows/smoke-ui?run=R-*');
  await page.getByText('Runs of this workflow').waitFor();
  const runRow = page.locator('tbody tr').first();
  await runRow.waitFor();
  const runId = await runRow.locator('td').first().innerText();
  if (!/^R-\d+$/.test(runId)) throw new Error(`unexpected run id: ${runId}`);

  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  console.log(`ui smoke OK: triggered ${runId}, navigated to workflow view`);
} finally {
  await browser.close();
}
