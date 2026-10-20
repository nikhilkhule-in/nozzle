//! Executor abstraction: how a single task is executed.
//!
//! The `Scheduler` decides *which* task runs and *when*; an `Executor`
//! decides *how* it runs. This keeps the scheduler agnostic to the
// execution substrate (local process, Lambda, CF container, …).

use crate::ingest::TaskDef;
use nozzle_core::dag::WorkflowSpec;
use std::collections::BTreeMap;

/// Result of executing one task.
pub type ExecutionResult = Result<String, String>;

/// Configuration an executor may need (inline threshold, default shell, …).
#[derive(Debug, Clone)]
pub struct ExecutorConfig {
    /// Bytes above which a task's stdout is rejected instead of inlined.
    pub inline_threshold_bytes: u64,
    /// Shell used to wrap the raw command (default: `sh -c`).
    pub shell: String,
    /// Arg passed to the shell (default: `-c`).
    pub shell_flag: String,
}

impl Default for ExecutorConfig {
    fn default() -> Self {
        Self {
            inline_threshold_bytes: 64 * 1024,
            shell: "sh".into(),
            shell_flag: "-c".into(),
        }
    }
}

/// A task execution backend.
pub trait Executor: Send + Sync {
    /// Returns the executor's configuration (threshold, shell, …).
    fn config(&self) -> &ExecutorConfig;

    /// Execute one task to completion.
    ///
    /// * `def` — the task's raw definition (cmd, env, etc.)
    /// * `spec` — the full workflow spec (for upstream edge traversal)
    /// * `name` — the task's id
    /// * `outputs` — captured stdout of already-completed upstream tasks
    ///
    /// Returns `Ok(captured_stdout)` on zero exit, or `Err(note)` with a
    /// human-readable failure reason (exit code, signal, spawn error, …).
    /// The note becomes the task's failure message in the run summary.
    fn execute(
        &self,
        def: &TaskDef,
        spec: &WorkflowSpec,
        name: &str,
        outputs: &BTreeMap<String, String>,
    ) -> ExecutionResult;
}

/// The built-in local-process executor — current behaviour.
pub struct LocalExecutor {
    config: ExecutorConfig,
}

impl LocalExecutor {
    pub fn new(config: ExecutorConfig) -> Self {
        Self { config }
    }
}

impl Default for LocalExecutor {
    fn default() -> Self {
        Self::new(ExecutorConfig::default())
    }
}

impl Executor for LocalExecutor {
    fn config(&self) -> &ExecutorConfig {
        &self.config
    }

    fn execute(
        &self,
        def: &TaskDef,
        spec: &WorkflowSpec,
        name: &str,
        outputs: &BTreeMap<String, String>,
    ) -> ExecutionResult {
        use std::process::{Command, Stdio};

        let mut cmd = Command::new(&self.config.shell);
        cmd.arg(&self.config.shell_flag).arg(&def.cmd);

        // Inject data-flow env vars from upstream tasks.
        for e in spec
            .edges
            .iter()
            .filter(|e| e.downstream == name && e.arg != "order")
        {
            let value = outputs
                .get(&e.upstream)
                .ok_or_else(|| format!("missing output from upstream '{}'", e.upstream))?;
            cmd.env(&e.arg, value);
        }

        // Stdout piped for capture; stderr inherited so long-running commands
        // (e.g. docker build) stream their progress live.
        cmd.stdout(Stdio::piped()).stderr(Stdio::inherit());

        let child = cmd.spawn().map_err(|e| format!("cannot spawn: {e}"))?;
        let out = child
            .wait_with_output()
            .map_err(|e| format!("cannot wait: {e}"))?;

        if !out.status.success() {
            return Err(match out.status.code() {
                Some(code) => format!("exit status {code}"),
                None => format!("terminated by signal: {}", out.status),
            });
        }
        Ok(trim_trailing_newlines(&out.stdout))
    }
}

fn trim_trailing_newlines(bytes: &[u8]) -> String {
    let end = bytes
        .iter()
        .rposition(|&b| b != b'\n' && b != b'\r')
        .map_or(0, |i| i + 1);
    String::from_utf8_lossy(&bytes[..end]).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_executor_trims_newlines() {
        let _executor = LocalExecutor::default();
        // We can't easily test the full execute() without a spec, but the
        // helper is pure:
        assert_eq!(trim_trailing_newlines(b"hello\n"), "hello");
        assert_eq!(trim_trailing_newlines(b"a\r\nb\n"), "a\r\nb");
        assert_eq!(trim_trailing_newlines(b"\n\n"), "");
    }

}
