import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ENTRYPOINTS = [
  "src/app/api/execution-readiness/route.ts",
  "src/components/market/ExecutionReadinessPanel.tsx",
  "src/lib/ui/execution-readiness.ts",
  "src/lib/underly/execution-readiness.ts",
];
const SIGNING_PACKAGES = [
  "ethers",
  "viem",
  "wagmi",
  "web3",
  "@walletconnect",
];

function imports(source: string): string[] {
  return [...source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
}

function resolveLocal(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(ROOT, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return normalize(candidate);
    }
  }
  return null;
}

describe("v0.6 execution capability boundary", () => {
  it("keeps the reachable import graph outside wallet and signing modules", () => {
    const queue = ENTRYPOINTS.map((file) => join(ROOT, file));
    const visited = new Set<string>();
    const external = new Set<string>();

    while (queue.length) {
      const file = normalize(queue.pop()!);
      if (visited.has(file)) continue;
      visited.add(file);
      const source = readFileSync(file, "utf8");
      for (const specifier of imports(source)) {
        const local = resolveLocal(file, specifier);
        if (local) queue.push(local);
        else external.add(specifier);
      }
    }

    for (const file of visited) {
      expect(file.replaceAll("\\", "/")).not.toContain("/src/lib/wallet/");
    }
    for (const specifier of external) {
      expect(
        SIGNING_PACKAGES.some(
          (name) => specifier === name || specifier.startsWith(`${name}/`),
        ),
      ).toBe(false);
    }
  });

  it("has no wallet-signing dependency in the application manifest", () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const installed = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]);

    for (const name of SIGNING_PACKAGES) expect(installed.has(name)).toBe(false);
  });

  it("retains source-level smoke guards against signing and broadcast calls", () => {
    const source = ENTRYPOINTS.map((file) =>
      readFileSync(join(ROOT, file), "utf8"),
    ).join("\n");
    for (const prohibited of [
      "eth_sendTransaction",
      "eth_sendRawTransaction",
      "eth_signTransaction",
      "personal_sign",
      "sendTransaction(",
      "signTransaction(",
      "writeContract(",
      "broadcastTransaction(",
    ]) {
      expect(source).not.toContain(prohibited);
    }
  });
});
