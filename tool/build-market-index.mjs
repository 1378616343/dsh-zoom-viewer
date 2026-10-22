#!/usr/bin/env node
/**
 * Build (or verify) market/index.json — this package's entry in the DSH plugin market index, format 1.
 *
 * Every document this script produces is validated with DSH's own
 * @deepseek-ai/dsh-plugin-market-index before it is written, so an index that does
 * not pass the host's parser is never committed. See DISTRIBUTION.md for the
 * publish runbook.
 *
 *   node tool/build-market-index.mjs --repo https://github.com/1378616343/dsh-zoom-viewer
 *   node tool/build-market-index.mjs --verify market/index.json --index-url https://.../market/index.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT, "market", "index.json");
/** Checker copy extracted from this machine's DSH app.asar; override with --validator. */
const DEFAULT_VALIDATOR =
  "<LOCAL_PATH>";

const AUTHOR = "1378616343";
const TITLE = { en: "Zoom Image Viewer", zh: "侧边栏图片缩放" };
const DESCRIPTION = {
  en: "Adds pointer-anchored wheel zoom, drag-to-pan, double-click reset, fit / width / 1:1 toolbar controls and a fullscreen overlay to images opened in the DSH right sidebar.",
  zh: "为 DSH 右侧栏里的图片加上以光标为锚点的滚轮缩放、拖拽平移、双击复位、适应 / 宽 / 1:1 工具栏与全屏浮层。",
};
const CATEGORY = "images";
const CATEGORIES = { images: { title: { en: "Images", zh: "图片" } } };
const LABELS = {
  sidebar: { title: { en: "Sidebar", zh: "侧边栏" } },
  zoom: { title: { en: "Zoom", zh: "缩放" } },
};
const ICON_MEDIA_TYPE = "image/svg+xml";

function usage(message) {
  if (message !== undefined) process.stderr.write(`build-market-index: ${message}\n`);
  process.stderr.write(
    [
      "usage:",
      "  build-market-index.mjs --repo <https url> [--branch main] [--timestamp <unix|ISO>] [--out <path>] [--dry-run]",
      "  build-market-index.mjs --verify <path> --index-url <https url>",
      "flags:",
      "  --repo <url>         public repository; derives homepage, repository.url and the raw index URL",
      "  --branch <name>      branch for the derived raw index URL (default: main)",
      "  --index-url <url>    explicit absolute index URL, overrides the derived one",
      "  --timestamp <value>  Unix seconds or ISO date of the npm publish (default: ask the registry, else now)",
      "  --validator <path>   market index checker (lib/index.js); omit to skip validation with a notice",
      "  --out <path>         output path (default: market/index.json)",
      "  --dry-run            print the document instead of writing it",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv) {
  const options = { branch: "main", dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) usage(`${flag} needs a value`);
      index += 1;
      return next;
    };
    if (flag === "--repo") options.repo = value();
    else if (flag === "--branch") options.branch = value();
    else if (flag === "--index-url") options.indexUrl = value();
    else if (flag === "--timestamp") options.timestamp = value();
    else if (flag === "--validator") options.validator = value();
    else if (flag === "--out") options.out = value();
    else if (flag === "--verify") options.verify = value();
    else if (flag === "--dry-run") options.dryRun = true;
    else usage(`unknown flag ${flag}`);
  }
  return options;
}

function repositoryUrl(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    usage("--repo must be an absolute URL such as https://github.com/1378616343/dsh-zoom-viewer");
  }
  if (url.protocol !== "https:" || url.pathname.split("/").filter((part) => part !== "").length !== 2) {
    usage("--repo must be https://<host>/<owner>/<repository>");
  }
  return `${url.origin}${url.pathname.replace(/\.git$/u, "").replace(/\/+$/u, "")}`;
}

function rawIndexUrl(repo, branch) {
  const url = new URL(repo);
  return `https://raw.githubusercontent.com${url.pathname}/${branch}/market/index.json`;
}

function publishSeconds(text) {
  if (/^\d+$/u.test(text)) return Number(text);
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) usage("--timestamp must be Unix seconds or an ISO date");
  return Math.floor(parsed / 1000);
}

