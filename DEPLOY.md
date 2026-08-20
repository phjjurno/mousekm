
## 7. 응원 게시판 · 플레이리스트 (2026-07-27 오픈)
**게시판**: Firestore 규칙 배포 완료(`mousekm_wall`). 익명 로그인이 꺼져 있어도 형식 검증을 통과하면 글쓰기가 됩니다.
- 익명 로그인을 켜면(Firebase 콘솔 → Authentication → Sign-in method → 익명) 자동으로 업그레이드되어 **본인 글 삭제**가 가능해집니다. 안 켜도 게시판은 정상 동작합니다.
- 욕설·광고·개인정보는 클라이언트 필터가 자동 차단하고, 저장된 글도 화면에서 마스킹합니다.

**플레이리스트**: Shutress와 동일 방식(PULSE ORIGIN 69% 우선 랜덤). 측정 시작 시 자동 재생, 곡 종료 시 다음 곡, 유튜브 링크 직접 재생 지원.
- `netlify/functions/pulse-tracks.js`가 @PULSEORIGN 채널 **`/videos` 탭**을 읽어 롱폼만 내려줍니다(Netlify 배포 시 자동 동작, 로컬은 404 → `data/pulse-tracks.json` → 내장 폴백 순으로 사용).

### 플레이리스트 자동 최신화 (GitHub Actions)
채널 최신화는 **이중화**되어 있습니다. 요청 시점의 Netlify Function이 1순위,
빌드 타임에 갱신되는 `data/pulse-tracks.json` 이 2순위입니다.
(과거에 Functions가 배포를 깨뜨린 적이 있어 빌드 타임 방식만 남겨뒀었습니다.
 다시 붙였으니 배포 실패가 재발하면 `netlify/functions/` 와 netlify.toml 의
 `[functions]` 블록만 지우면 JSON 방식으로 되돌아갑니다.)
- `.github/workflows/update-playlist.yml`이 6시간마다 `scripts/update-pulse-tracks.mjs`를 실행 → @PULSEORIGN `/videos` 탭에서 최신 롱폼(쇼츠 제외)을 모아 `data/pulse-tracks.json` 갱신 → 변경 시 커밋 → **Netlify 자동 배포**.
- RSS(`feeds/videos.xml`)는 최근 15개만 담기는데 이 채널은 대부분이 쇼츠라 보조 소스로만 씁니다. 또 유튜브는 봇 티 나는 User-Agent에 404를 주니 브라우저 UA를 유지하세요.
- 사이트는 이 JSON을 읽습니다(서버 함수 불필요, 실패해도 내장 목록으로 동작).
- 수동 실행: GitHub → Actions → "플레이리스트 최신화" → Run workflow. 또는 `gh workflow run update-playlist.yml`
- 커밋이 안 되면: GitHub → Settings → Actions → General → Workflow permissions를 **Read and write**로.
