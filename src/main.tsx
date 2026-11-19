import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { TechNode, Taxonomy } from "./types";
import "./styles.css";

// Data lives in /data and is fetched at runtime, so content updates never touch the code.
// The build stamps a content hash into <meta name="data-version"> for cache busting, and
// index.html preloads both files so they download in parallel with this script.
const version = document.querySelector<HTMLMetaElement>('meta[name="data-version"]')?.content ?? "dev";
const load = <T,>(file: string) =>
  fetch(`data/${file}?v=${version}`).then((r) => {
    if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });

const root = createRoot(document.getElementById("root")!);

Promise.all([load<Taxonomy>("taxonomy.json"), load<TechNode[]>("nodes.json")])
  .then(([taxonomy, nodes]) => root.render(<App taxonomy={taxonomy} initialNodes={nodes} />))
  .catch((err: Error) => {
    document.getElementById("root")!.innerHTML =
      `<p class="boot-error">数据加载失败 / Failed to load data: ${err.message.replace(/</g, "&lt;")}</p>`;
  });
