//! `nzl` (package `nozzle-run`): execute a YAML-defined workflow on this
//! machine.
//!
//! All I/O lives here; scheduling decisions come from `nozzle-core`.

use nozzle_core::states::{RunStatus, TaskStatus};
use nozzle_run::ingest;
use nozzle_run::scheduler::{self, SchedulerEvent};
use nozzle_run::executor::Executor;
use std::process::ExitCode;

const USAGE: &str = "usage: nzl run <workflow.yaml>\n       nzl schema";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.as_slice() {
        [cmd, path] if cmd == "run" => ExitCode::from(run_file(path)),
        [only] if only == "schema" => emit_schema(),
        _ => {
            eprintln!("{USAGE}");
            ExitCode::from(2)
        }
    }
}

/// Print the JSON Schema for workflow files, generated from the same types
/// the loader parses with.
fn emit_schema() -> ExitCode {
    let schema = schemars::schema_for!(nozzle_run::model::WorkflowYaml);
    match serde_json::to_string_pretty(&schema) {
        Ok(text) => {
            println!("{text}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::FAILURE
        }
    }
}

/// 0 = run succeeded, 1 = run failed, 2 = could not run (usage, unreadable
/// file, invalid workflow).
fn run_file(path: &str) -> u8 {
    let loaded = match ingest::load_file(path) {
        Ok(loaded) => loaded,
        Err(problems) => {
            for p in &problems {
                eprintln!("error: {p}");
            }
            return 2;
        }
    };
    let report = |ev: SchedulerEvent<'_>| match ev {
        SchedulerEvent::TaskStarted { name, cmd } => println!("-> {name}: sh -c '{cmd}'"),
        SchedulerEvent::TaskFinished { name, status, elapsed, note } => {
            let took = elapsed.map(|d| format!(" in {:.1}s", d.as_secs_f64())).unwrap_or_default();
            let why = note.map(|n| format!(" ({n})")).unwrap_or_default();
            println!("<- {name}: {}{took}{why}", status_label(status));
        }
    };
    let outcome = scheduler::run(&loaded.spec, &loaded.tasks, &mut { report }, None::<Box<dyn Executor>>);
    println!("== run '{}' {} ==", outcome.workflow, run_label(outcome.run));
    for r in &outcome.tasks {
        let took = r.elapsed.map(|d| format!(" in {:.1}s", d.as_secs_f64())).unwrap_or_default();
        let why = r.note.as_ref().map(|n| format!(" ({n})")).unwrap_or_default();
        println!("   {}: {}{took}{why}", r.name, status_label(r.status));
    }
    match outcome.run {
        RunStatus::Succeeded => 0,
        _ => 1,
    }
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

fn run_label(run: RunStatus) -> &'static str {
    match run {
        RunStatus::Succeeded => "SUCCEEDED",
        RunStatus::Failed => "FAILED",
        RunStatus::Queued | RunStatus::Running => "INCOMPLETE",
    }
}