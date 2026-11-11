// 비행 모델(순수 로직, 렌더링과 무관). 상태 = 위치·요·피치·시각 롤·속도.
// 입력: pitch(-1 기수 내림 ~ +1 기수 올림), turn(-1 좌 ~ +1 우).
// 앞 = -z. 요는 위에서 볼 때 반시계가 +, 그래서 우선회는 요가 줄어든다.
import * as THREE from 'three';
import { DEG, clamp, clamp01, damp, remapClamped, wrapAngle } from '../core/math.js';

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export function createFlightState() {
  return {
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    forward: new THREE.Vector3(0, 0, -1),
    yaw: 0,
    pitch: 0,
    roll: 0, // 오른쪽으로 기울면 +
    speed: 0,
    pitchRate: 0,
    yawRate: 0, // 우선회 +
    throttle: 0.5, // 배기 연출용(0~1)
    slow: 0, // 실속 영역 진입 정도(0~1)
    limit: 0, // 고도 한계가 개입 중이면 -1(하한) / +1(상한)
  };
}

export function resetFlight(s, cfg, { x = 0, y = cfg.altitude.start, z = 0, yaw = 0 } = {}) {
  s.pos.set(x, y, z);
  s.yaw = yaw;
  s.pitch = 0;
  s.roll = 0;
  s.speed = cfg.speed.cruise;
  s.pitchRate = 0;
  s.yawRate = 0;
  s.throttle = 0.5;
  s.slow = 0;
  s.limit = 0;
  updateOrientation(s);
  return s;
}

export function updateOrientation(s) {
  _euler.set(s.pitch, s.yaw, -s.roll, 'YXZ');
  s.quat.setFromEuler(_euler);
  const cp = Math.cos(s.pitch);
  s.forward.set(-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp);
}

/** 한 스텝 진행. 할당 없음. */
export function stepFlight(s, input, cfg, dt) {
  const sp = cfg.speed;
  const r = cfg.rates;
  const pitchMax = r.pitchMax * DEG;
  const yawMax = r.yawMax * DEG;
  const pitchLimit = r.pitchLimit * DEG;

  // 속도 하한 근처: 기수 올림 권한이 줄고 기수가 숙여진다
  const slow = 1 - clamp01((s.speed - sp.min) / cfg.stall.margin);
  s.slow = slow;

  // 피치 목표 각속도
  let pitchTarget;
  if (input.pitch !== 0) {
    pitchTarget = input.pitch * pitchMax;
    if (input.pitch > 0) pitchTarget *= 1 - slow * cfg.stall.authorityLoss;
  } else {
    const maxLevel = cfg.autoLevel.pitchMaxRate * DEG;
    pitchTarget = clamp(-s.pitch * cfg.autoLevel.pitchGain, -maxLevel, maxLevel);
  }
  if (s.pitch > 0) pitchTarget -= slow * cfg.stall.noseDropRate * DEG * clamp01(s.pitch / (10 * DEG));

  // 고도 한계: 허용 피치 범위를 좁혀서 부드럽게 되돌린다
  const al = cfg.altitude;
  const minPitch = remapClamped(s.pos.y, al.floorHard, al.floorSoft, al.floorPitch * DEG, -pitchLimit);
  const maxPitch = remapClamped(s.pos.y, al.ceilSoft, al.ceilHard, pitchLimit, al.ceilPitch * DEG);
  s.limit = 0;
  if (s.pitch < minPitch) {
    pitchTarget = Math.max(pitchTarget, Math.min((minPitch - s.pitch) * al.gain, pitchMax));
    s.limit = -1;
  } else if (s.pitch > maxPitch) {
    pitchTarget = Math.min(pitchTarget, Math.max((maxPitch - s.pitch) * al.gain, -pitchMax));
    s.limit = 1;
  }

  const res = cfg.response;
  s.pitchRate = damp(s.pitchRate, pitchTarget, input.pitch !== 0 || s.limit !== 0 ? res.pitchTau : res.releaseTau, dt);
  s.pitch += s.pitchRate * dt;
  if (s.pitch > pitchLimit) { s.pitch = pitchLimit; if (s.pitchRate > 0) s.pitchRate = 0; }
  if (s.pitch < -pitchLimit) { s.pitch = -pitchLimit; if (s.pitchRate < 0) s.pitchRate = 0; }

  // 선회: 속도와 자세에 따라 성능이 소폭 달라진다
  const dev = (s.speed - cfg.turn.cornerSpeed) / (sp.max - cfg.turn.cornerSpeed);
  const turnFactor = 1 - cfg.turn.speedPenalty * clamp01(dev * dev) - cfg.turn.pitchPenalty * Math.abs(Math.sin(s.pitch));
  s.yawRate = damp(s.yawRate, input.turn * yawMax * turnFactor, input.turn !== 0 ? res.yawTau : res.releaseTau, dt);
  s.yaw = wrapAngle(s.yaw - s.yawRate * dt);

  // 시각 롤: 선회율을 따라간다(별도 조작 아님)
  s.roll = damp(s.roll, (s.yawRate / yawMax) * r.rollMax * DEG, res.rollTau, dt);

  // 속도: 순항속도 스프링 + 중력 성분 + 기동 항력
  const e = cfg.energy;
  const turnLoad = s.yawRate / yawMax;
  const pitchLoad = s.pitchRate / pitchMax;
  const accel = e.speedSpring * (sp.cruise - s.speed)
    - e.g * e.gravityFactor * Math.sin(s.pitch)
    - e.turnDrag * turnLoad * turnLoad
    - e.pitchDrag * pitchLoad * pitchLoad;
  s.speed = clamp(s.speed + accel * dt, sp.min, sp.max);
  s.throttle = damp(s.throttle, clamp01(0.5 + (sp.cruise - s.speed) / (sp.cruise - sp.min) * 0.5 + Math.max(0, Math.sin(s.pitch)) * 0.5), 0.4, dt);

  updateOrientation(s);
  s.pos.addScaledVector(s.forward, s.speed * dt);
  if (s.pos.y < al.floorHard) s.pos.y = al.floorHard;
  if (s.pos.y > al.ceilHard) s.pos.y = al.ceilHard;
  return s;
}
