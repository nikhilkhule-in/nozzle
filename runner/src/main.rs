//! `nzl` (package `nozzle-run`): execute a YAML-defined workflow on this
//! machine.
//!
//! All I/O lives here; scheduling decisions come from `nozzle-core`.

use nozzle_core::states::{RunStatus, TaskStatus};
use nozzle_run::executor::{DockerExecutor, Executor, ExecutorConfig};
use nozzle_run::ingest;
use nozzle_run::scheduler::{self, SchedulerEvent};
use std::process::ExitCode;

const USAGE: &str = "usage: nzl [--help] <subcommand> [args]\n       nzl run [--executor local|docker] <workflow.yaml>\n       nzl schema";

const GLOBAL_HELP: &str = "\
nzl - workflows-as-code scheduling engine

usage: nzl [--help] <subcommand> [args]

Subcommands:
  run       Load, validate, and execute a workflow
  schema    Print the workflow JSON Schema to stdout
  help      Show help (nzl help [subcommand])

Global flags:
  -h, --help    Show this help (exit 0)

Try 'nzl help <subcommand>' for subcommand details.";

const RUN_HELP: &str = "\
nzl run - execute a workflow

usage: nzl run [--executor local|docker] <workflow.yaml>
       nzl run [--executor=<local|docker>] <workflow.yaml>
       nzl run --help

Local args:
  <workflow.yaml>           Path to a .yaml/.yml/.json workflow file (required)
  --executor local|docker   Execution backend (default: local)
  --executor=<local|docker> Same, equals form
  -h, --help                Show this help (exit 0, runs nothing)

Executors:
  local    sh -c '<cmd>' on the host (image ignored)
  docker   one 'docker run --rm' container per task (image required per task)

Exit codes:
  0  every task succeeded
  1  run executed but ended FAILED
  2  usage error, unreadable file, invalid workflow, or unreachable daemon

Examples:
  nzl run workflow.yaml
  nzl run --executor docker examples/release.yaml";

const SCHEMA_HELP: &str = "\
nzl schema - print the workflow JSON Schema

usage: nzl schema
       nzl schema --help

No arguments. Prints the JSON Schema (draft 2020-12) generated from the
loader types to stdout. Exit 0 on success.";

fn print_help_and_exit(text: &str) -> ExitCode {
    println!("{text}");
    ExitCode::SUCCESS
}

