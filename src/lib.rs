#[cfg(feature = "python")]
use pyo3::prelude::*;

pub fn add(left: u64, right: u64) -> u64 {
    left + right
}

#[cfg(feature = "python")]
#[pyfunction]
#[pyo3(name = "add")]
fn py_add(left: u64, right: u64) -> PyResult<u64> {
    Ok(add(left, right))
}

#[cfg(feature = "python")]
#[pymodule]
fn _core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(py_add, m)?)?;
    Ok(())
}

// C ABI for Go (cgo) and other native consumers.
// Uses a prefixed name to avoid clashing with the Python module symbol.
#[unsafe(no_mangle)]
pub extern "C" fn nozzle_add(left: u64, right: u64) -> u64 {
    add(left, right)
}
