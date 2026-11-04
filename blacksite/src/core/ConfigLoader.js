// JSON 설정 파일 로더. 모든 수치·배치·색상은 public/config/ 아래 JSON에서 읽어요.
const BASE = new URL('./public/config/', document.baseURI);
const cache = new Map();

export async function loadConfig(path) {
  if (cache.has(path)) return cache.get(path);
  // 단일 파일 빌드(아티팩트)에서는 설정을 페이지에 내장한다
  const inline = window.__BLACKSITE_CONFIGS__;
  if (inline && inline[path]) return structuredClone(inline[path]);
  const p = fetch(new URL(path, BASE), { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`config ${path}: HTTP ${r.status}`);
    return r.json();
  });
  cache.set(path, p);
  try { return await p; } catch (e) { cache.delete(path); throw e; }
}

// 여러 설정을 한 번에: { key: 'path.json' } → { key: data }
export async function loadConfigs(spec) {
  const keys = Object.keys(spec);
  const vals = await Promise.all(keys.map((k) => loadConfig(spec[k])));
  return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
}

export const assetUrl = (path) => new URL(path, new URL('./public/', document.baseURI)).href;
