//! Result envelopes: routing task outputs without interpreting them.

use crate::refs::PlacementPolicy;

/// Error classifying an output that violates its placement policy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlacementError {
    /// `InlineOnly` output at or above the inline threshold.
    TooLarge { size: u64, threshold: u64 },
}

impl std::fmt::Display for PlacementError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PlacementError::TooLarge { size, threshold } => write!(
                f,
                "output of {size} bytes exceeds inline-only threshold of {threshold} bytes"
            ),
        }
    }
}

impl std::error::Error for PlacementError {}

/// Where an encoded output belongs. The orchestrator stores inline values
/// with the task record and blob values in its object store, keeping only a
/// reference (backend, key, size, hash) in the task record.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Classification {
    Inline,
    Blob,
}

/// Classify an encoded output of `size_bytes` under `policy` against the
/// orchestrator's `inline_threshold`. Comparison is on the serialized
/// envelope size, metadata included.
pub fn classify(
    size_bytes: u64,
    policy: PlacementPolicy,
    inline_threshold: u64,
) -> Result<Classification, PlacementError> {
    match policy {
        PlacementPolicy::BlobOnly => Ok(Classification::Blob),
        PlacementPolicy::InlineOnly if size_bytes >= inline_threshold => {
            Err(PlacementError::TooLarge { size: size_bytes, threshold: inline_threshold })
        }
        PlacementPolicy::InlineOnly => Ok(Classification::Inline),
        PlacementPolicy::Auto if size_bytes >= inline_threshold => Ok(Classification::Blob),
        PlacementPolicy::Auto => Ok(Classification::Inline),
    }
}

/// Content hash for envelope integrity (hex-encoded SHA-256).
pub fn content_hash(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_splits_on_threshold() {
        assert_eq!(classify(10, PlacementPolicy::Auto, 64).unwrap(), Classification::Inline);
        assert_eq!(classify(64, PlacementPolicy::Auto, 64).unwrap(), Classification::Blob);
    }

    #[test]
    fn inline_only_overflow_fails() {
        let err = classify(64, PlacementPolicy::InlineOnly, 64).unwrap_err();
        assert!(err.to_string().contains("exceeds"));
    }

    #[test]
    fn blob_only_always_blob() {
        assert_eq!(classify(1, PlacementPolicy::BlobOnly, 64).unwrap(), Classification::Blob);
    }

    #[test]
    fn hash_is_stable_hex() {
        let h = content_hash(b"nozzle");
        assert_eq!(h.len(), 64);
        assert_eq!(h, content_hash(b"nozzle"));
        assert_ne!(h, content_hash(b"nozzle!"));
    }
}
