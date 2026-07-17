"use client";

import { useState } from "react";
import { useRestaurantUI } from "./AppShell";

export function DataSyncSettings() {
  const { syncNow, lastSyncedAt } = useRestaurantUI();
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-black/50 dark:text-white/50">Data sync</span>
      <button
        type="button"
        onClick={handleSync}
        disabled={syncing}
        className="w-fit rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 disabled:opacity-50 dark:border-white/15 dark:text-white/70"
      >
        {syncing ? "Syncing…" : "Sync now"}
      </button>
      <span className="text-xs text-black/40 dark:text-white/40">
        {lastSyncedAt ? `Last synced at ${lastSyncedAt.toLocaleTimeString()}` : "Not synced yet"}
      </span>
    </div>
  );
}
