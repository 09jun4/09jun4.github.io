import { describe, it, expect } from 'vitest';
import { SaveData, normalizeProgress, moreProgressed, emptyProgress } from '../src/core/save.js';
import { Settings, normalizeSettings } from '../src/core/settings.js';
import { DEFAULT_SETTINGS } from '../src/data/settings.js';

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
const win = (id, score, grade = 'A', time = 60) => ({ missionId: id, success: true, score, grade, time });

describe('진행도 저장', () => {
  it('순서대로 잠금 해제, 최고 점수·등급만 갱신, 실패는 기록하지 않는다', () => {
    const st = memStorage();
    const save = new SaveData(st);
    expect(save.isUnlocked('m1')).toBe(true);
    expect(save.isUnlocked('m2')).toBe(false);
    save.applyResult({ missionId: 'm1', success: false, score: 2000, grade: null, time: 30 });
    expect(save.isUnlocked('m2')).toBe(false);
    expect(save.applyResult(win('m1', 3300, 'A'))).toEqual({ newBest: true, firstClear: true });
    expect(save.isUnlocked('m2')).toBe(true);
    expect(save.isUnlocked('m3')).toBe(false);
    expect(save.applyResult(win('m1', 3000, 'B', 90))).toEqual({ newBest: false, firstClear: false });
    expect(save.record('m1')).toMatchObject({ bestScore: 3300, grade: 'A', bestTime: 60, clears: 2 });
    save.applyResult(win('m1', 3800, 'S', 40));
    expect(save.record('m1')).toMatchObject({ bestScore: 3800, grade: 'S', bestTime: 40 });
    // 다시 열어도 그대로
    const again = new SaveData(st);
    expect(again.record('m1').bestScore).toBe(3800);
    expect(JSON.parse(st.getItem('kf21.progress.guest')).v).toBe(1);
  });
  it('깨진 저장 데이터·옛 형식도 죽지 않고 읽는다', () => {
    expect(normalizeProgress(null)).toEqual(emptyProgress());
    expect(normalizeProgress({ missions: { m1: { bestScore: 'x', grade: 'Z' }, zz: { bestScore: 5 } } }).missions).toEqual({});
    const p = normalizeProgress({ missions: { m1: { bestScore: 3000.4, grade: 'B' } } });
    expect(p.missions.m1).toEqual({ bestScore: 3000, grade: 'B', bestTime: 0, clears: 1 });
    expect(new SaveData(memStorage({ 'kf21.progress.guest': '{broken' })).isUnlocked('m1')).toBe(true);
    expect(new SaveData(null).isUnlocked('m1')).toBe(true); // 저장소가 없어도 동작
  });
  it('첫 로그인: 게스트 진행을 계정으로 옮기고 게스트 칸을 비운다', async () => {
    const st = memStorage();
    const save = new SaveData(st);
    save.applyResult(win('m1', 3300));
    const written = [];
    expect(save.attachAccount('u1', null, async (p) => { written.push(JSON.parse(JSON.stringify(p))); })).toBe('guest');
    expect(save.record('m1').bestScore).toBe(3300);
    expect(written.length).toBe(1);
    expect(st.getItem('kf21.progress.guest')).toBe(null);
    save.detachAccount();
    expect(save.record('m1')).toBe(null); // 로그아웃하면 게스트(빈) 상태
    expect(save.isUnlocked('m2')).toBe(false);
  });
  it('충돌 시 더 진행된 쪽을 고른다', () => {
    const a = normalizeProgress({ missions: { m1: { bestScore: 3900, grade: 'S', clears: 1 } } });
    const b = normalizeProgress({ missions: { m1: { bestScore: 3000, grade: 'B', clears: 1 }, m2: { bestScore: 4000, grade: 'B', clears: 1 } } });
    expect(moreProgressed(a, b)).toBe(b);
    const st = memStorage();
    const save = new SaveData(st);
    save.applyResult(win('m1', 3900, 'S'));
    const writes = [];
    expect(save.attachAccount('u1', b, async (p) => writes.push(p))).toBe('remote');
    expect(save.isUnlocked('m3')).toBe(true);
    expect(save.record('m1').bestScore).toBe(3000);
    expect(writes.length).toBe(0); // 계정 쪽이 더 진행됐으면 덮어쓰지 않는다
    // 계정에 저장된 뒤의 기록은 writer로 나간다
    save.applyResult(win('m3', 5000));
    expect(writes.length).toBe(1);
  });
  it('계정 저장이 실패해도 게임은 계속되고 기기 사본이 남는다', async () => {
    const st = memStorage();
    const save = new SaveData(st);
    save.attachAccount('u2', null, () => Promise.reject(new Error('offline')));
    save.applyResult(win('m1', 3100));
    await new Promise((r) => setTimeout(r, 0));
    expect(save.syncError).toBe(true);
    expect(JSON.parse(st.getItem('kf21.progress.u2')).missions.m1.bestScore).toBe(3100);
    // 다음 로그인 때 기기 사본이 서버(빈 값)보다 앞서 있으면 그쪽을 쓰고 다시 올린다
    const save2 = new SaveData(st);
    const up = [];
    expect(save2.attachAccount('u2', null, async (p) => up.push(p))).toBe('local');
    expect(up.length).toBe(1);
  });
});

describe('설정', () => {
  it('기본값·범위 보정·저장', () => {
    expect(normalizeSettings({ mouseSensitivity: 99, quality: 'ultra', view: 'x' })).toMatchObject({ mouseSensitivity: 2, quality: 'high', view: 'chase' });
    const st = memStorage();
    const s = new Settings(st);
    expect(s.values).toEqual(DEFAULT_SETTINGS);
    let seen = null;
    s.onChange((k, v) => { seen = [k, v]; });
    s.set('mouseSensitivity', 1.5);
    expect(seen).toEqual(['mouseSensitivity', 1.5]);
    expect(new Settings(st).get('mouseSensitivity')).toBe(1.5);
    expect(st.getItem('kf21.progress.guest')).toBe(null); // 진행도와 다른 키
  });
});