/** The registry's publish time for one exact version, in Unix seconds. */
async function registryPublishSeconds(name, version) {
  try {
    const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return undefined;
    const document = await response.json();
    const at = document?.time?.[version];
    return typeof at === "string" ? Math.floor(Date.parse(at) / 1000) : undefined;
  } catch {
    return undefined;
  }
}

async function loadChecker(validatorPath) {
  if (validatorPath === undefined) return undefined;
  try {
    return await import(pathToFileURL(path.resolve(validatorPath)).href);
  } catch (error) {
    throw new Error(
      `cannot load the market index checker at ${validatorPath}: ${error.message}\n` +
        "pass --validator <path to @deepseek-ai/dsh-plugin-market-index/lib/index.js> (see DISTRIBUTION.md)",
    );
  }
}

async function build(options, manifest) {
  const icon = await readFile(path.join(ROOT, "icon.svg"));
  const version = manifest.version;
  const publishTimestamp =
    options.timestamp !== undefined
      ? publishSeconds(options.timestamp)
      : await registryPublishSeconds(manifest.name, version);
  if (publishTimestamp === undefined) {
    process.stderr.write(
      `build-market-index: ${manifest.name}@${version} has no publish time in the registry yet; ` +
        "using the current time — rerun this script after publishing\n",
    );
  }
  const repo = options.repo === undefined ? undefined : repositoryUrl(options.repo);
  const entry = {
    name: manifest.name,
    title: TITLE,
    description: DESCRIPTION,
    icon: `data:${ICON_MEDIA_TYPE};base64,${icon.toString("base64")}`,
    author: AUTHOR,
    ...(repo === undefined ? {} : { homepage: `${repo}#readme`, repository: { url: repo } }),
    metadata: { category: CATEGORY, keywords: manifest.keywords, labels: Object.keys(LABELS) },
    versions: [
      {
        version,
        publishTimestamp: publishTimestamp ?? Math.floor(Date.now() / 1000),
        source: { type: "npm" },
      },
    ],
  };
  return {
    format: 1,
    title: TITLE,
    description: DESCRIPTION,
    metadata: { categories: CATEGORIES, labels: LABELS },
    plugins: [entry],
  };
}

function validate(checker, document, indexUrl, manifest) {
  if (checker === undefined) {
    process.stderr.write(
      "build-market-index: NOT validated (no --validator given); pass the host checker to verify format 1\n",
    );
    return undefined;
  }
  const parsed = checker.parseMarketIndex(document, indexUrl);
  const [version] = parsed.plugins[0].versions;
  return {
    validated: true,
    installSpec: checker.marketInstallTarget(parsed.plugins[0].name, version).spec,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const validatorPath = options.validator ?? DEFAULT_VALIDATOR;
  const manifest = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));

  if (options.verify !== undefined) {
    const indexUrl = options.indexUrl ?? (options.repo === undefined ? usage("--verify needs --index-url or --repo") : rawIndexUrl(repositoryUrl(options.repo), options.branch));
    const document = JSON.parse(await readFile(path.resolve(options.verify), "utf8"));
    const result = validate(await loadChecker(validatorPath), document, indexUrl, manifest);
    process.stdout.write(`valid format 1: ${options.verify}\ninstall spec: ${result.installSpec}\n`);
    return;
  }

  const document = await build(options, manifest);
  const indexUrl = options.indexUrl ?? (options.repo === undefined ? undefined : rawIndexUrl(repositoryUrl(options.repo), options.branch));
  if (indexUrl === undefined) usage("--repo or --index-url is required to build an index");
  const result = validate(await loadChecker(validatorPath), document, indexUrl, manifest);
  const text = `${JSON.stringify(document, null, 2)}\n`;
  if (options.dryRun) {
    process.stdout.write(text);
  } else {
    const out = path.resolve(options.out ?? path.relative(process.cwd(), DEFAULT_OUT));
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, text);
    process.stdout.write(`wrote ${out} (${text.length} bytes)\n`);
  }
  process.stdout.write(`index URL   : ${indexUrl}\ninstall spec: ${result?.installSpec ?? `${manifest.name}@${manifest.version}`}\n`);
  if (document.plugins[0].homepage === undefined) {
    process.stderr.write(
      "build-market-index: no --repo given, so homepage / repository are omitted from the entry\n",
    );
  }
}

await main();