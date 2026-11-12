// 미션 데이터 검증(순수): 참조가 맞는지, 빠진 값이 없는지. tests/missions.test.js와 ?debug=1 시작 때 쓴다.
import { OBJ } from './engine.js';

const OBJ_TYPES = new Set(Object.values(OBJ));

/**
 * @param {object[]} missions @param {object[]} campaigns
 * @param {{targets?:object, personalities?:object, timeOfDay?:object}} refs 참조 대상(없으면 그 검사는 건너뛴다)
 * @returns {string[]} 문제 목록(비어 있으면 통과)
 */
export function validateMissions(missions, campaigns, refs = {}) {
  const errs = [];
  const ids = new Set();
  const camp = new Set(campaigns.map((c) => c.id));
  for (const m of missions) {
    const at = `미션 ${m.id}`;
    if (!m.id || ids.has(m.id)) errs.push(`${at}: id가 없거나 겹친다`);
    ids.add(m.id);
    if (!camp.has(m.campaign)) errs.push(`${at}: 캠페인 ${m.campaign} 없음`);
    if (!m.title || !m.brief) errs.push(`${at}: title·brief 필요`);
    if (!(m.refTime > 0)) errs.push(`${at}: refTime 필요`);
    if (refs.timeOfDay && !refs.timeOfDay[m.timeOfDay]) errs.push(`${at}: 시간대 ${m.timeOfDay} 없음`);
    if (!Array.isArray(m.objectives) || !m.objectives.length) { errs.push(`${at}: 목표 없음`); continue; }
    const oids = new Set();
    let required = 0;
    const targetTypes = new Map();
    for (const t of m.groundTargets || []) {
      if (refs.targets && !refs.targets[t.type]) errs.push(`${at}: 지상 목표 종류 ${t.type} 없음`);
      if (!t.pos && !t.near) errs.push(`${at}: 지상 목표 ${t.type}에 pos나 near 필요`);
      if (t.near && !(m.groundTargets || []).some((x) => x.id === t.near)) errs.push(`${at}: near ${t.near} 없음`);
      targetTypes.set(t.type, (targetTypes.get(t.type) || 0) + (t.count || 1));
    }
    const roles = new Map();
    for (const w of m.waves || []) {
      const n = w.count ?? w.flight;
      if (!(n > 0)) errs.push(`${at}: 편대 수량 필요`);
      if (refs.personalities) for (const p of [].concat(w.personality || [])) if (!refs.personalities[p]) errs.push(`${at}: 성격 ${p} 없음`);
      const role = w.role || 'fighter';
      roles.set(role, (roles.get(role) || 0) + n);
    }
    for (const o of m.objectives) {
      const oa = `${at} 목표 ${o.id}`;
      if (!o.id || oids.has(o.id)) errs.push(`${oa}: id가 없거나 겹친다`);
      oids.add(o.id);
      if (!OBJ_TYPES.has(o.type)) errs.push(`${oa}: 유형 ${o.type} 없음`);
      if (!(o.points > 0)) errs.push(`${oa}: points 필요`);
      if (o.required !== false) required++;
      for (const pre of [].concat(o.after || [])) if (!m.objectives.some((x) => x.id === pre)) errs.push(`${oa}: after ${pre} 없음`);
      const count = o.count || 1;
      if (o.type === OBJ.DESTROY) {
        const have = o.targetType ? targetTypes.get(o.targetType) || 0 : [...targetTypes.values()].reduce((a, b) => a + b, 0);
        if (have < count) errs.push(`${oa}: 지상 목표 ${o.targetType || ''}가 ${have}개뿐(필요 ${count})`);
        if (!(m.weapons && m.weapons.bomb > 0)) errs.push(`${oa}: 지상 미션인데 폭탄이 없다`);
      }
      if (o.type === OBJ.CHECKPOINTS && (m.checkpoints || []).length < count) errs.push(`${oa}: 체크포인트가 부족하다`);
      if (o.type === OBJ.TIMED_KILL && !(o.timeLimit > 0)) errs.push(`${oa}: timeLimit 필요`);
      if ([OBJ.KILL_AIR, OBJ.TIMED_KILL, OBJ.INTERCEPT, OBJ.BOSS].includes(o.type)) {
        const role = o.role || { killAir: 'fighter', timedKill: 'fighter', boss: 'boss', intercept: 'transport' }[o.type];
        if ((roles.get(role) || 0) < count) errs.push(`${oa}: ${role} ${roles.get(role) || 0}대뿐(필요 ${count})`);
      }
    }
    if (!required) errs.push(`${at}: 필수 목표가 하나는 있어야 한다`);
  }
  for (const c of campaigns) if (!missions.some((m) => m.campaign === c.id)) errs.push(`캠페인 ${c.id}: 미션 없음`);
  return errs;
}