fn print_usage_error_and_exit(hint: &str) -> ExitCode {
    eprintln!("{USAGE}");
    eprintln!("{hint}");
    ExitCode::from(2)
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    // Global help first: nzl --help | -h (anywhere in first position),
    // nzl help [subcommand].
    if let Some(first) = args.first() {
        if first == "--help" || first == "-h" {
            return print_help_and_exit(GLOBAL_HELP);
        }
        if first == "help" {
            match args.get(1).map(String::as_str) {
                None => return print_help_and_exit(GLOBAL_HELP),
                Some("run") => return print_help_and_exit(RUN_HELP),
                Some("schema") => return print_help_and_exit(SCHEMA_HELP),
                Some(other) => {
                    eprintln!("error: unknown help topic '{other}' (expected run|schema)");
                    eprintln!("Try 'nzl help' for the topic list.");
                    return ExitCode::from(2);
                }
            }
        }
    }
    match args.as_slice() {
        [cmd, rest @ ..] if cmd == "run" => {
            if rest.iter().any(|a| a == "--help" || a == "-h") {
                return print_help_and_exit(RUN_HELP);
            }
            match rest {
                [path] => ExitCode::from(run_file(path, "local")),
                [flag, value, path] if flag == "--executor" => {
                    if value != "local" && value != "docker" {
                        eprintln!("error: unknown executor '{value}' (expected local|docker)");
                        eprintln!("Try 'nzl help run' for usage.");
                        return ExitCode::from(2);
                    }
                    ExitCode::from(run_file(path, value))
                }
                [flag_eq, path] if flag_eq.starts_with("--executor=") => {
                    let value = flag_eq.trim_start_matches("--executor=").to_string();
                    if value != "local" && value != "docker" {
                        eprintln!("error: unknown executor '{value}' (expected local|docker)");
                        eprintln!("Try 'nzl help run' for usage.");
                        return ExitCode::from(2);
                    }
                    ExitCode::from(run_file(path, &value))
                }
                _ => print_usage_error_and_exit("Try 'nzl help run' for usage."),
            }
        }
        [cmd, rest @ ..] if cmd == "schema" => {
            if rest.iter().any(|a| a == "--help" || a == "-h") {
                return print_help_and_exit(SCHEMA_HELP);
            }
            match rest {
                [] => emit_schema(),
                _ => print_usage_error_and_exit("Try 'nzl help schema' for usage."),
            }
        }
        _ => print_usage_error_and_exit("Try 'nzl help' for the subcommand list."),
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
/// file, invalid workflow, unreachable daemon).
fn run_file(path: &str, executor_kind: &str) -> u8 {
    if executor_kind == "docker" {
        return run_file_docker(path);
    }
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
        SchedulerEvent::TaskFinished {
            name,
            status,
            elapsed,
            note,
        } => {
            let took = elapsed
                .map(|d| format!(" in {:.1}s", d.as_secs_f64()))
                .unwrap_or_default();
            let why = note.map(|n| format!(" ({n})")).unwrap_or_default();
            println!("<- {name}: {}{took}{why}", status_label(status));
        }
    };
    let outcome = scheduler::run(
        &loaded.spec,
        &loaded.tasks,
        &mut { report },
        None::<Box<dyn Executor>>,
    );
    println!(
        "== run '{}' {} ==",
        outcome.workflow,
        run_label(outcome.run)
    );
    for r in &outcome.tasks {
        let took = r
            .elapsed
            .map(|d| format!(" in {:.1}s", d.as_secs_f64()))
            .unwrap_or_default();
        let why = r
            .note
            .as_ref()
            .map(|n| format!(" ({n})"))
            .unwrap_or_default();
        println!("   {}: {}{took}{why}", r.name, status_label(r.status));
    }
    match outcome.run {
        RunStatus::Succeeded => 0,
        _ => 1,
    }
}

fn run_file_docker(path: &str) -> u8 {
    let loaded = match ingest::load_docker_file(path) {
        Ok(loaded) => loaded,
        Err(problems) => {
            for p in &problems {
                eprintln!("error: {p}");
            }
            return 2;
        }
    };
    let volume = nozzle_run::executor::new_run_volume(&loaded.spec.id);
    let executor = match DockerExecutor::new(ExecutorConfig::default(), volume) {
        Ok(ex) => ex,
        Err(note) => {
            eprintln!("error: {note}");
            return 2;
        }
    };
    let report = |ev: SchedulerEvent<'_>| match ev {
        SchedulerEvent::TaskStarted { name, cmd } => {
            let image = loaded
                .tasks
                .get(name)
                .and_then(|t| t.image.as_deref())
                .unwrap_or("?");
            println!("-> {name}: docker run {image} sh -c '{cmd}'")
        }
        SchedulerEvent::TaskFinished {
            name,
            status,
            elapsed,
            note,
        } => {
            let took = elapsed
                .map(|d| format!(" in {:.1}s", d.as_secs_f64()))
                .unwrap_or_default();
            let why = note.map(|n| format!(" ({n})")).unwrap_or_default();
            println!("<- {name}: {}{took}{why}", status_label(status));
        }
    };
    let outcome = scheduler::run(
        &loaded.spec,
        &loaded.tasks,
        &mut { report },
        Some(Box::new(executor) as Box<dyn Executor>),
    );
    println!(
        "== run '{}' {} ==",
        outcome.workflow,
        run_label(outcome.run)
    );
    for r in &outcome.tasks {
        let took = r
            .elapsed
            .map(|d| format!(" in {:.1}s", d.as_secs_f64()))
            .unwrap_or_default();
        let why = r
            .note
            .as_ref()
            .map(|n| format!(" ({n})"))
            .unwrap_or_default();
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
