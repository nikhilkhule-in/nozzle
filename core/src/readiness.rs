//! Readiness: which queued tasks may be claimed next.
//!
//! A task is claimable only when every incoming edge is satisfied. Edges from
//! succeeded predecessors with matching (or absent) predicates supply inputs;
//! edges from skipped predecessors, or succeeded predecessors whose predicate
//! mismatches, supply nothing. Failed predecessors block forever.

use crate::dag::{evaluate_predicate, Edge};
use crate::states::TaskStatus;
use std::collections::HashMap;

/// Observable task state the orchestrator feeds into readiness. `output` is
/// the materialized upstream value (inline or fetched) used for predicate
/// evaluation; required when the task is succeeded and downstream edges carry
/// predicates.
#[derive(Debug, Clone)]
pub struct TaskView<'a> {
    pub name: &'a str,
    pub status: TaskStatus,
    pub output: Option<&'a serde_json::Value>,
}

/// Readiness of a single queued task.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Readiness {
    /// All edges satisfied with at least one input-supplying edge: claimable.
    Ready,
    /// Some predecessor is not terminal yet: check again later.
    Waiting,
    /// A predecessor failed: never claimable unless retried upstream.
    Blocked,
    /// All predecessors terminal but no edge supplies inputs: mark skipped.
    ShouldSkip,
}

/// Compute readiness for one task.
pub fn readiness(task: &str, tasks: &[TaskView<'_>], edges: &[Edge]) -> Readiness {
    let by_name: HashMap<&str, &TaskView<'_>> =
        tasks.iter().map(|t| (t.name, t)).collect();
    let mut satisfied = false;
    for e in edges.iter().filter(|e| e.downstream == task) {
        let up = match by_name.get(e.upstream.as_str()) {
            Some(t) => t,
            None => return Readiness::Waiting,
        };
        match up.status {
            TaskStatus::Succeeded => {
                let matched = match &e.predicate {
                    None => true,
                    Some(p) => match up.output {
                        Some(v) => evaluate_predicate(v, p),
                        None => return Readiness::Waiting,
                    },
                };
                if matched {
                    satisfied = true;
                }
            }
            TaskStatus::Skipped => {}
            TaskStatus::Failed => return Readiness::Blocked,
            TaskStatus::Queued | TaskStatus::Running => return Readiness::Waiting,
        }
    }
    if satisfied {
        Readiness::Ready
    } else {
        Readiness::ShouldSkip
    }
}

/// Names of all queued tasks currently ready to claim, in definition order.
/// Tasks with no incoming edges are always ready.
pub fn next_ready(tasks: &[TaskView<'_>], edges: &[Edge]) -> Vec<String> {
    tasks
        .iter()
        .filter(|t| t.status == TaskStatus::Queued)
        .filter(|t| {
            let has_incoming = edges.iter().any(|e| e.downstream == t.name);
            !has_incoming || readiness(t.name, tasks, edges) == Readiness::Ready
        })
        .map(|t| t.name.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dag::{Predicate, PredicateOp};
    use serde_json::json;

    fn view<'a>(name: &'a str, status: TaskStatus, output: Option<&'a serde_json::Value>) -> TaskView<'a> {
        TaskView { name, status, output }
    }

    fn edge(up: &str, down: &str, pred: Option<Predicate>) -> Edge {
        Edge { upstream: up.into(), downstream: down.into(), arg: "x".into(), predicate: pred }
    }

    fn eq(v: serde_json::Value) -> Predicate {
        Predicate { op: PredicateOp::Equals, value: v }
    }

    #[test]
    fn linear_chain_unblocks_in_order() {
        let a_out = json!(1);
        let tasks = vec![
            view("a", TaskStatus::Succeeded, Some(&a_out)),
            view("b", TaskStatus::Queued, None),
        ];
        let edges = vec![edge("a", "b", None)];
        assert_eq!(next_ready(&tasks, &edges), vec!["b"]);
    }

    #[test]
    fn pending_predecessor_blocks() {
        let tasks = vec![
            view("a", TaskStatus::Running, None),
            view("b", TaskStatus::Queued, None),
        ];
        let edges = vec![edge("a", "b", None)];
        assert!(next_ready(&tasks, &edges).is_empty());
        assert_eq!(readiness("b", &tasks, &edges), Readiness::Waiting);
    }

    #[test]
    fn failed_predecessor_blocks_downstream() {
        let tasks = vec![
            view("a", TaskStatus::Failed, None),
            view("b", TaskStatus::Queued, None),
        ];
        let edges = vec![edge("a", "b", None)];
        assert_eq!(readiness("b", &tasks, &edges), Readiness::Blocked);
    }

    #[test]
    fn predicate_match_readies_mismatch_skips() {
        let t = json!(true);
        let f = json!(false);
        fn mk(out: &serde_json::Value) -> Vec<TaskView<'_>> {
            vec![
                view("t0", TaskStatus::Succeeded, Some(out)),
                view("t_yes", TaskStatus::Queued, None),
                view("t_no", TaskStatus::Queued, None),
            ]
        }
        let edges = vec![
            edge("t0", "t_yes", Some(eq(json!(true)))),
            edge("t0", "t_no", Some(eq(json!(false)))),
        ];
        assert_eq!(next_ready(&mk(&t), &edges), vec!["t_yes"]);
        assert_eq!(readiness("t_no", &mk(&t), &edges), Readiness::ShouldSkip);
        assert_eq!(next_ready(&mk(&f), &edges), vec!["t_no"]);
    }

    #[test]
    fn join_runs_when_one_path_supplies_inputs() {
        let t = json!(true);
        let tasks = vec![
            view("t0", TaskStatus::Succeeded, Some(&t)),
            view("fast", TaskStatus::Succeeded, Some(&t)),
            view("slow", TaskStatus::Skipped, None),
            view("join", TaskStatus::Queued, None),
        ];
        let edges = vec![edge("fast", "join", None), edge("slow", "join", None)];
        assert_eq!(readiness("join", &tasks, &edges), Readiness::Ready);
    }

    #[test]
    fn join_skips_when_all_paths_skipped() {
        let tasks = vec![
            view("a", TaskStatus::Skipped, None),
            view("b", TaskStatus::Skipped, None),
            view("join", TaskStatus::Queued, None),
        ];
        let edges = vec![edge("a", "join", None), edge("b", "join", None)];
        assert_eq!(readiness("join", &tasks, &edges), Readiness::ShouldSkip);
    }

    #[test]
    fn entry_tasks_are_always_ready() {
        let tasks = vec![view("a", TaskStatus::Queued, None)];
        assert_eq!(next_ready(&tasks, &[]), vec!["a"]);
    }
}
