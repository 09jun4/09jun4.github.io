// 캠페인 목록. 잠금은 없다: 모든 캠페인·미션을 처음부터 고를 수 있고, recommended는 표시만 한다.
export const CAMPAIGNS = [
  { id: 'c1', order: 1, title: '제공권 확보', codename: 'AIR SUPERIORITY', timeOfDay: 'day', summary: '영공으로 들어오는 적기를 요격해 하늘을 지킨다.', recommended: '처음이라면 여기부터' },
  { id: 'c2', order: 2, title: '새벽 타격', codename: 'DAWN STRIKE', timeOfDay: 'dawn', summary: '동이 트기 전, 적의 레이더와 통신 거점을 폭격한다.', recommended: '제공권 확보 평균 B 이상 권장' },
  { id: 'c3', order: 3, title: '해상 방어', codename: 'SEA SHIELD', timeOfDay: 'dusk', summary: '해안으로 접근하는 수송기·함정·폭격기를 막는다.', recommended: '새벽 타격 평균 B 이상 권장' },
  { id: 'c4', order: 4, title: '야간 침투', codename: 'NIGHT RAID', timeOfDay: 'night', summary: '어둠을 틈타 방공망을 뚫고 핵심 시설을 무력화한다.', recommended: '해상 방어 평균 B 이상 권장' },
  { id: 'c5', order: 5, title: '최종 작전', codename: 'FINAL HOUR', timeOfDay: 'dusk', summary: '방공망 제압부터 적 에이스와의 결전까지.', recommended: '야간 침투 평균 A 이상 권장' },
];
export const campaignById = (id) => CAMPAIGNS.find((c) => c.id === id) || null;
