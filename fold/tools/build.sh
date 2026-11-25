#!/bin/bash
# 스테이지 빌드: 설계 스크립트 → 풀이 저장 → 검증
cd "$(dirname "$0")/.." && node tools/ch2.mjs && node tools/ch3.mjs && node tools/ch4.mjs && node tools/solutions.mjs && node tests/run.js
