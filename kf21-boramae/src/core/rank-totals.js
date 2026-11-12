// 랭킹 합산(순수 함수): 저장된 진행도에서 캠페인별·전체 점수를 계산한다.
//  - 캠페인 랭킹: 그 캠페인의 모든 미션을 클리어한 사람만 오른다. 점수 = 미션별 최고 점수 합
//  - 전체 랭킹: 클리어한 모든 미션의 최고 점수 합
import { MISSIONS } from '../data/missions.js';
import { CAMPAIGNS } from '../data/campaigns.js';

/** @returns {{overall:{score:number,missions:number}, campaigns:Record<string,{score:number,missions:number,total:number,complete:boolean}>}} */
export function rankTotals(progress) {
  const out = { overall: { score: 0, missions: 0 }, campaigns: {} };
  for (const c of CAMPAIGNS) out.campaigns[c.id] = { score: 0, missions: 0, total: 0, complete: false };
  for (const m of MISSIONS) {
    const c = out.campaigns[m.campaign];
    c.total++;
    const r = progress.missions[m.id];
    if (!r || !(r.clears > 0)) continue;
    c.score += r.bestScore; c.missions++;
    out.overall.score += r.bestScore; out.overall.missions++;
  }
  for (const c of Object.values(out.campaigns)) c.complete = c.total > 0 && c.missions === c.total;
  return out;
}
