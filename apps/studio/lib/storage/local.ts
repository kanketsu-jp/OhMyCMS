import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageDriver } from "./driver";

function storageRoot(): string {
  return path.resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    process.env.STORAGE_LOCAL_ROOT ?? ".storage",
  );
}

function resolveInsideRoot(key: string): string {
  const root = storageRoot();
  const resolved = path.resolve(root, key);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Storage key escapes local storage root");
  }
  return resolved;
}

async function writeBody(filePath: string, body: Buffer | ReadableStream): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const buffer = Buffer.isBuffer(body)
    ? body
    : Buffer.from(await new Response(body).arrayBuffer());
  await writeFile(filePath, buffer);
}

export function createLocalStorage(): StorageDriver {
  return {
    name: "local",
    async put(key, body) {
      await writeBody(resolveInsideRoot(key), body);
    },
    async get(key) {
      return readFile(resolveInsideRoot(key));
    },
    async head(key) {
      try {
        const info = await stat(resolveInsideRoot(key));
        return { size: info.size };
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
    async delete(key) {
      await rm(resolveInsideRoot(key), { force: true });
    },
    async deletePrefix(prefix) {
      await rm(resolveInsideRoot(prefix), { force: true, recursive: true });
    },
  };
}
