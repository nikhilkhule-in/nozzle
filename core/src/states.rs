//! Run and task lifecycle states.

use serde::{Deserialize, Serialize};

/// Run lifecycle. Runs are created queued by manual trigger and move forward
/// only; cancellation beyond failure is out of MVP scope.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
}

/// Task lifecycle. `Skipped` marks a task whose branch predicate did not
/// match (or whose inputs never materialized because every path skipped).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Skipped,
}

impl TaskStatus {
    /// Whether the task will never change state again.
    pub fn is_terminal(self) -> bool {
        matches!(self, TaskStatus::Succeeded | TaskStatus::Failed | TaskStatus::Skipped)
    }
}

impl RunStatus {
    /// Whether the run will never change state again.
    pub fn is_terminal(self) -> bool {
        matches!(self, RunStatus::Succeeded | RunStatus::Failed)
    }
}
