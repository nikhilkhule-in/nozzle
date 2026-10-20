//! Ingestion: YAML text -> validated DAG graph + runner task table.
//!
//! The graph (`WorkflowSpec`) is what the core validates and schedules;
//! commands and env bindings live in the runner-side task table keyed by
//! task id. Edge args carry the env variable name for data-flow edges and
//! [`ORDER_ARG`] for ordering-only edges.

use crate::model::WorkflowYaml;
use nozzle_core::dag::{Edge, TaskSpec, WorkflowSpec};
use std::collections::BTreeMap;

/// Arg for ordering-only edges. Data-flow edges carry the env variable name.
pub const ORDER_ARG: &str = "_";

#[derive(Debug, Clone)]
pub struct TaskDef {
    pub cmd: String,
    /// Env variable name -> upstream task id.
    pub env: BTreeMap<String, String>,
}

#[derive(Debug)]
pub struct Loaded {
    pub spec: WorkflowSpec,
    pub tasks: BTreeMap<String, TaskDef>,
}

pub fn load_file(path: &str) -> Result<Loaded, Vec<String>> {
    let text =
        std::fs::read_to_string(path).map_err(|e| vec![format!("cannot read {path}: {e}")])?;
    load_str(&text)
}

pub fn load_str(text: &str) -> Result<Loaded, Vec<String>> {
    let wf: WorkflowYaml =
        serde_yaml::from_str(text).map_err(|e| vec![format!("invalid workflow yaml: {e}")])?;
    load(wf)
}

/// Convert and validate, collecting every problem in one pass: YAML-level
/// problems plus the core's full problem list from `dag::validate`.
pub fn load(wf: WorkflowYaml) -> Result<Loaded, Vec<String>> {
    let mut problems = Vec::new();
    if wf.name.trim().is_empty() {
        problems.push("workflow name must not be empty".to_string());
    }
    if wf.tasks.is_empty() {
        problems.push("workflow declares no tasks".to_string());
    }
    let mut spec_tasks = Vec::new();
    let mut table = BTreeMap::new();
    for t in &wf.tasks {
        if t.id.trim().is_empty() {
            problems.push(format!("task id must not be empty (cmd {:?})", t.cmd));
        }
        if t.cmd.trim().is_empty() {
            problems.push(format!("task {} declares an empty cmd", t.id));
        }
        spec_tasks.push(TaskSpec { name: t.id.clone(), runtime: "shell".to_string() });
        table.insert(t.id.clone(), TaskDef { cmd: t.cmd.clone(), env: t.env.clone() });
    }
    let mut edges = Vec::new();
    for t in &wf.tasks {
        for up in &t.needs {
            edges.push(Edge {
                upstream: up.clone(),
                downstream: t.id.clone(),
                arg: ORDER_ARG.to_string(),
                predicate: None,
            });
        }
        for (var, up) in &t.env {
            edges.push(Edge {
                upstream: up.clone(),
                downstream: t.id.clone(),
                arg: var.clone(),
                predicate: None,
            });
        }
    }
    let spec = WorkflowSpec {
        id: wf.name,
        language: "shell".to_string(),
        tasks: spec_tasks,
        edges,
    };
    if let Err(core_errors) = nozzle_core::dag::validate(&spec) {
        problems.extend(core_errors);
    }
    if problems.is_empty() {
        Ok(Loaded { spec, tasks: table })
    } else {
        Err(problems)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn problems(text: &str) -> Vec<String> {
        load_str(text).unwrap_err()
    }

    #[test]
    fn maps_name_tasks_and_edges() {
        let loaded = load_str(
            r#"
name: build
tasks:
  - id: a
    cmd: echo a
  - id: b
    cmd: echo b
    needs: [a]
    env: { TAG: a }
"#,
        )
        .unwrap();
        assert_eq!(loaded.spec.id, "build");
        assert_eq!(loaded.spec.language, "shell");
        let names: Vec<&str> = loaded.spec.tasks.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(names, vec!["a", "b"]);
        assert!(loaded.spec.tasks.iter().all(|t| t.runtime == "shell"));
        let ordering: Vec<&Edge> = loaded
            .spec
            .edges
            .iter()
            .filter(|e| e.arg == ORDER_ARG)
            .collect();
        assert_eq!(ordering.len(), 1);
        assert_eq!(ordering[0].upstream, "a");
        assert_eq!(ordering[0].downstream, "b");
        let flow: Vec<&Edge> = loaded
            .spec
            .edges
            .iter()
            .filter(|e| e.arg == "TAG")
            .collect();
        assert_eq!(flow.len(), 1);
        assert_eq!(flow[0].upstream, "a");
        assert_eq!(loaded.tasks["a"].cmd, "echo a");
        assert_eq!(loaded.tasks["b"].env.get("TAG").map(String::as_str), Some("a"));
    }

    #[test]
    fn unknown_dependency_is_reported() {
        let errs = problems("name: w\ntasks:\n  - id: a\n    cmd: exit 0\n    needs: [ghost]\n");
        assert!(errs.iter().any(|e| e.contains("unknown upstream")), "{errs:?}");
    }

    #[test]
    fn env_binding_unknown_upstream_is_reported() {
        let errs = problems("name: w\ntasks:\n  - id: a\n    cmd: exit 0\n    env: { V: ghost }\n");
        assert!(errs.iter().any(|e| e.contains("unknown upstream")), "{errs:?}");
    }

    #[test]
    fn cycle_is_reported() {
        let errs = problems(
            "name: w\ntasks:\n  - id: a\n    cmd: exit 0\n    needs: [b]\n  \
             - id: b\n    cmd: exit 0\n    needs: [a]\n",
        );
        assert!(errs.iter().any(|e| e.contains("cycle")), "{errs:?}");
    }

    #[test]
    fn duplicate_ids_are_reported() {
        let errs = problems("name: w\ntasks:\n  - id: a\n    cmd: exit 0\n  - id: a\n    cmd: exit 0\n");
        assert!(errs.iter().any(|e| e.contains("duplicate")), "{errs:?}");
    }

    #[test]
    fn empty_fields_are_reported() {
        let errs = problems("name: \"\"\ntasks:\n  - id: a\n    cmd: \"\"\n");
        assert!(errs.iter().any(|e| e.contains("name must not be empty")), "{errs:?}");
        assert!(errs.iter().any(|e| e.contains("empty cmd")), "{errs:?}");
    }

    #[test]
    fn taskless_workflow_is_reported() {
        let errs = problems("name: w\ntasks: []\n");
        assert!(errs.iter().any(|e| e.contains("no tasks")), "{errs:?}");
    }
}
