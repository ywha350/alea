import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeUiAudio, unlockUiAudio } from "./game/audio";

const blockedNavigationKeys = new Set([
  " ",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp"
]);

const lockPortraitOrientation = () => {
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: "portrait-primary") => Promise<void>;
  };

  if (!orientation.lock) {
    return;
  }

  void orientation.lock("portrait-primary").catch(() => {
    // Some mobile browsers only allow orientation lock for installed/fullscreen apps.
  });
};

window.addEventListener("wheel", (event) => event.preventDefault(), { passive: false });
window.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  const interactiveTarget = target?.closest("button, input, select, textarea, a, [contenteditable='true']");
  const zoomShortcut = (event.ctrlKey || event.metaKey) && ["+", "-", "=", "0"].includes(event.key);
  if (zoomShortcut || (!interactiveTarget && blockedNavigationKeys.has(event.key))) {
    event.preventDefault();
  }
});

void initializeUiAudio();
lockPortraitOrientation();
window.addEventListener("pointerdown", unlockUiAudio, { passive: true });
window.addEventListener("pointerdown", lockPortraitOrientation, { passive: true });
window.addEventListener("keydown", unlockUiAudio);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    unlockUiAudio();
  }
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL
    });
  });
} else if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
