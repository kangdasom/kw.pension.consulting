# GitHub Pages 배포

대상 저장소: https://github.com/kangdasom/kw.pension.consulting

예상 주소: https://kangdasom.github.io/kw.pension.consulting/

2026-11-11 준비 중 동일 저장소(ID 1317770573)의 이름이 `AI-`에서 `kw.pension.consulting`으로 변경된 것을 확인했다. 기존 `/AI-/` 주소의 리디렉션은 보장하지 않으므로 현재 이름의 주소를 공유한다.

현재 앱은 빌드 없는 HTML/CSS/JavaScript다. 화면·데이터·스타일을 변환하지 않고 실행에 필요한 파일만 `.pages-dist`로 복사해 배포한다. HTML/CSS의 상대경로를 유지하므로 `/AI-/`에서 동작하며 React/Vite 설정은 필요하지 않다. 화면 전환은 한 HTML 안의 탭·팝업 방식이라 SPA fallback도 필요하지 않다.

## GitHub에서 처음 한 번 설정

1. 저장소 Settings → Pages를 연다.
2. Build and deployment → Source를 **GitHub Actions**로 선택한다.
3. Pages 사용이 요금제 때문에 제한되면, 비공개 저장소를 지원하는 GitHub 요금제를 사용하거나 공개 범위를 검토한 뒤 사용자가 직접 저장소를 Public으로 변경한다. 비공개 저장소라고 배포 페이지까지 비공개인 것은 아니다.
4. Settings → Actions → General에서 Actions가 허용되어 있는지 확인한다. 워크플로에는 필요한 최소 권한이 지정되어 있으며 개인 액세스 토큰이나 별도 Secrets 등록은 필요 없다.
5. Actions → Deploy GitHub Pages → Run workflow → main → Run workflow로 최초 배포 또는 실패한 배포를 재실행한다.
6. build와 deploy의 성공을 확인하고 위 주소로 접속한다. Environment 승인 요청이 있으면 배포를 승인한다.
7. Pages의 Enforce HTTPS가 제공되면 활성화한다.

그 이후 `main` 브랜치에 push할 때마다 검사 → 정적 파일 패키징 → 배포가 실행된다. 다른 브랜치의 push는 운영 페이지에 배포하지 않는다. 실패한 검사는 배포를 중단하며 이전 배포를 유지한다.

## 로컬 작업과 검증

`node scripts/prepare-pages.cjs --list`로 배포 파일과 경로 검증을 확인한다. `.pages-dist`는 생성 결과이며 Git에 올리지 않는다. 원본 웹 파일을 수정하고 변경 내역을 확인한 뒤 `git add`, `git commit`, `git push origin main`을 수행한다. `.gitignore`가 엑셀·내부 문서·QA 산출물·환경변수·키 파일을 제외한다. 새 실행 파일을 추가할 때는 상대경로로 참조하고 패키징 결과를 확인한다.

자동 검사는 알려진 인증키 형태와 비밀번호 등 하드코딩 패턴을 검사하며 완전한 보안 감사를 대신하지 않는다. 브라우저에 전달되는 JavaScript에는 비밀을 넣을 수 없다. 향후 서버 자격증명은 서버 측에서만 사용한다.

## 이번 배포의 기능 범위

- 네 번째 사용자관리 탭은 등록·권한·상태 화면을 미리 사용할 수 있는 단계다. 입력은 해당 브라우저의 `db-rate-user-drafts-v1`에만 저장되며 실제 계정·로그인·접근 제한에는 연결되지 않는다. 초대 링크 발급은 비활성화되어 있다. 실제 사용자 정보가 배포 파일이나 공개 저장소에 포함되지는 않는다.
- 기존 금리·초기 관리설정·화면과 기능을 그대로 배포한다. 이 데이터와 화면은 사이트 방문자가 열람할 수 있다.
- 원본 엑셀·PROJECT_BRIEF/CONTEXT·AGENTS·outputs·과거 대기 금리 파일·브라우저 localStorage는 업로드하지 않는다. 테스트와 fixture는 Git 저장소에만 포함하며 Pages 산출물에는 포함하지 않는다.
- 업로드 금리·제안가능·관리정보 저장은 **기기별 브라우저 한정**이다. 공지는 아래의 GitHub 게시 방식으로 전체 방문자에게 공유한다.
- 기존 로컬 주소의 브라우저 저장값은 GitHub Pages 주소로 자동 이전되지 않는다.
- 공지 게시는 아래의 GitHub 로그인·계정 검증을 사용한다. 사이트 전체의 직원 로그인 기능은 별도다.
- 실제 배포 성공은 Actions의 deploy 성공과 실제 URL의 HTTP/화면 확인 후에만 확정한다.

