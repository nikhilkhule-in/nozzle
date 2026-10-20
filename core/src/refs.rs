//! Output references and placement policy: where a task's result goes.

use serde::{Deserialize, Serialize};

/// Author-declared placement hint for a task's output, recorded at workflow
/// parse time and enforced at completion time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PlacementPolicy {
    /// System decides by size against the orchestrator's inline threshold.
    #[default]
    Auto,
    /// Must fit inline; overflow fails the attempt.
    InlineOnly,
    /// Always stored as a blob reference.
    BlobOnly,
}

/// Promise of a future value: task `task` will produce output governed by
/// `policy` when it executes. Workflows pass these between tasks at parse
/// time; runs materialize them into envelopes at completion time.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OutputRef {
    pub task: String,
    #[serde(default)]
    pub policy: PlacementPolicy,
}
