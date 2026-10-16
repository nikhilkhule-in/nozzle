//! wasm-bindgen surface over the Rust core for TypeScript consumers
<<<<<<< HEAD
//! (future JS/TS SDKs).
//!
//! Mirrors the PyO3 surface exactly: JSON-in/JSON-out, no logic beyond
//! serialization and error translation. All behavior lives in `nozzle-core`.

use nozzle_core::{assert_compat as core_assert_compat, config, dag, readiness, refs, states, xcom};
use wasm_bindgen::prelude::*;

fn err(msg: String) -> JsValue {
    JsValue::from_str(&msg)
}

#[wasm_bindgen]
pub fn core_version() -> String {
    nozzle_core::CORE_VERSION.to_string()
}

#[wasm_bindgen]
pub fn assert_compat(peer_version: &str) -> Result<(), JsValue> {
    core_assert_compat(peer_version).map_err(err)
}

#[wasm_bindgen]
pub fn validate_workflow(dag_json: &str) -> Result<(), JsValue> {
    let spec: dag::WorkflowSpec =
        serde_json::from_str(dag_json).map_err(|e| err(e.to_string()))?;
    dag::validate(&spec).map_err(|errs| err(errs.join("; ")))
}

#[derive(serde::Deserialize)]
struct TaskOwned {
    name: String,
    status: states::TaskStatus,
    #[serde(default)]
    output: Option<serde_json::Value>,
}

fn parse_views(tasks_json: &str, edges_json: &str) -> Result<(Vec<TaskOwned>, Vec<dag::Edge>), JsValue> {
    let tasks: Vec<TaskOwned> =
        serde_json::from_str(tasks_json).map_err(|e| err(e.to_string()))?;
    let edges: Vec<dag::Edge> =
        serde_json::from_str(edges_json).map_err(|e| err(e.to_string()))?;
    Ok((tasks, edges))
}

fn as_views(tasks: &[TaskOwned]) -> Vec<readiness::TaskView<'_>> {
    tasks
        .iter()
        .map(|t| readiness::TaskView {
            name: t.name.as_str(),
            status: t.status,
            output: t.output.as_ref(),
        })
        .collect()
}

#[wasm_bindgen]
pub fn next_ready(tasks_json: &str, edges_json: &str) -> Result<String, JsValue> {
    let (tasks, edges) = parse_views(tasks_json, edges_json)?;
    let views = as_views(&tasks);
    serde_json::to_string(&readiness::next_ready(&views, &edges)).map_err(|e| err(e.to_string()))
}

#[wasm_bindgen]
pub fn task_readiness(name: &str, tasks_json: &str, edges_json: &str) -> Result<String, JsValue> {
    let (tasks, edges) = parse_views(tasks_json, edges_json)?;
    let views = as_views(&tasks);
    Ok(match readiness::readiness(name, &views, &edges) {
        readiness::Readiness::Ready => "ready",
        readiness::Readiness::Waiting => "waiting",
        readiness::Readiness::Blocked => "blocked",
        readiness::Readiness::ShouldSkip => "should_skip",
    }
    .to_string())
}

#[wasm_bindgen]
pub fn classify_output(size_bytes: u64, policy: &str, inline_threshold: u64) -> Result<String, JsValue> {
    let policy: refs::PlacementPolicy =
        serde_json::from_value(serde_json::Value::String(policy.into()))
            .map_err(|e| err(e.to_string()))?;
    match xcom::classify(size_bytes, policy, inline_threshold) {
        Ok(xcom::Classification::Inline) => Ok("inline".to_string()),
        Ok(xcom::Classification::Blob) => Ok("blob".to_string()),
        Err(e) => Err(err(e.to_string())),
    }
}

#[wasm_bindgen]
pub fn content_hash(data: &[u8]) -> String {
    xcom::content_hash(data)
}

#[wasm_bindgen]
pub fn defaults() -> String {
    serde_json::to_string(&config::Defaults::default()).unwrap_or_else(|_| "{}".to_string())
}
