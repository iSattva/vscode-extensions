import { spawn } from "child_process";

let cachedAvailability: boolean | undefined;

/**
 * Detects a Pandoc binary on PATH. Cached for the life of the extension host
 * so repeated exports don't re-spawn a process just to check availability.
 */
export function isPandocAvailable(): Promise<boolean> {
  if (cachedAvailability !== undefined) {
    return Promise.resolve(cachedAvailability);
  }

  return new Promise((resolve) => {
    const proc = spawn("pandoc", ["--version"], { shell: process.platform === "win32" });
    proc.on("error", () => {
      cachedAvailability = false;
      resolve(false);
    });
    proc.on("exit", (code) => {
      cachedAvailability = code === 0;
      resolve(cachedAvailability);
    });
  });
}

export function resetPandocAvailabilityCache(): void {
  cachedAvailability = undefined;
}
