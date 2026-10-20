//! Tunable orchestration knobs and their MVP defaults.
//!
//! Every value is per-orchestrator configuration. These defaults are the
//! starting point recorded in the change; providers may override them.

use serde::{Deserialize, Serialize};

/// Full set of tunable knobs. Durations are whole seconds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Defaults {
    /// Worker claim short-poll interval.
    pub poll_interval_secs: u64,
    /// Lease renewal cadence expected from running workers.
    pub heartbeat_secs: u64,
    /// Lease expiry without heartbeat or completion.
    pub lease_secs: u64,
    /// Attempts per task before it is marked failed.
    pub max_attempts: u32,
    /// Serialized envelope size below which outputs stay inline.
    pub inline_threshold_bytes: u64,
    /// Largest single-shot blob/log upload accepted via the orchestrator.
    pub max_blob_bytes: u64,
}

impl Default for Defaults {
    fn default() -> Self {
        Defaults {
            poll_interval_secs: 10,
            heartbeat_secs: 15,
            lease_secs: 60,
            max_attempts: 3,
            inline_threshold_bytes: 64 * 1024,
            max_blob_bytes: 10 * 1024 * 1024,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_recorded_mvp_values() {
        let d = Defaults::default();
        assert_eq!(d.poll_interval_secs, 10);
        assert_eq!(d.heartbeat_secs, 15);
        assert_eq!(d.lease_secs, 60);
        assert_eq!(d.max_attempts, 3);
        assert_eq!(d.inline_threshold_bytes, 64 * 1024);
        assert_eq!(d.max_blob_bytes, 10 * 1024 * 1024);
    }
}
