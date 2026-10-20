//! Scheduler: the readiness loop over core scheduling, plus the Executor
//! abstraction for task execution.

use crate::executor::{Executor, ExecutionResult, LocalExecutor};
use crate::ingest::{TaskDef, ORDER_ARG};
use nozzle_core::dag::WorkflowSpec;
use nozzle_core::refs::PlacementPolicy;
use nozzle_core::readiness::{next_ready, TaskView};
use nozzle_core::states::{RunStatus, TaskStatus};
use nozzle_core::xcom::{self, Classification};
use std::collections::BTreeMap;
use std::time::{Duration, Instant};

/// Live progress for the console reporter.
pub enum SchedulerEvent<'a> {
    TaskStarted { name: &'a str, cmd: &'a str },
    TaskFinished { name: &'a str, status: TaskStatus, elapsed: Option<Duration>, note: Option<&'a str> },
}

pub struct TaskRecord {
    pub name: String,
    pub status: TaskStatus,
    pub elapsed: Option<Duration>,
    pub note: Option<String>,
}

pub struct RunOutcome {
    pub workflow: String,
    pub run: RunStatus,
    /// Every task, in definition order.
    pub tasks: Vec<TaskRecord>,
}

/// Execute the workflow sequentially using the provided executor.
///
/// If `executor` is `None`, a default `LocalExecutor` is used (backward-
/// compatible behaviour: local `sh -c` subprocesses with inherited stderr).
pub fn run(
    spec: &WorkflowSpec,
    tasks: &BTreeMap<String, TaskDef>,
    on_event: &mut dyn FnMut(SchedulerEvent<'_>),
    executor: Option<Box<dyn Executor>>,
) -> RunOutcome {
    let executor = executor.unwrap_or_else(|| Box::new(LocalExecutor::default()));
    let threshold = executor.config().inline_threshold_bytes;

    let mut status: BTreeMap<String, TaskStatus> =
        spec.tasks.iter().map(|t| (t.name.clone(), TaskStatus::Queued)).collect();
    let mut outputs: BTreeMap<String, String> = BTreeMap::new();
    let mut elapsed: BTreeMap<String, Duration> = BTreeMap::new();
    let mut notes: BTreeMap<String, String> = BTreeMap::new();

    loop {
        let views: Vec<TaskView<'_>> = spec
            .tasks
            .iter()
            .map(|t| TaskView { name: &t.name, status: status[t.name.as_str()], output: None })
            .collect();
        let ready = next_ready(&views, &spec.edges);
        match ready.first() {
            Some(name) => {
                let name: &str = name.as_str();
                let def = match tasks.get(name) {
                    Some(def) => def,
                    None => {
                        status.insert(name.to_string(), TaskStatus::Failed);
                        notes.insert(name.to_string(), "internal error: no task definition".into());
                        continue;
                    }
                };
                on_event(SchedulerEvent::TaskStarted { name, cmd: &def.cmd });
                let started = Instant::now();
                let attempt: ExecutionResult = match executor.execute(def, spec, name, &outputs) {
                    Ok(captured) => {
                        let consumes_output =
                            spec.edges.iter().any(|e| e.upstream == name && e.arg != ORDER_ARG);
                        if !consumes_output {
                            Ok(captured)
                        } else {
                            match xcom::classify(
                                captured.len() as u64,
                                PlacementPolicy::Auto,
                                threshold,
                            ) {
                                Ok(Classification::Inline) => Ok(captured),
                                Ok(Classification::Blob) => {
                                    Err(placement_error(captured.len(), threshold))
                                }
                                Err(e) => Err(e.to_string()),
                            }
                        }
                    }
                    Err(note) => Err(note),
                };
                let (final_status, note) = match attempt {
                    Ok(value) => {
                        outputs.insert(name.to_string(), value);
                        (TaskStatus::Succeeded, None)
                    }
                    Err(note) => (TaskStatus::Failed, Some(note)),
                };
                let took = started.elapsed();
                elapsed.insert(name.to_string(), took);
                if let Some(note) = &note {
                    notes.insert(name.to_string(), note.clone());
                }
                status.insert(name.to_string(), final_status);
                on_event(SchedulerEvent::TaskFinished {
                    name,
                    status: final_status,
                    elapsed: Some(took),
                    note: note.as_deref(),
                });
            }
            None => {
                // No ready work: either everything is terminal, or every
                // remaining queued task is blocked behind a failure.
                let stuck: Vec<String> = status
                    .iter()
                    .filter(|(_, s)| **s == TaskStatus::Queued)
                    .map(|(n, _)| n.to_string())
                    .collect();
                if stuck.is_empty() {
                    break;
                }
                for name in stuck {
                    status.insert(name.clone(), TaskStatus::Failed);
                    notes
                        .entry(name.clone())
                        .or_insert_with(|| "blocked by upstream failure".to_string());
                    on_event(SchedulerEvent::TaskFinished {
                        name: name.as_str(),
                        status: TaskStatus::Failed,
                        elapsed: None,
                        note: Some("blocked by upstream failure"),
                    });
                }
            }
        }
    }

    let records: Vec<TaskRecord> = spec
        .tasks
        .iter()
        .map(|t| TaskRecord {
            name: t.name.clone(),
            status: status[t.name.as_str()],
            elapsed: elapsed.get(&t.name).cloned(),
            note: notes.get(&t.name).cloned(),
        })
        .collect();
    let run_status = if records.iter().all(|r| r.status == TaskStatus::Succeeded) {
        RunStatus::Succeeded
    } else {
        RunStatus::Failed
    };
    RunOutcome { workflow: spec.id.clone(), run: run_status, tasks: records }
}

fn placement_error(size: usize, threshold: u64) -> String {
    xcom::classify(size as u64, PlacementPolicy::InlineOnly, threshold)
        .expect_err("size at or above threshold must overflow")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest::load_str;

    fn quiet(_: SchedulerEvent<'_>) {}

    #[test]
    fn linear_workflow_runs_in_dependency_order() {
        let loaded = load_str(
            "name: w\ntasks:\n  - id: a\n    cmd: exit 0\n  - id: b\n    cmd: exit 0\n    needs: [a]\n",
        )
        .unwrap();
        let (lines, mut report) = collector();
        let outcome = run(&loaded.spec, &loaded.tasks, &mut report, None::<Box<dyn Executor>>);
        assert_eq!(outcome.run, RunStatus::Succeeded);
        assert_eq!(
            *lines.lock().unwrap(),
            vec!["start a", "end a succeeded", "start b", "end b succeeded"]
        );
    }

    #[test]
    fn independent_tasks_each_execute_once() {
        let loaded = load_str(
            "name: w\ntasks:\n  - id: a\n    cmd: exit 0\n  - id: b\n    cmd: exit 0\n",
        )
        .unwrap();
        let (lines, mut report) = collector();
        let outcome = run(&loaded.spec, &loaded.tasks, &mut report, None::<Box<dyn Executor>>);
        assert_eq!(outcome.run, RunStatus::Succeeded);
        assert_eq!(
            *lines.lock().unwrap(),
            vec!["start a", "end a succeeded", "start b", "end b succeeded"]
        );
    }

    #[test]
    fn failure_blocks_downstream_but_independent_branches_continue() {
        let loaded = load_str(
            "name: w\ntasks:\n  - id: a\n    cmd: exit 3\n  - id: b\n    cmd: exit 0\n    needs: [a]\n  - id: c\n    cmd: exit 0\n",
        )
        .unwrap();
        let (_lines, mut report) = collector();
        let outcome = run(&loaded.spec, &loaded.tasks, &mut report, None::<Box<dyn Executor>>);
        assert_eq!(outcome.run, RunStatus::Failed);
        let statuses: Vec<_> = outcome.tasks.iter().map(|r| (r.name.as_str(), r.status)).collect();
        assert_eq!(
            statuses,
            vec![
                ("a", TaskStatus::Failed),
                ("b", TaskStatus::Failed),
                ("c", TaskStatus::Succeeded),
            ]
        );
    }

    #[test]
    fn oversized_upstream_output_is_reported_as_size_error() {
        let loaded = load_str(
            "name: w\ntasks:\n  - id: a\n    cmd: yes x | head -c 140000 | tr -d '\\n'\n  \
             - id: b\n    cmd: exit 0\n    env: { V: a }\n",
        )
        .unwrap();
        let outcome = run(&loaded.spec, &loaded.tasks, &mut quiet, None::<Box<dyn Executor>>);
        assert_eq!(outcome.run, RunStatus::Failed);
        let a = outcome.tasks.iter().find(|r| r.name == "a").unwrap();
        assert_eq!(a.status, TaskStatus::Failed);
        assert!(a.note.as_deref().unwrap().contains("exceeds"), "{:?}", a.note);
        let b = outcome.tasks.iter().find(|r| r.name == "b").unwrap();
        assert_eq!(b.status, TaskStatus::Failed);
        assert_eq!(b.note.as_deref(), Some("blocked by upstream failure"));
    }

    use std::sync::{Arc, Mutex};

    fn collector() -> (Arc<Mutex<Vec<String>>>, impl FnMut(SchedulerEvent<'_>)) {
        let lines = Arc::new(Mutex::new(Vec::new()));
        let sink = lines.clone();
        (
            lines,
            move |ev: SchedulerEvent<'_>| match ev {
                SchedulerEvent::TaskStarted { name, .. } => sink.lock().unwrap().push(format!("start {name}")),
                SchedulerEvent::TaskFinished { name, status, .. } => {
                    sink.lock().unwrap().push(format!("end {name} {}", status_label(status)))
                }
            },
        )
    }

    fn status_label(status: TaskStatus) -> &'static str {
        match status {
            TaskStatus::Queued => "queued",
            TaskStatus::Running => "running",
            TaskStatus::Succeeded => "succeeded",
            TaskStatus::Failed => "failed",
            TaskStatus::Skipped => "skipped",
        }
    }
}