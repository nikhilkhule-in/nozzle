import { Container } from "@cloudflare/containers";
import { Hono } from "hono";

interface Env {
  WORKER_POOL: DurableObjectNamespace<NozzleWorkerPool>;
}

export class NozzleWorkerPool extends Container {
  defaultPort = 0;
}

const app = new Hono<{ Bindings: Env }>();

app.post("/instances", async (c) => {
  const body = await c.req.json<{ name?: string; env?: Record<string, string> }>();
  const name = body.name ?? `w-${Date.now().toString(36)}`;
  const stub = c.env.WORKER_POOL.getByName(name);
  await stub.start({ envVars: body.env ?? {} });
  return c.json({ instance: name, started: true });
});

app.post("/instances/:name/stop", async (c) => {
  const stub = c.env.WORKER_POOL.getByName(c.req.param("name"));
  await stub.stop();
  return c.json({ instance: c.req.param("name"), stopped: true });
});

app.get("/instances/:name", async (c) => {
  const stub = c.env.WORKER_POOL.getByName(c.req.param("name"));
  const state = await stub.getState();
  return c.json({ instance: c.req.param("name"), state });
});

export default app;
