// 목표 종류 레지스트리 (mission JSON의 objectives[].type → 클래스). 새 미션 목표는 여기에 추가.
import { DownloadObjective } from './DownloadObjective.js';
import { ExtractObjective } from './ExtractObjective.js';

export const OBJECTIVES = { download: DownloadObjective, extract: ExtractObjective };
