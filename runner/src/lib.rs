//! `nozzle-run`: the engine's library surface — ingestion and execution.
//! The CLI binary built from this crate is `nzl`.

pub mod executor;
pub mod ingest;
pub mod model;
pub mod scheduler;
