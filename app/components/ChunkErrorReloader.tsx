"use client";

import { useEffect } from "react";

/**
 * Automaticky se zotaví z chyb načtení JS chunků / selhání hydratace.
 *
 * Když je záložka otevřená přes rebuild (typicky `next dev` nebo nový build),
 * odkazuje na staré chunky, které už na serveru nejsou. Výsledkem je
 * ChunkLoadError a stránka zamrzne na úvodním loaderu ("Ověřování přístupu...").
 * Tento komponent takovou chybu odchytí a jednou stránku znovu načte, takže
 * uživatel nemusí dělat ruční hard reset.
 *
 * Pojistka proti nekonečné smyčce: reload provedeme nejvýše jednou za 10 sekund.
 */
export default function ChunkErrorReloader() {
  useEffect(() => {
    const RELOAD_KEY = "chunkReloadAt";

    const isChunkError = (message: string) =>
      /ChunkLoadError|Loading chunk [\d]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
        message
      );

    const reloadOnce = () => {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
        if (Date.now() - last < 10000) return; // nedávno už reloadováno -> nezacyklit
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        /* sessionStorage nedostupný – reload necháme proběhnout */
      }
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      const msg = event.message || event.error?.message || "";
      if (isChunkError(msg)) reloadOnce();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = typeof reason === "string" ? reason : reason?.message || "";
      if (isChunkError(msg)) reloadOnce();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
