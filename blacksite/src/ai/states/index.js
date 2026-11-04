// AI 상태 레지스트리: Patrol → Suspicious → Alert → Combat → Search → Patrol
import { Patrol } from './Patrol.js';
import { Suspicious } from './Suspicious.js';
import { Alert } from './Alert.js';
import { Combat } from './Combat.js';
import { Search } from './Search.js';
import { Down } from './Down.js';

export const STATES = { patrol: Patrol, suspicious: Suspicious, alert: Alert, combat: Combat, search: Search, down: Down };
