//! Executor abstraction: how a single task is executed.
//!
//! The `Scheduler` decides *which* task runs and *when*; an `Executor`
//! decides *how* it runs. This keeps the scheduler agnostic to the
// execution substrate (local process, Lambda, CF container, …).

use crate::ingest::{TaskDef, ORDER_ARG};
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

/// Resolve the Docker host: `DOCKER_HOST` when set, otherwise the default
/// socket (None signals the CLI default to `docker`).
pub fn docker_host() -> Option<String> {
    std::env::var("DOCKER_HOST")
        .ok()
        .filter(|h| !h.trim().is_empty())
}

/// Sanitize a name for Docker (volume/container): keep `[A-Za-z0-9_.-]`,
/// replace the rest with `-`, fall back to `x` when empty.
pub fn sanitize_docker_name(s: &str) -> String {
    let mut out: String = s
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect();
    if out.is_empty() {
        out.push('x');
    }
    out.truncate(200);
    out
}

/// Create a unique per-run volume name: `nozzle-<workflow>-<pid>-<epoch>`.
pub fn new_run_volume(workflow_id: &str) -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!(
        "nozzle-{}-{}-{secs}",
        sanitize_docker_name(workflow_id),
        std::process::id()
    )
}

fn docker_cmd(host: &Option<String>) -> std::process::Command {
    let mut cmd = std::process::Command::new("docker");
    if let Some(h) = host {
        cmd.env("DOCKER_HOST", h);
    }
    cmd
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
            .filter(|e| e.downstream == name && e.arg != ORDER_ARG)
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

/// Docker-host executor: one `docker run --rm` container per task.
///
/// Shares an implicit per-run named volume at `/work` (workdir `/work`)
/// across tasks. Exposes only data-flow `env` bindings plus `passEnv`
/// allowlist entries — never full host ambient.
pub struct DockerExecutor {
    config: ExecutorConfig,
    volume: String,
    host: Option<String>,
}

impl DockerExecutor {
    /// Create the per-run volume up front (doubles as daemon preflight).
    /// Returns a clear error when the daemon is unreachable.
    pub fn new(config: ExecutorConfig, volume: String) -> Result<Self, String> {
        let host = docker_host();
        let mut cmd = docker_cmd(&host);
        cmd.args(["volume", "create", &volume]);
        let out = cmd
            .output()
            .map_err(|e| format!("cannot spawn docker: {e}"))?;
        if !out.status.success() {
            let detail = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(if detail.is_empty() {
                "docker daemon unreachable (volume create failed)".to_string()
            } else {
                format!("docker daemon unreachable: {detail}")
            });
        }
        Ok(Self {
            config,
            volume,
            host,
        })
    }

    /// Test constructor without touching the daemon.
    #[cfg(test)]
    pub fn for_test(volume: &str) -> Self {
        Self {
            config: ExecutorConfig::default(),
            volume: volume.to_string(),
            host: None,
        }
    }

    pub fn volume(&self) -> &str {
        &self.volume
    }

    pub fn container_name(&self, task: &str) -> String {
        format!("{}-{}", self.volume, sanitize_docker_name(task))
    }

    /// Pure arg construction for `docker run ...` (after `docker`).
    /// Resolves data-flow outputs and `passEnv` host vars; fail-closed.
    pub fn build_args(
        &self,
        def: &TaskDef,
        spec: &WorkflowSpec,
        name: &str,
        outputs: &BTreeMap<String, String>,
    ) -> Result<Vec<String>, String> {
        let image = match &def.image {
            Some(img) if !img.trim().is_empty() => img.clone(),
            _ => return Err(format!("task {name} declares no image")),
        };
        let mut args: Vec<String> = vec![
            "run".into(),
            "--rm".into(),
            "-v".into(),
            format!("{}:/work", self.volume),
            "-w".into(),
            "/work".into(),
            "--name".into(),
            self.container_name(name),
        ];
        for e in spec
            .edges
            .iter()
            .filter(|e| e.downstream == name && e.arg != ORDER_ARG)
        {
            let value = outputs
                .get(&e.upstream)
                .ok_or_else(|| format!("missing output from upstream '{}'", e.upstream))?;
            args.push("-e".into());
            args.push(format!("{}={value}", e.arg));
        }
        for var in &def.pass_env {
            let value = std::env::var(var)
                .map_err(|_| format!("task {name} lists missing host env var {var}"))?;
            args.push("-e".into());
            args.push(format!("{var}={value}"));
        }
        args.push(image);
        args.push(self.config.shell.clone());
        args.push(self.config.shell_flag.clone());
        args.push(def.cmd.clone());
        Ok(args)
    }
}

impl Drop for DockerExecutor {
    fn drop(&mut self) {
        let mut cmd = docker_cmd(&self.host);
        cmd.args(["volume", "rm", "-f", &self.volume]);
        let _ = cmd.output();
    }
}

impl Executor for DockerExecutor {
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
        use std::process::Stdio;

        let args = self.build_args(def, spec, name, outputs)?;
        let mut cmd = docker_cmd(&self.host);
        cmd.args(&args);
        cmd.stdout(Stdio::piped()).stderr(Stdio::inherit());
        let child = cmd
            .spawn()
            .map_err(|e| format!("cannot spawn docker: {e}"))?;
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

    #[test]
    fn ordering_only_edge_injects_nothing() {
        // A pure `needs:` edge (arg = ORDER_ARG) must not be treated as a
        // data-flow binding: execution must not require the upstream output.
        let loaded = crate::ingest::load_str(
            "name: w\ntasks:\n  - id: a\n    cmd: exit 0\n  - id: b\n    cmd: exit 0\n    needs: [a]\n",
        )
        .unwrap();
        let executor = LocalExecutor::default();
        let outputs = BTreeMap::new(); // upstream output absent
        assert!(executor
            .execute(&loaded.tasks["b"], &loaded.spec, "b", &outputs)
            .is_ok());
    }

    #[test]
    fn docker_build_args_mount_work_and_env() {
        let loaded = crate::ingest::load_str(
            "name: w\ntasks:\n  - id: a\n    cmd: echo hi\n    image: python:3.12\n    passEnv: [PATH]\n",
        )
        .unwrap();
        let ex = DockerExecutor::for_test("nozzle-test-vol");
        let args = ex
            .build_args(&loaded.tasks["a"], &loaded.spec, "a", &BTreeMap::new())
            .unwrap();
        assert!(args.contains(&"run".to_string()));
        assert!(args.contains(&"--rm".to_string()));
        assert!(args.contains(&"nozzle-test-vol:/work".to_string()));
        assert!(args.contains(&"/work".to_string()));
        assert!(args.contains(&"nozzle-test-vol-a".to_string()));
        assert!(args.contains(&"python:3.12".to_string()));
        assert!(args
            .windows(2)
            .any(|w| w[0] == "-e" && w[1].starts_with("PATH=")));
        assert_eq!(
            args[args.len() - 3..],
            ["sh".to_string(), "-c".to_string(), "echo hi".to_string()]
        );
    }

    #[test]
    fn docker_missing_image_is_error() {
        let loaded =
            crate::ingest::load_str("name: w\ntasks:\n  - id: a\n    cmd: exit 0\n").unwrap();
        let ex = DockerExecutor::for_test("nozzle-test-vol");
        let err = ex
            .build_args(&loaded.tasks["a"], &loaded.spec, "a", &BTreeMap::new())
            .unwrap_err();
        assert!(err.contains("declares no image"), "{err:?}");
    }

    #[test]
    fn docker_hello_world_container_runs() {
        let loaded = crate::ingest::load_str(
            "name: w\ntasks:\n  - id: hi\n    cmd: echo docker-hi\n    image: python:3.12\n",
        )
        .unwrap();
        let vol = format!("nozzle-test-{}-hello", std::process::id());
        let ex = DockerExecutor::new(ExecutorConfig::default(), vol).expect("daemon required");
        let out = ex
            .execute(&loaded.tasks["hi"], &loaded.spec, "hi", &BTreeMap::new())
            .expect("container run");
        assert_eq!(out, "docker-hi");
    }
}
