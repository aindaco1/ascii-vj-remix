import { invoke, isTauri } from "@tauri-apps/api/core";

// The iframe is sandboxed without scripts, navigation, downloads or app IPC.
// Desktop reads final packaging resources, including Linux's post-build notices.
const panel = document.querySelector(".software-licenses");
let loaded = false;
panel?.addEventListener("toggle", async () => {
  if (!panel.open || loaded || !isTauri()) return;
  try {
    panel.querySelector("iframe").srcdoc = await invoke(
      "read_distribution_licenses",
    );
    loaded = true;
  } catch {
    panel.querySelector('[role="status"]').textContent =
      "The bundled license document could not be opened. It is also included in the app’s resources/licenses folder.";
  }
});
