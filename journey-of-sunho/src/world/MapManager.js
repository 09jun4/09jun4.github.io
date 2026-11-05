// MapManager — 맵 데이터 파일(assets/maps/*.json)을 읽어 검증해요.
// 게임 시스템은 맵 '데이터'만 알고, 이미지는 미니맵 배경으로만 써요.
// 실제 지도 이미지를 적용할 때: 이미지 위에서 도로 중심선을 미터 단위 좌표로 옮겨 roads[]에 적고,
// image / imageBounds(이미지가 덮는 월드 범위)를 채우면 돼요. (README '지도 교체' 참고)
import { loadJSON } from '../core/utils.js';

export class MapManager {
  constructor() { this.maps = new Map(); }

  async load(id, url) {
    const data = await loadJSON(url);
    this.validate(data);
    if (data.image) {
      data._image = await new Promise((res) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => { console.warn('[map] 지도 이미지를 불러오지 못했어요:', data.image); res(null); };
        img.src = new URL(data.image, new URL(url, location.href)).href;
      });
    }
    this.maps.set(id, data);
    return data;
  }

  validate(m) {
    if (!Array.isArray(m.roads) || !m.roads.length) throw new Error('맵에 roads가 없어요');
    for (const r of m.roads) {
      if (!r.id || !Array.isArray(r.points) || r.points.length < 2) throw new Error(`도로 데이터 오류: ${r.id}`);
      if (!(r.width > 2)) throw new Error(`도로 폭 오류: ${r.id}`);
    }
    if (!m.routes || !Object.keys(m.routes).length) throw new Error('맵에 routes(코스)가 없어요');
    if (!m.bounds) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const r of m.roads) for (const [x, z] of r.points) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
      m.bounds = { minX: minX - 60, maxX: maxX + 60, minZ: minZ - 60, maxZ: maxZ + 60 };
    }
  }

  get(id) { return this.maps.get(id); }
}
