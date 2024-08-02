import assert from "assert";
import fs from "fs/promises";
import path from "path";
import anyTest, { Macro, TestFn } from "ava";
import esbuild from "esbuild";
import { Miniflare } from "miniflare";
import { useTmp } from "../../test-shared";

const FIXTURES_PATH = path.resolve(
	__dirname,
	"..",
	"..",
	"..",
	"..",
	"test",
	"fixtures",
	"assets"
);
const MODULES_ENTRY_PATH = path.join(FIXTURES_PATH, "modules.ts");

interface Context {
	serviceWorkerPath: string;
	modulesPath: string;
}

const test = anyTest as TestFn<Context>;

test.before(async (t) => {
	// Build fixtures
	const tmp = await useTmp(t);
	await esbuild.build({
		entryPoints: [MODULES_ENTRY_PATH],
		format: "esm",
		external: ["__STATIC_CONTENT_MANIFEST"],
		bundle: true,
		sourcemap: true,
		outdir: tmp,
	});
	t.context.modulesPath = path.join(tmp, "modules.js");
});

type Route = keyof typeof routeContents;
const routeContents = {
	"/": "<p>Index</p>",
	"/a.txt": "a",
	"/b/b.txt": "b",
};

const getMacro: Macro<[{}, Set<Route>], Context> = {
	async exec(t, options, expectedRoutes) {
		const tmp = await useTmp(t);
		for (const [route, contents] of Object.entries(routeContents)) {
			const routePath = path.join(tmp, route === "/" ? "index.html" : route);
			await fs.mkdir(path.dirname(routePath), { recursive: true });
			await fs.writeFile(routePath, contents, "utf8");
		}

		const mf = new Miniflare({
			...options,
			scriptPath: t.context.modulesPath,
			modules: true,
			assetsPath: tmp,
		});
		t.teardown(() => mf.dispose());

		for (const [route, expectedContents] of Object.entries(routeContents)) {
			const res = await mf.dispatchFetch(`http://localhost:8787${route}`);
			const expected = expectedRoutes.has(route as Route);
			const text = (await res.text()).trim();
			t.is(res.status, expected ? 200 : 404, `${route}: ${text}`);
			if (expected) t.is(text, expectedContents, route);
		}
	},
};

test(
	"gets all assets",
	getMacro,
	{},
	new Set<Route>(["/", "/a.txt", "/b/b.txt"])
);

// Tests for checking different types of globs are matched correctly
const matchMacro: Macro<[string], Context> = {
	async exec(t, include) {
		const tmp = await useTmp(t);
		const dir = path.join(tmp, "a", "b", "c");
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(path.join(dir, "test.txt"), "test", "utf8");
		const mf = new Miniflare({
			siteInclude: [include],
			scriptPath: t.context.modulesPath,
			modules: true,
			assetsPath: tmp,
		});
		t.teardown(() => mf.dispose());
		const res = await mf.dispatchFetch("http://localhost:8787/a/b/c/test.txt");
		t.is(res.status, 200);
		await res.arrayBuffer();
	},
};

test("matches file name pattern", matchMacro, "test.txt");
test("matches exact pattern", matchMacro, "a/b/c/test.txt");
test("matches extension patterns", matchMacro, "*.txt");
test("matches globstar patterns", matchMacro, "**/*.txt");
test("matches wildcard directory patterns", matchMacro, "a/*/c/*.txt");

test("doesn't cache assets", async (t) => {
	const tmp = await useTmp(t);
	const testPath = path.join(tmp, "test.txt");
	await fs.writeFile(testPath, "1", "utf8");

	const mf = new Miniflare({
		scriptPath: t.context.modulesPath,
		modules: true,
		assetsPath: tmp,
	});
	t.teardown(() => mf.dispose());

	const res1 = await mf.dispatchFetch("http://localhost:8787/test.txt");
	t.is(res1.headers.get("CF-Cache-Status"), "MISS");
	t.is(await res1.text(), "1");

	await fs.writeFile(testPath, "2", "utf8");
	const res2 = await mf.dispatchFetch("http://localhost:8787/test.txt");
	t.is(res2.headers.get("CF-Cache-Status"), "MISS");
	t.is(await res2.text(), "2");
});

