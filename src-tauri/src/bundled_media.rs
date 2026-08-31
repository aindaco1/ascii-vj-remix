use std::ffi::OsStr;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

pub(crate) const BUNDLED_MEDIA_SOURCE_PREFIX: &str = "bundled:";

const BUNDLED_DEMO_MEDIA_URLS: &[&str] = &["media/demo-video-2.mp4", "media/demo-video-2.webm"];

pub(crate) fn media_url_for_source_id(source_id: &str) -> Option<&str> {
    let media_url = source_id.strip_prefix(BUNDLED_MEDIA_SOURCE_PREFIX)?;
    BUNDLED_DEMO_MEDIA_URLS
        .contains(&media_url)
        .then_some(media_url)
}

pub(crate) fn is_safe_bundled_media_path(media_url: &str) -> bool {
    let path = Path::new(media_url);
    if path.is_absolute() {
        return false;
    }
    let mut components = path.components();
    if components.next() != Some(Component::Normal(OsStr::new("media"))) {
        return false;
    }
    components.all(|component| matches!(component, Component::Normal(_)))
}

pub(crate) fn resolve_bundled_media_path(app: &AppHandle, media_url: &str) -> Option<PathBuf> {
    if !is_safe_bundled_media_path(media_url) {
        return None;
    }

    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(media_url));
        candidates.push(resource_dir.join("resources").join(media_url));
        candidates.push(resource_dir.join("_up_").join(media_url));
        candidates.push(resource_dir.join("_up_").join("dist").join(media_url));
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join(media_url));
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.join(media_url));
        }
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

pub(crate) fn resolve_bundled_source_id(app: &AppHandle, source_id: &str) -> Option<PathBuf> {
    resolve_bundled_media_path(app, media_url_for_source_id(source_id)?)
}

#[cfg(test)]
mod tests {
    use super::{is_safe_bundled_media_path, media_url_for_source_id};

    #[test]
    fn bundled_media_paths_reject_traversal() {
        assert!(is_safe_bundled_media_path("media/demo-video-2.mp4"));
        assert!(!is_safe_bundled_media_path("../media/demo-video-2.mp4"));
        assert!(!is_safe_bundled_media_path("media/../secret.mp4"));
        assert!(!is_safe_bundled_media_path("/tmp/demo.mp4"));
    }

    #[test]
    fn native_source_ids_allow_only_the_bundled_demo_videos() {
        assert_eq!(
            media_url_for_source_id("bundled:media/demo-video-2.mp4"),
            Some("media/demo-video-2.mp4")
        );
        assert_eq!(
            media_url_for_source_id("bundled:media/demo-video-2.webm"),
            Some("media/demo-video-2.webm")
        );
        assert_eq!(media_url_for_source_id("bundled:media/private.mp4"), None);
        assert_eq!(media_url_for_source_id("media/demo-video-2.webm"), None);
    }
}
