//! PyO3 bindings: the entire Python SDK talks to the Rust core through here.
//!
//! The surface is intentionally JSON-in/JSON-out so every language binding
//! (and the wasm-bindgen one) shares the same shapes. No logic lives here
//! beyond serialization and error translation.

use nozzle_core::assert_compat as core_assert_compat;
use nozzle_core::{config, dag, readiness, refs, states, xcom};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

fn value_error(msg: String) -> PyErr {
    PyValueError::new_err(msg)
}

#[pyfunction]
fn core_version() -> String {
    nozzle_core::CORE_VERSION.to_string()
}

#[pyfunction]
fn assert_compat(peer_version: &str) -> PyResult<()> {
    core_assert_compat(peer_version).map_err(value_error)
}

#[pyfunction]
fn validate_workflow(dag_json: &str) -> PyResult<()> {
    let spec: dag::WorkflowSpec =
        serde_json::from_str(dag_json).map_err(|e| value_error(e.to_string()))?;
    dag::validate(&spec).map_err(|errs| value_error(errs.join("; ")))
}

fn parse_tasks(tasks_json: &str) -> PyResult<Vec<TaskOwned>> {
    serde_json::from_str(tasks_json).map_err(|e| value_error(e.to_string()))
}

#[derive(serde::Deserialize)]
struct TaskOwned {
    name: String,
    status: states::TaskStatus,
    #[serde(default)]
    output: Option<serde_json::Value>,
}

#[pyfunction]
fn next_ready(tasks_json: &str, edges_json: &str) -> PyResult<String> {
    let tasks: Vec<TaskOwned> = parse_tasks(tasks_json)?;
    let edges: Vec<dag::Edge> =
        serde_json::from_str(edges_json).map_err(|e| value_error(e.to_string()))?;
    let views: Vec<readiness::TaskView<'_>> = tasks
        .iter()
        .map(|t| readiness::TaskView {
            name: t.name.as_str(),
            status: t.status,
            output: t.output.as_ref(),
        })
        .collect();
    let ready = readiness::next_ready(&views, &edges);
    serde_json::to_string(&ready).map_err(|e| value_error(e.to_string()))
}

#[pyfunction]
fn task_readiness(name: &str, tasks_json: &str, edges_json: &str) -> PyResult<String> {
    let tasks: Vec<TaskOwned> = parse_tasks(tasks_json)?;
    let edges: Vec<dag::Edge> =
        serde_json::from_str(edges_json).map_err(|e| value_error(e.to_string()))?;
    let views: Vec<readiness::TaskView<'_>> = tasks
        .iter()
        .map(|t| readiness::TaskView {
            name: t.name.as_str(),
            status: t.status,
            output: t.output.as_ref(),
        })
        .collect();
    let r = readiness::readiness(name, &views, &edges);
    Ok(match r {
        readiness::Readiness::Ready => "ready",
        readiness::Readiness::Waiting => "waiting",
        readiness::Readiness::Blocked => "blocked",
        readiness::Readiness::ShouldSkip => "should_skip",
    }
    .to_string())
}

#[pyfunction]
fn classify_output(size_bytes: u64, policy: &str, inline_threshold: u64) -> PyResult<String> {
    let policy: refs::PlacementPolicy =
        serde_json::from_value(serde_json::Value::String(policy.into()))
            .map_err(|e| value_error(e.to_string()))?;
    match xcom::classify(size_bytes, policy, inline_threshold) {
        Ok(xcom::Classification::Inline) => Ok("inline".to_string()),
        Ok(xcom::Classification::Blob) => Ok("blob".to_string()),
        Err(e) => Err(value_error(e.to_string())),
    }
}

#[pyfunction]
fn content_hash(data: &[u8]) -> String {
    xcom::content_hash(data)
}

#[pyfunction]
fn defaults() -> PyResult<String> {
    serde_json::to_string(&config::Defaults::default())
        .map_err(|e| value_error(e.to_string()))
}

#[pymodule]
fn nozzle_core_ext(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(core_version, m)?)?;
    m.add_function(wrap_pyfunction!(assert_compat, m)?)?;
    m.add_function(wrap_pyfunction!(validate_workflow, m)?)?;
    m.add_function(wrap_pyfunction!(next_ready, m)?)?;
    m.add_function(wrap_pyfunction!(task_readiness, m)?)?;
    m.add_function(wrap_pyfunction!(classify_output, m)?)?;
    m.add_function(wrap_pyfunction!(content_hash, m)?)?;
    m.add_function(wrap_pyfunction!(defaults, m)?)?;
    Ok(())
}
