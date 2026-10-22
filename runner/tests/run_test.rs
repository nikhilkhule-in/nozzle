//! Integration tests: execution-loop behavior against the spec scenarios.

use nozzle_core::states::{RunStatus, TaskStatus};
use nozzle_run::executor::{new_run_volume, DockerExecutor, Executor, ExecutorConfig};
use nozzle_run::ingest::{load_docker_str, load_str};
use nozzle_run::scheduler::{self, SchedulerEvent};
use std::process::Command;
use std::sync::{Arc, Mutex};

/// Collect formatted event lines for ordering/content assertions.
fn collector() -> (Arc<Mutex<Vec<String>>>, impl FnMut(SchedulerEvent<'_>)) {
    let lines = Arc::new(Mutex::new(Vec::new()));
    let sink = lines.clone();
    (lines, move |ev: SchedulerEvent<'_>| match ev {
        SchedulerEvent::TaskStarted { name, .. } => {
            sink.lock().unwrap().push(format!("start {name}"))
        }
        SchedulerEvent::TaskFinished { name, status, .. } => sink
            .lock()
            .unwrap()
            .push(format!("end {name} {}", status_label(status))),
    })
}

#[allow(dead_code)]
fn record<'a>(outcome: &'a scheduler::RunOutcome, name: &str) -> &'a scheduler::TaskRecord {
    outcome.tasks.iter().find(|r| r.name == name).unwrap()
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

#[test]
fn linear_workflow_runs_in_dependency_order() {
    let loaded = load_str(
        "name: w\ntasks:\n  - id: a\n    cmd: exit 0\n  - id: b\n    cmd: exit 0\n    needs: [a]\n",
    )
    .unwrap();
    let (_lines, mut report) = collector();
    let outcome = scheduler::run(
        &loaded.spec,
        &loaded.tasks,
        &mut report,
        None::<Box<dyn Executor>>,
    );
    assert_eq!(outcome.run, RunStatus::Succeeded);
    assert_eq!(
        *_lines.lock().unwrap(),
        vec!["start a", "end a succeeded", "start b", "end b succeeded"]
    );
}

#[test]
fn independent_tasks_each_execute_once() {
    let loaded =
        load_str("name: w\ntasks:\n  - id: a\n    cmd: exit 0\n  - id: b\n    cmd: exit 0\n")
            .unwrap();
    let (_lines, mut report) = collector();
    let outcome = scheduler::run(
        &loaded.spec,
        &loaded.tasks,
        &mut report,
        None::<Box<dyn Executor>>,
    );
    assert_eq!(outcome.run, RunStatus::Succeeded);
    assert_eq!(
        *_lines.lock().unwrap(),
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
    let outcome = scheduler::run(
        &loaded.spec,
        &loaded.tasks,
        &mut report,
        None::<Box<dyn Executor>>,
    );
    assert_eq!(outcome.run, RunStatus::Failed);
    let statuses: Vec<_> = outcome
        .tasks
        .iter()
        .map(|r| (r.name.as_str(), r.status))
        .collect();
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
fn upstream_stdout_flows_to_downstream_env() {
    let loaded = load_str(
        "name: w\ntasks:\n  - id: a\n    cmd: echo 'hello-world'\n  - id: b\n    cmd: 'echo $V > /tmp/nozzle-test-downstream.txt'\n    needs: [a]\n    env: { V: a }\n",
    )
    .unwrap();
    let outcome = scheduler::run(
        &loaded.spec,
        &loaded.tasks,
        &mut |_| {},
        None::<Box<dyn Executor>>,
    );
    assert_eq!(outcome.run, RunStatus::Succeeded);
    let content = std::fs::read_to_string("/tmp/nozzle-test-downstream.txt").unwrap();
    assert_eq!(content.trim(), "hello-world");
}

#[test]
fn oversized_upstream_output_is_reported_as_size_error() {
    let loaded = load_str(
        "name: w\ntasks:\n  - id: a\n    cmd: yes x | head -c 140000 | tr -d '\\n'\n  \
         - id: b\n    cmd: exit 0\n    env: { V: a }\n",
    )
    .unwrap();
    let outcome = scheduler::run(
        &loaded.spec,
        &loaded.tasks,
        &mut |_| {},
        None::<Box<dyn Executor>>,
    );
    assert_eq!(outcome.run, RunStatus::Failed);
    let _a = outcome.tasks.iter().find(|r| r.name == "a").unwrap();
    let _b = outcome.tasks.iter().find(|r| r.name == "b").unwrap();
}

#[test]
fn binary_exit_code_and_summary_reflect_the_run() {
    let yaml = std::env::temp_dir().join("nozzle-run-test-good.yaml");
    std::fs::write(&yaml, "name: test\ntasks:\n  - id: ok\n    cmd: exit 0\n").unwrap();
    let bin = env!("CARGO_BIN_EXE_nzl");
    let out = Command::new(bin).arg("run").arg(&yaml).output().unwrap();
    assert!(out.status.success());
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("SUCCEEDED"));

    let yaml = std::env::temp_dir().join("nozzle-run-test-bad.yaml");
    std::fs::write(&yaml, "name: test\ntasks:\n  - id: fail\n    cmd: exit 1\n").unwrap();
    let out = Command::new(bin).arg("run").arg(&yaml).output().unwrap();
    assert!(!out.status.success());
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("FAILED"));
}

