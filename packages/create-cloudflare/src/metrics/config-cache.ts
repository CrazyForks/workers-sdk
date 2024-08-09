// Copied from packages/wrangler/src/config-cache.ts
import { readFileSync } from "fs";
import * as path from "path";
import { findUpSync } from "find-up";

let __cacheFolder: string | null | undefined;
function getCacheFolder() {
	if (__cacheFolder || __cacheFolder === null) {
		return __cacheFolder;
	}

	const closestNodeModulesDirectory = findUpSync("node_modules", {
		type: "directory",
	});
	__cacheFolder = closestNodeModulesDirectory
		? path.join(closestNodeModulesDirectory, ".cache/wrangler")
		: null;
	if (!__cacheFolder) {
		console.debug("No folder available to cache configuration");
	}
	return __cacheFolder;
}

export function getConfigCache<T>(fileName: string): Partial<T> {
	try {
		const cacheFolder = getCacheFolder();
		if (cacheFolder) {
			const configCacheLocation = path.join(cacheFolder, fileName);
			const configCache = JSON.parse(
				readFileSync(configCacheLocation, "utf-8"),
			);
			return configCache;
		} else {
			return {};
		}
	} catch (err) {
		return {};
	}
}
