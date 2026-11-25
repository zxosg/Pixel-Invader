import { useEffect, useState } from "react";

/** Registers the service worker and reports when an updated version is waiting to take over. */
export function useServiceWorkerUpdate(): { readonly updateAvailable: boolean; readonly applyUpdate: () => void } {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return undefined;
    const baseUrl = import.meta.env.BASE_URL;
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    // Only a worker replacing an existing controller is an update; the first install needs no prompt.
    const watch = (registration: ServiceWorkerRegistration) => {
      const check = (worker: ServiceWorker | null) => {
        if (worker !== null && navigator.serviceWorker.controller !== null) setWaiting(worker);
      };
      check(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed") check(installing);
        });
      });
    };
    const register = () => {
      void navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }).then(watch);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("load", register);
    };
  }, []);

  return {
    updateAvailable: waiting !== null,
    applyUpdate: () => waiting?.postMessage({ type: "SKIP_WAITING" }),
  };
}

export function UpdatePrompt() {
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();
  if (!updateAvailable) return null;
  return (
    <div className="update-prompt" role="status" aria-live="polite">
      <span>A new version is available.</span>
      <button type="button" onClick={applyUpdate}>Reload to update</button>
    </div>
  );
}
