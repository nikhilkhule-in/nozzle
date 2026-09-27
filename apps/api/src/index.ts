import { Hono } from "hono";
export { NozzleContainer } from "./client/container/nozzleContainer";

const app = new Hono<{
    Bindings: Env;
}>();

export default app;
