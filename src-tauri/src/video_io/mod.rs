//! Native video sharing. All frame storage is bounded and uses straight RGBA.
pub mod frame;
pub mod ndi;
#[cfg(target_os = "macos")]
pub mod syphon;

pub mod gpu;

mod session;
pub use session::*;
