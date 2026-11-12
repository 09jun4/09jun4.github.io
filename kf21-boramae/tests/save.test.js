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
  it('잠금 없음, 최고 점수·등급만 갱신, 실패는 기록하지 않는다', () => {
    const st = memStorage();
    const save = new SaveData(st);
    expect(save.isUnlocked('c1m1')).toBe(true);
    expect(save.isUnlocked('c1m2')).toBe(true); // 모든 미션을 처음부터 고를 수 있다
    expect(save.isUnlocked('zz')).toBe(false);
    save.applyResult({ missionId: 'c1m1', success: false, score: 2000, grade: null, time: 30 });
    expect(save.record('c1m1')).toBe(null);
    expect(save.applyResult(win('c1m1', 3300, 'A'))).toEqual({ newBest: true, firstClear: true });
    expect(save.applyResult(win('c1m1', 3000, 'B', 90))).toEqual({ newBest: false, firstClear: false });
    expect(save.record('c1m1')).toMatchObject({ bestScore: 3300, grade: 'A', bestTime: 60, clears: 2 });
    save.applyResult(win('c1m1', 3800, 'S', 40));
    expect(save.record('c1m1')).toMatchObject({ bestScore: 3800, grade: 'S', bestTime: 40 });
    // 다시 열어도 그대로
    const again = new SaveData(st);
    expect(again.record('c1m1').bestScore).toBe(3800);
    expect(JSON.parse(st.getItem('kf21.progress.guest')).v).toBe(2);
  });
  it('깨진 저장 데이터·옛 형식도 죽지 않고 읽는다', () => {
    expect(normalizeProgress(null)).toEqual(emptyProgress());
    expect(normalizeProgress({ missions: { c1m1: { bestScore: 'x', grade: 'Z' }, zz: { bestScore: 5 } } }).missions).toEqual({});
    const p = normalizeProgress({ missions: { c1m1: { bestScore: 3000.4, grade: 'B' } } });
    expect(p.missions.c1m1).toEqual({ bestScore: 3000, grade: 'B', bestTime: 0, clears: 1 });
    expect(new SaveData(memStorage({ 'kf21.progress.guest': '{broken' })).isUnlocked('c1m1')).toBe(true);
    expect(new SaveData(null).isUnlocked('c1m1')).toBe(true); // 저장소가 없어도 동작
  });
  it('v1 저장(m1~m3)을 새 미션 ID로 옮긴다(기기 저장·계정 저장 공통)', () => {
    const v1 = { v: 1, missions: { m1: { bestScore: 3300, grade: 'A', bestTime: 61, clears: 2 }, m3: { bestScore: 5200, grade: 'B', bestTime: 140, clears: 1 } }, updatedAt: 5 };
    const p = normalizeProgress(v1);
    expect(p.v).toBe(2);
    expect(p.missions).toEqual({ c1m1: { bestScore: 3300, grade: 'A', bestTime: 61, clears: 2 }, c1m3: { bestScore: 5200, grade: 'B', bestTime: 140, clears: 1 } });
    // 기기 저장: 열면 바로 새 ID로 읽힌다
    const save = new SaveData(memStorage({ 'kf21.progress.guest': JSON.stringify(v1) }));
    expect(save.record('c1m1').bestScore).toBe(3300);
    // 계정 저장: 로그인 때 한 번 변환되고, 다음 기록부터 새 형식으로 올라간다
    const s2 = new SaveData(memStorage());
    const writes = [];
    expect(s2.attachAccount('u9', v1, async (x) => writes.push(JSON.parse(JSON.stringify(x))))).toBe('remote');
    expect(s2.record('c1m3').bestScore).toBe(5200);
    s2.applyResult(win('c1m2', 4100));
    expect(Object.keys(writes[writes.length - 1].missions).sort()).toEqual(['c1m1', 'c1m2', 'c1m3']);
    // 옛 ID와 새 ID가 함께 있으면 점수가 높은 쪽
    expect(normalizeProgress({ missions: { m1: { bestScore: 3000, grade: 'B' }, c1m1: { bestScore: 3600, grade: 'S' } } }).missions.c1m1.bestScore).toBe(3600);
  });
  it('첫 로그인: 게스트 진행을 계정으로 옮기고 게스트 칸을 비운다', async () => {
    const st = memStorage();
    const save = new SaveData(st);
    save.applyResult(win('c1m1', 3300));
    const written = [];
    expect(save.attachAccount('u1', null, async (p) => { written.push(JSON.parse(JSON.stringify(p))); })).toBe('guest');
    expect(save.record('c1m1').bestScore).toBe(3300);
    expect(written.length).toBe(1);
    expect(st.getItem('kf21.progress.guest')).toBe(null);
    save.detachAccount();
    expect(save.record('c1m1')).toBe(null); // 로그아웃하면 게스트(빈) 상태
  });
  it('충돌 시 더 진행된 쪽을 고른다', () => {
    const a = normalizeProgress({ missions: { c1m1: { bestScore: 3900, grade: 'S', clears: 1 } } });
    const b = normalizeProgress({ missions: { c1m1: { bestScore: 3000, grade: 'B', clears: 1 }, c1m2: { bestScore: 4000, grade: 'B', clears: 1 } } });
    expect(moreProgressed(a, b)).toBe(b);
    const st = memStorage();
    const save = new SaveData(st);
    save.applyResult(win('c1m1', 3900, 'S'));
    const writes = [];
    expect(save.attachAccount('u1', b, async (p) => writes.push(p))).toBe('remote');
    expect(save.record('c1m2').bestScore).toBe(4000);
    expect(save.record('c1m1').bestScore).toBe(3000);
    expect(writes.length).toBe(0); // 계정 쪽이 더 진행됐으면 덮어쓰지 않는다
    // 계정에 저장된 뒤의 기록은 writer로 나간다
    save.applyResult(win('c1m3', 5000));
    expect(writes.length).toBe(1);
  });
  it('계정 저장이 실패해도 게임은 계속되고 기기 사본이 남는다', async () => {
    const st = memStorage();
    const save = new SaveData(st);
    save.attachAccount('u2', null, () => Promise.reject(new Error('offline')));
    save.applyResult(win('c1m1', 3100));
    await new Promise((r) => setTimeout(r, 0));
    expect(save.syncError).toBe(true);
    expect(JSON.parse(st.getItem('kf21.progress.u2')).missions.c1m1.bestScore).toBe(3100);
    // 다음 로그인 때 기기 사본이 서버(빈 값)보다 앞서 있으면 그쪽을 쓰고 다시 올린다
    const save2 = new SaveData(st);
    const up = [];
    expect(save2.attachAccount('u2', null, async (p) => up.push(p))).toBe('local');
    expect(up.length).toBe(1);
  });
});

describe('설정', () => {
  it('기본값·범위 보정·저장', () => {
    expect(normalizeSettings({ v: 2, mouseSensitivity: 99, quality: 'weird', view: 'x', paint: 'pink' })).toMatchObject({ mouseSensitivity: 2, quality: 'low', view: 'chase', paint: 'grey' });
    // v1의 품질 값은 의미가 달라서 버리고 벤치마크를 다시 하게 한다
    expect(normalizeSettings({ v: 1, quality: 'high', mouseSensitivity: 1.3 })).toMatchObject({ quality: 'low', benchmarked: false, mouseSensitivity: 1.3 });
    expect(normalizeSettings({ v: 2, quality: 'ultra', benchmarked: true, paint: 'urban', skipTakeoff: true })).toMatchObject({ quality: 'ultra', benchmarked: true, paint: 'urban', skipTakeoff: true });
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
