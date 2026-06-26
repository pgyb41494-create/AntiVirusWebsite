export type ModuleDef = {
  id: string;
  label: string;
  category: string;
};

/** Full catalog — always shown on dashboard even if count is 0. */
export const MODULE_CATALOG: ModuleDef[] = [
  { id: "eicar", label: "EICAR Drop", category: "Payload" },
  { id: "self_copy", label: "Self Replication", category: "Payload" },
  { id: "persistence", label: "Registry Persistence", category: "Payload" },
  { id: "process_injection", label: "Process Injection", category: "Execution" },
  { id: "powershell", label: "Encoded PowerShell", category: "Execution" },
  { id: "defender", label: "Defender Tamper", category: "Defense" },
  { id: "keylogger", label: "Keylogger Hook", category: "Spyware" },
  { id: "screenshot", label: "Screenshot Capture", category: "Spyware" },
  { id: "clipboard", label: "Clipboard Steal", category: "Spyware" },
  { id: "webcam", label: "Webcam Access", category: "Spyware" },
  { id: "cookies", label: "Browser Cookies", category: "Exfil" },
  { id: "file_read", label: "File Harvest", category: "Exfil" },
  { id: "crypto_hunt", label: "Crypto Wallets", category: "Exfil" },
  { id: "location", label: "Geo Location", category: "Exfil" },
  { id: "network", label: "C2 Callback", category: "Network" },
];

export function moduleLabel(id: string): string {
  return MODULE_CATALOG.find((m) => m.id === id)?.label ?? id.replace(/_/g, " ");
}

export function mergeModuleStats(
  byModule: { module: string; count: number; detected: number; blocked: number }[] = [],
) {
  const map = new Map(byModule.map((m) => [m.module, m]));
  return MODULE_CATALOG.map((def) => {
    const row = map.get(def.id);
    return {
      ...def,
      count: row?.count ?? 0,
      detected: row?.detected ?? 0,
      blocked: row?.blocked ?? 0,
    };
  });
}
