// mousekm 측정 설정 상수
// 거리 환산은 js/display.js에서 모니터 크기(PPI) 기준으로 계산한다.

export const TRACKING = {
  MOUSEMOVE_THROTTLE_MS: 60,   // 마우스 이동 측정 간격 (50~100ms 권장)
  WHEEL_DELTA_CAP: 150,        // wheel 1회당 스크롤 누적 상한 (px)
  IDLE_THRESHOLD_MS: 60_000,   // 이 시간 동안 입력 없으면 유휴로 판단
  SAVE_INTERVAL_MS: 5_000,     // 로컬 저장 주기
  UI_UPDATE_INTERVAL_MS: 600,  // 화면 숫자 갱신 주기
};
