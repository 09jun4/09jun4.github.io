// 사용자 설정: localStorage에 저장(진행도와는 별도 키). 형식이 바뀌어도 기본값으로 메워서 읽는다.
import { DEFAULT_SETTINGS, SETTINGS_VERSION, SETTING_RANGES } from '../data/settings.js';
import { STORAGE_PREFIX } from '../data/app.js';
import { clamp } from './math.js';

const KEY = `${STORAGE_PREFIX}.settings`;

/** 저장된 값을 검증해서 현재 형식으로 맞춘다. */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    const r = SETTING_RANGES.mouseSensitivity;
    if (Number.isFinite(raw.mouseSensitivity)) s.mouseSensitivity = clamp(raw.mouseSensitivity, r.min, r.max);
    if (raw.quality === 'high' || raw.quality === 'low') s.quality = raw.quality;
    if (typeof raw.autoQuality === 'boolean') s.autoQuality = raw.autoQuality;
    if (Number.isInteger(raw.qualityStep) && raw.qualityStep >= 0) s.qualityStep = raw.qualityStep;
    if (typeof raw.cameraShake === 'boolean') s.cameraShake = raw.cameraShake;
    if (raw.view === 'chase' || raw.view === 'cockpit') s.view = raw.view;
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