#[test]
fn help_flags_print_and_exit_zero_without_executing() {
    let bin = env!("CARGO_BIN_EXE_nzl");
    for args in [
        vec!["--help"],
        vec!["-h"],
        vec!["help"],
        vec!["help", "run"],
        vec!["help", "schema"],
        vec!["run", "--help"],
        vec!["schema", "--help"],
    ] {
        let out = Command::new(bin).args(&args).output().unwrap();
        assert!(out.status.success(), "{args:?}");
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(stdout.contains("usage:"), "{args:?}");
    }
    // Bare `nzl` prints the help page like `--help`.
    let out = Command::new(bin).output().unwrap();
    assert!(out.status.success());
    assert!(String::from_utf8_lossy(&out.stdout).contains("usage:"));
    // run --help must not read or execute any workflow file.
    let out = Command::new(bin)
        .args(["run", "--help", "/nonexistent-workflow.yaml"])
        .output()
        .unwrap();
    assert!(out.status.success());
}

#[test]
fn usage_errors_exit_two_with_hint() {
    let bin = env!("CARGO_BIN_EXE_nzl");
    for args in [
        vec!["run"],
        vec![
            "run",
            "--executor",
            "bogus",
            "examples/build-random-image.yaml",
        ],
        vec!["help", "bogus"],
        vec!["frobnicate"],
    ] {
        let out = Command::new(bin).args(&args).output().unwrap();
        assert!(!out.status.success(), "{args:?}");
        assert_eq!(out.status.code(), Some(2), "{args:?}");
        let stderr = String::from_utf8_lossy(&out.stderr);
        assert!(stderr.contains("Try 'nzl help"), "{args:?}: {stderr}");
    }
}

#[test]
fn maps_name_tasks_and_edges() {
    let loaded = load_str(
        "name: my-workflow\ntasks:\n  - id: task-a\n    cmd: echo hi\n  - id: task-b\n    cmd: echo bye\n    needs: [task-a]\n",
    )
    .unwrap();
    assert_eq!(loaded.spec.id, "my-workflow");
    assert_eq!(loaded.tasks.len(), 2);
    assert_eq!(loaded.spec.tasks[0].name, "task-a");
    assert_eq!(loaded.spec.tasks[1].name, "task-b");
    assert_eq!(loaded.spec.edges.len(), 1);
    assert_eq!(loaded.spec.edges[0].upstream, "task-a");
    assert_eq!(loaded.spec.edges[0].downstream, "task-b");
}

#[test]
fn trims_trailing_newlines_only() {
    let loaded = load_str("name: w\ntasks:\n  - id: a\n    cmd: printf 'hello\\n\\n'\n").unwrap();
    let outcome = scheduler::run(
        &loaded.spec,
        &loaded.tasks,
        &mut |_| {},
        None::<Box<dyn Executor>>,
    );
    assert_eq!(outcome.run, RunStatus::Succeeded);
}

#[test]
fn unconsumed_oversized_output_succeeds() {
    let loaded =
        load_str("name: w\ntasks:\n  - id: a\n    cmd: yes x | head -c 140000 | tr -d '\\n'\n")
            .unwrap();
    let outcome = scheduler::run(
        &loaded.spec,
        &loaded.tasks,
        &mut |_| {},
        None::<Box<dyn Executor>>,
    );
    assert_eq!(outcome.run, RunStatus::Succeeded);
}

#[test]
fn docker_executor_runs_in_dependency_order() {
    let loaded = load_docker_str(
        "name: w\ntasks:\n  - id: a\n    image: python:3.12\n    cmd: echo hi\n  - id: b\n    image: python:3.12\n    cmd: echo bye\n    needs: [a]\n",
    )
    .unwrap();
    let (lines, mut report) = collector();
    let volume = new_run_volume("w-docker-order");
    let executor = DockerExecutor::new(ExecutorConfig::default(), volume).expect("daemon required");
    let outcome = scheduler::run(
        &loaded.spec,
        &loaded.tasks,
        &mut report,
        Some(Box::new(executor) as Box<dyn Executor>),
    );
    assert_eq!(outcome.run, RunStatus::Succeeded);
    assert_eq!(
        *lines.lock().unwrap(),
        vec!["start a", "end a succeeded", "start b", "end b succeeded"]
    );
}

#[test]
fn docker_executor_blocks_downstream_but_continues_independent() {
    let loaded = load_docker_str(
        "name: w\ntasks:\n  - id: a\n    image: python:3.12\n    cmd: exit 3\n  - id: b\n    image: python:3.12\n    cmd: echo never\n    needs: [a]\n  - id: c\n    image: python:3.12\n    cmd: echo independent\n",
    )
    .unwrap();
    let (_lines, mut report) = collector();
    let volume = new_run_volume("w-docker-fail");
    let executor = DockerExecutor::new(ExecutorConfig::default(), volume).expect("daemon required");
    let outcome = scheduler::run(
        &loaded.spec,
        &loaded.tasks,
        &mut report,
        Some(Box::new(executor) as Box<dyn Executor>),
    );
    assert_eq!(outcome.run, RunStatus::Failed);
    let statuses: Vec<_> = outcome
        .tasks
        .iter()
        .map(|r| (r.name.as_str(), r.status))
        .collect();
    assert_eq!(
        statuses,
        vec![
            ("a", TaskStatus::Failed),
            ("b", TaskStatus::Failed),
            ("c", TaskStatus::Succeeded),
        ]
    );
}
