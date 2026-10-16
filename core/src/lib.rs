//! Nozzle workflow engine core.
//!
//! Pure scheduling logic only: DAG validation, readiness computation, branch
//! predicates, result-envelope classification, and default configuration.
//! No I/O here — stores, HTTP, bundles, and blobs live in provider crates and
//! consume these functions through language bindings (PyO3, wasm-bindgen).

pub mod config;
pub mod dag;
pub mod readiness;
pub mod refs;
pub mod states;
pub mod xcom;

/// Version of this core crate. SDKs and orchestrators must assert lockstep
/// compatibility via [`assert_compat`] at worker registration and run creation.
pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Assert that a peer (SDK, orchestrator, worker) runs a compatible core.
///
/// MVP rule: exact version match. Rejects anything else with an explanatory
/// error so behavior can never silently differ between components.
pub fn assert_compat(peer_version: &str) -> Result<(), String> {
    if peer_version == CORE_VERSION {
        Ok(())
    } else {
        Err(format!(
            "incompatible nozzle core: peer {peer_version} != core {CORE_VERSION}; \
             upgrade all components in lockstep"
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compat_accepts_same_version() {
        assert!(assert_compat(CORE_VERSION).is_ok());
    }

    #[test]
    fn compat_rejects_mismatch() {
        let err = assert_compat("0.0.0").unwrap_err();
        assert!(err.contains("lockstep"), "{err}");
    }
}
