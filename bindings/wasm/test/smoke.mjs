// Task 2.3 verification: Node loads the wasm-pack build and calls Rust logic.
import { strict as assert } from "node:assert";
import {
  core_version,
  assert_compat,
  evaluate_predicate,
  validate_workflow,
  next_ready,
  task_readiness,
  classify_output,
  defaults,
} from "../pkg/nozzle_core_wasm.js";

const DAG = {
  id: "w",
  language: "python",
  tasks: [
    { name: "t0", runtime: "local-process" },
    { name: "t_yes", runtime: "local-process" },
    { name: "t_no", runtime: "local-process" },
  ],
  edges: [
    { upstream: "t0", downstream: "t_yes", arg: "x", predicate: { op: "equals", value: true } },
    { upstream: "t0", downstream: "t_no", arg: "x", predicate: { op: "equals", value: false } },
  ],
};

validate_workflow(JSON.stringify(DAG));

assert.throws(() => validate_workflow(JSON.stringify({ ...DAG, tasks: [] })), /unknown|empty|edge/i);

const tasks = JSON.stringify([
  { name: "t0", status: "succeeded", output: true },
  { name: "t_yes", status: "queued" },
  { name: "t_no", status: "queued" },
]);
const edges = JSON.stringify(DAG.edges);
assert.deepEqual(JSON.parse(next_ready(tasks, edges)), ["t_yes"]);
assert.equal(task_readiness("t_no", tasks, edges), "should_skip");
assert.equal(classify_output(10n, "auto", 64n), "inline");
assert.equal(classify_output(64n, "auto", 64n), "blob");
assert.equal(evaluate_predicate("true", JSON.stringify({ op: "equals", value: true })), true);
assert.equal(evaluate_predicate("1", JSON.stringify({ op: "equals", value: "1" })), false);
assert.equal(Object.keys(JSON.parse(defaults())).length, 6);

assert_compat(core_version());
assert.throws(() => assert_compat("0.0.0"), /lockstep/);

console.log("wasm smoke OK, core", core_version());
