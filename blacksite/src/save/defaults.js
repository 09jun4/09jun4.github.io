// 저장 데이터 기본값과 병합 규칙.
import { DEFAULT_BINDINGS } from '../input/KeyBindings.js';

export const DIFFS = ['easy', 'normal', 'hard'];

export function defaultSettings() {
  return {
    graphics: { preset: 'medium', resolutionScale: 0.9, shadows: true, showFps: false },
    audio: { master: 0.8, sfx: 1.0, music: 0.6, ambience: 0.7 },
    controls: { sensitivity: 1.0, aimSensitivity: 0.7, invertY: false },
    display: { fov: 90, shake: 1.0 },
    keyBindings: { ...DEFAULT_BINDINGS },
  };
}

export function defaultData() {
  return {
    settings: defaultSettings(),
    records: Object.fromEntries(DIFFS.map((d) => [d, { bestTimeSec: 0, clears: 0 }])),
    readLogs: [],
  };
}

// 알 수 없는 키·잘못된 값은 버리고 기본값으로 채운다
export function normalize(raw) {
  const def = defaultData();
  if (!raw || typeof raw !== 'object') return def;
  const s = raw.settings || {};
  for (const group of ['graphics', 'audio', 'controls', 'display', 'keyBindings']) {
    const src = s[group];
    if (!src || typeof src !== 'object') continue;
    for (const k of Object.keys(def.settings[group])) {
      if (typeof src[k] === typeof def.settings[group][k]) def.settings[group][k] = src[k];
    }
  }
  const r = raw.records || {};
  for (const d of DIFFS) {
    const v = r[d] || {};
    if (typeof v.bestTimeSec === 'number' && v.bestTimeSec > 0) def.records[d].bestTimeSec = v.bestTimeSec;
    if (Number.isInteger(v.clears) && v.clears > 0) def.records[d].clears = v.clears;
  }
  if (Array.isArray(raw.readLogs)) def.readLogs = [...new Set(raw.readLogs.filter((x) => typeof x === 'string' && x.length < 40))].slice(0, 100);
  return def;
}

// 게스트 → 계정 이전: 기록은 더 좋은 값, 로그는 합집합, 설정은 계정 쪽(없으면 게스트)
export function mergeData(account, guest, accountHasSettings) {
  const out = normalize(account);
  const g = normalize(guest);
  if (!accountHasSettings) out.settings = g.settings;
  for (const d of DIFFS) {
    const a = out.records[d], b = g.records[d];
    if (b.bestTimeSec > 0 && (a.bestTimeSec === 0 || b.bestTimeSec < a.bestTimeSec)) a.bestTimeSec = b.bestTimeSec;
    a.clears = Math.max(a.clears, b.clears);
  }
  out.readLogs = [...new Set([...out.readLogs, ...g.readLogs])];
  return out;
}

export function isEmptyProgress(data) {
  return !data.readLogs.length && DIFFS.every((d) => !data.records[d].clears);
}