## 공지 작성 → GitHub 로그인 → 자동 배포

공식 HTTPS 사이트 두 번째 탭에서 공지를 작성하고 `GitHub 로그인으로 게시`를 누른다. 열린 GitHub 화면에서 `kangdasom` 계정으로 로그인하고 자동 입력된 제목·본문을 그대로 `Submit new issue` 또는 `Create`로 제출한다. 로그인 상태가 유지되면 매번 인증키를 입력할 필요가 없다. 새 창이 차단되면 사이트의 `GitHub 게시 요청 열기`를 누른다. 매우 긴 공지는 URL 길이 제한 때문에 `게시 요청 복사` 후 GitHub 본문에 붙여넣고 제출한다.

GitHub 로그인 인증은 GitHub의 세션을 사용한다. 사이트는 GitHub 암호·인증키·로그인 쿠키를 받거나 저장하지 않는다. 게시 요청은 공개 Issues에 남으며, 게시된 공지는 공개 `notice.json`에 보관한다. 요청 생성에는 저장소 Issues 기능이 켜져 있어야 한다.

`publish-notice.yml`은 issues opened 이벤트에서 실행된다. 작업 조건과 서버의 `parseIssue`는 허용 계정 `kangdasom`의 고유 ID `311216178`, 요청 작성자와 이벤트 발신자, 저장소 이름과 고유 ID `1317770573`, 제목·데이터 형식을 확인한다. 다른 계정의 요청은 공지 파일 수정·배포를 실행하지 않는다. 권한은 특정 휴대폰이 아닌 GitHub 계정 기준이다. 다른 방문자가 관리 편집기를 열 수 있어도 서버의 게시 권한을 얻지는 않는다.

서버는 `notice.json`의 최신 revision과 파일 SHA를 대조해 덮어쓰기 충돌을 막고 공지를 커밋한 다음 `deploy-pages.yml`을 workflow_dispatch로 실행한다. Actions 자동 발급 `GITHUB_TOKEN`은 서버에서만 사용되므로 개인 인증키 발급·Secret 등록은 필요 없다. GITHUB_TOKEN 커밋으로는 push 워크플로가 자동 실행되지 않으므로 명시적 dispatch가 필수다. 게시 요청은 저장·배포 요청 성공 후 닫히며, 실제 배포 성공과는 구분한다. 브랜치 보호가 직접 수정을 막으면 게시 처리 내역에서 정책을 확인한다.

사이트는 요청 준비·GitHub 제출·배포 완료를 구분하며, 실제 배포 revision을 읽었을 때만 완료를 표시한다. 최대 약 10분간 확인하고, 이후 창으로 돌아오면 다시 확인한다. 실패 시 `게시 처리 내역`과 `배포 내역`을 확인한다. 수정 충돌이면 최신 게시본을 불러와 새 요청을 제출한다. 동일 요청의 재실행은 중복 공지 커밋 없이 배포를 재요청한다. 빈 공지 게시도 같은 과정을 거쳐 공지를 내린다.

공개 공지 초안·준비된 요청은 해당 탭의 sessionStorage에 보관해 새로고침·GitHub 로그인 이동 중 복원한다. `배포 확인 중단`은 사이트의 확인만 중단하며 이미 GitHub에 제출된 요청을 취소하지 않는다. 기존 localStorage 공지는 별도 불러오기 버튼으로 가져오며 자동 게시하거나 삭제하지 않는다. 금리·관리정보 키는 수정하지 않는다.

방문자는 새 접속·공지 팝업 열기·창 복귀 시 배포된 공지를 읽는다. 이미 열린 모든 화면의 실시간 동기화는 아니다. 사이트 전체의 직원 로그인 기능은 이번 변경에 포함하지 않는다.

검사: `node scripts/check-notice-publish.cjs` (계정·저장소 검증, 권한 없는 요청 거절, 충돌·재실행, 실제 워크플로 스크립트의 커밋·dispatch API 모사), `RATE_STATUS_PLAYWRIGHT`를 지정한 `node scripts/check-notice-ui.cjs` (격리 Edge, GitHub 제출·배포 모사). 실제 사용자 계정의 요청 제출은 사용자가 수행한다.
