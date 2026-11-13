// 사용자 설정: localStorage에 저장(진행도와는 별도 키). 형식이 바뀌어도 기본값으로 메워서 읽는다.
import { DEFAULT_SETTINGS, SETTINGS_VERSION, SETTING_RANGES, PAINTS } from '../data/settings.js';
import { STORAGE_PREFIX } from '../data/app.js';
import { clamp } from './math.js';

const KEY = `${STORAGE_PREFIX}.settings`;

/** 저장된 값을 검증해서 현재 형식으로 맞춘다. */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    const r = SETTING_RANGES.mouseSensitivity;
    if (Number.isFinite(raw.mouseSensitivity)) s.mouseSensitivity = clamp(raw.mouseSensitivity, r.min, r.max);
    if (typeof raw.autoQuality === 'boolean') s.autoQuality = raw.autoQuality;
    if (typeof raw.cameraShake === 'boolean') s.cameraShake = raw.cameraShake;
    if (raw.view === 'chase' || raw.view === 'cockpit') s.view = raw.view;
    for (const k of ['steerSens', 'stickSens', 'gyroSens', 'volume', 'musicVolume']) if (Number.isFinite(raw[k])) s[k] = clamp(raw[k], SETTING_RANGES[k].min, SETTING_RANGES[k].max);
    for (const k of ['steerEnabled', 'steerInvertY', 'gyro', 'gyroInvert', 'tutorialDone', 'bombTutorialDone', 'mobileHighOk', 'sound', 'music']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (['auto', 'pc', 'mobile'].includes(raw.inputMode)) s.inputMode = raw.inputMode;
    // v1의 quality('high'|'low')는 의미가 달랐다(둘 다 로우폴리). v2부터만 그대로 읽고, 옛 값이면 벤치마크로 다시 고른다.
    if (raw.v >= 2) {
      if (['low', 'high', 'ultra', 'min'].includes(raw.quality)) s.quality = raw.quality;
      if (typeof raw.benchmarked === 'boolean') s.benchmarked = raw.benchmarked;
      if (PAINTS.some((p) => p.id === raw.paint)) s.paint = raw.paint;
      if (typeof raw.skipTakeoff === 'boolean') s.skipTakeoff = raw.skipTakeoff;
    }
  }
  s.v = SETTINGS_VERSION;
  return s;
}

export class Settings {
  /** @param {Storage|null} storage localStorage(없으면 메모리만) */
  constructor(storage) {
    this.storage = storage;
    this.listeners = [];
    let raw = null;
    try { raw = JSON.parse(storage ? storage.getItem(KEY) : 'null'); } catch (e) { raw = null; }
    this.values = normalizeSettings(raw);
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values = normalizeSettings({ ...this.values, [key]: value });
    this.save();
    for (const fn of this.listeners) fn(key, this.values[key]);
  }

  /** 계정에서 불러온 설정으로 통째로 바꾼다. */
  replace(raw) {
    this.values = normalizeSettings(raw);
    this.save();
    for (const fn of this.listeners) fn('*', this.values);
  }

  save() {
    try { if (this.storage) this.storage.setItem(KEY, JSON.stringify(this.values)); } catch (e) { /* 저장 공간 문제는 무시 */ }
  }

  onChange(fn) {
    this.listeners.push(fn);
  }
}

/** localStorage를 쓸 수 없는 환경(사생활 보호 모드 등)에서도 죽지 않게 */
export function safeStorage() {
  try {
    const s = window.localStorage;
    const k = `${STORAGE_PREFIX}.__probe`;
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch (e) {
    return null;
  }
}