test("gets assets with percent-encoded paths", async (t) => {
	// https://github.com/cloudflare/miniflare/issues/326
	const tmp = await useTmp(t);
	const testPath = path.join(tmp, "ń.txt");
	await fs.writeFile(testPath, "test", "utf8");
	const mf = new Miniflare({
		scriptPath: t.context.modulesPath,
		modules: true,
		assetsPath: tmp,
	});
	t.teardown(() => mf.dispose());
	const res = await mf.dispatchFetch("http://localhost:8787/ń.txt");
	t.is(await res.text(), "test");
});

const isWindows = process.platform === "win32";
const unixTest = isWindows ? test.skip : test;
unixTest("static content namespace supports listing keys", async (t) => {
	const tmp = await useTmp(t);
	await fs.mkdir(path.join(tmp, "a", "b", "c"), { recursive: true });
	await fs.writeFile(path.join(tmp, "1.txt"), "one");
	await fs.writeFile(path.join(tmp, "2.txt"), "two");
	await fs.writeFile(path.join(tmp, "a", "3.txt"), "three");
	await fs.writeFile(path.join(tmp, "a", "b", "4.txt"), "four");
	await fs.writeFile(path.join(tmp, "a", "b", "c", "5.txt"), "five");
	await fs.writeFile(path.join(tmp, "a", "b", "c", "6.txt"), "six");
	await fs.writeFile(path.join(tmp, "a", "b", "c", "7.txt"), "seven");
	const mf = new Miniflare({
		verbose: true,
		scriptPath: t.context.modulesPath,
		modules: true,
		assetsPath: tmp,
	});
	t.teardown(() => mf.dispose());

	const kv = await mf.getKVNamespace("__STATIC_CONTENT");
	let result = await kv.list();
	t.deepEqual(result, {
		keys: [
			{ name: "$__MINIFLARE_ASSETS__$/1.txt" },
			{ name: "$__MINIFLARE_ASSETS__$/2.txt" },
			{ name: "$__MINIFLARE_ASSETS__$/a%2F3.txt" },
			{ name: "$__MINIFLARE_ASSETS__$/a%2Fb%2F4.txt" },
			{ name: "$__MINIFLARE_ASSETS__$/a%2Fb%2Fc%2F5.txt" },
			{ name: "$__MINIFLARE_ASSETS__$/a%2Fb%2Fc%2F6.txt" },
			{ name: "$__MINIFLARE_ASSETS__$/a%2Fb%2Fc%2F7.txt" },
		],
		list_complete: true,
		cacheStatus: null,
	});

	// Check with prefix, cursor and limit
	result = await kv.list({ prefix: "$__MINIFLARE_ASSETS__$/a%2F", limit: 1 });
	assert(!result.list_complete);
	t.deepEqual(result, {
		keys: [{ name: "$__MINIFLARE_ASSETS__$/a%2F3.txt" }],
		list_complete: false,
		cursor: "JF9fTUlOSUZMQVJFX0FTU0VUU19fJC9hJTJGMy50eHQ=",
		cacheStatus: null,
	});

	result = await kv.list({
		prefix: "$__MINIFLARE_ASSETS__$/a%2F",
		limit: 2,
		cursor: result.cursor,
	});
	assert(!result.list_complete);
	t.deepEqual(result, {
		keys: [
			{ name: "$__MINIFLARE_ASSETS__$/a%2Fb%2F4.txt" },
			{ name: "$__MINIFLARE_ASSETS__$/a%2Fb%2Fc%2F5.txt" },
		],
		list_complete: false,
		cursor: "JF9fTUlOSUZMQVJFX0FTU0VUU19fJC9hJTJGYiUyRmMlMkY1LnR4dA==",
		cacheStatus: null,
	});

	result = await kv.list({
		prefix: "$__MINIFLARE_ASSETS__$/a%2F",
		cursor: result.cursor,
	});
	t.deepEqual(result, {
		keys: [
			{ name: "$__MINIFLARE_ASSETS__$/a%2Fb%2Fc%2F6.txt" },
			{ name: "$__MINIFLARE_ASSETS__$/a%2Fb%2Fc%2F7.txt" },
		],
		list_complete: true,
		cacheStatus: null,
	});
});
