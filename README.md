# 읽어용 — 개발 저장 상태 (다른 컴퓨터에서 이어하기용)

## 구성
- **화면(프론트엔드)**: `index.html` — GitHub Pages로 서빙됨
  - 배포 주소: https://sshh-sh.github.io/books/
- **백엔드**: `backend/Code.js`, `backend/appsscript.json`
  - 실제로는 Google Apps Script 프로젝트에 올라가 있음 (이 폴더의 파일은 백업/참고용 사본)
  - Apps Script 편집기: https://script.google.com/home/projects/1hB5PE429dgubPXgpwKZTPRF2rvhmDkPfmfqh3CyH6hBsjLcHQ51jmJ8D/edit
  - 배포된 웹앱(API) 주소: https://script.google.com/macros/s/AKfycbzzNbPguhf1dhI2BGgK_KlvPb154RVUB0khLF-2IpGIwRzqndTVYYk5gOYPhRM_qNa2/exec
- **데이터**: Google Sheets
  - 시트 주소: https://docs.google.com/spreadsheets/d/1Ps-E0q3zoxYMkK8S3nfW4_41oWo7z7Ew3uPtFjCuI3c/edit
  - 탭 구성: `Books`, `BookLibraries`, `UserBooks`, `LibraryBranches`

## API 키 (시트 주인만 볼 수 있는 Apps Script 스크립트 속성에 저장됨, 이 저장소엔 없음)
- `ALADIN_KEY` — 알라딘 Open API 키
- `LIBRARY_KEY` — 정보나루(data4library.kr) 인증키
- 위치: Apps Script 편집기 → 프로젝트 설정(⚙️) → 스크립트 속성

## 다른 컴퓨터에서 개발 이어하기
1. 이 저장소를 clone
   ```
   git clone https://github.com/sshh-sh/books.git
   ```
2. **화면 수정**: `index.html` 편집 → git add/commit/push (GitHub Pages가 자동 재배포, 1분 내 반영)
3. **백엔드 수정**: 두 가지 방법
   - (A) `script.google.com`에서 위 Apps Script 편집기 링크로 직접 들어가서 브라우저로 코드 수정 (컴퓨터 상관없이 로그인만 하면 됨)
   - (B) `clasp` CLI 사용 시: Node.js 설치 → `npm install -g @google/clasp` → `clasp login` → `backend/` 폴더를 rootDir로 하는 `.clasp.json` 만들고 `clasp push`
     ```json
     {
       "scriptId": "1hB5PE429dgubPXgpwKZTPRF2rvhmDkPfmfqh3CyH6hBsjLcHQ51jmJ8D",
       "rootDir": "여기에 backend 폴더 경로"
     }
     ```
   - 백엔드 코드를 고치면 `backend/Code.js`도 같이 업데이트해서 커밋해두면 이 저장소가 항상 최신 상태로 유지됨

## 현재 진행 상황 (2026-07-29 기준, 백엔드 v9)
- 화면 디자인: 완료 (핑크톤, 잘난체/나눔스퀘어라운드/나눔손글씨 폰트, 4개 탭). 헤더+탭 메뉴 스크롤 고정, 책검색 버튼은 헤더 줄 오른쪽. 목록은 4열 그리드, 표지 이미지 축소(카드 폭 64%, 최대 90px)
- 검색→담기, 대출함 체크→읽는중이용 이동, 다읽음/중도포기→읽었어용, 통계: 실제 시트 연동 완료. 감상 메모(`reason_note`) 저장 실제로 동작(`updateReasonNote`)
- 도서관 지점 21곳(용인시) 동기화 완료, 보유도서관/대출가능 여부 실제 조회 완료 (`libSrchByBook`으로 소장 도서관 찾고 `bookExist`로 지점별 대출가능 여부 조회하는 2단계 방식)
- 지점명은 "OO도서관" 대신 "OO"만 표시 (`stripDoseogwan_`). 기본은 "남사"/"용인중앙"만 노출 + "더보기"로 전체 펼침, "전체" 필터 칩 있음. 지점 클릭 시 그 도서관 보유 책만 실제로 필터링됨. PC 마우스로 드래그해서 지점 순서 변경 가능(모바일 터치 드래그는 의도적으로 미구현 — 더보기로 충분하다고 판단)
- 도서관 보유정보는 book_id 기준으로 캐싱(`getBookAvailabilityCached`, 최대 1년 유지) — 목록 열 때마다 정보나루 API 재호출 안 함. **화면에 보이는 카드만** IntersectionObserver로 지연 로딩(전체를 한꺼번에 조회하면 다른 동작이 느려지고 "Failed to fetch"가 나던 문제 해결)
- 정렬: 청구기호/작가/나라 콤보 삭제함. "전체" 볼 땐 최근 추가한 책이 맨 앞, 도서관 필터 클릭 시엔 그 도서관 보유 책만 청구기호순. 청구기호는 정보나루 `itemSrch` API로 캡처해서 `Books.callno`에 저장(**아직 실데이터로 검증 안 됨**, 아래 이슈 참고)
- 읽었어용: 연도 선택 콤보 + 카드 형식(보유도서관 정보만 제외) + 감상 메모 표시/수정. 삭제 기능 3개 탭(읽을래용/읽는중이용/읽었어용) 모두 지원
- 푸터의 버전 표시는 `getVersion` API를 호출해서 항상 백엔드 실제 배포 버전(`APP_VERSION` 상수, Code.js 상단)을 보여줌 — 버전 올릴 때는 Code.js의 `APP_VERSION` 값만 바꾸면 됨
- **의도적으로 보류/제외하기로 확정한 것** (다시 물어볼 필요 없음): 바코드 스캔 실카메라 인식(나중에), 모바일 터치 드래그(안 만들기로 확정), 도서관 정보 자동 재시도 트리거(불필요 판단, 필요할 때 `populateAvailabilityCacheForAll` 수동 호출로 충분)
- 아직 미구현: 사진으로 여러 책 한번에 등록하는 앱 내장 기능(1회성으로 대화 중 수동 처리한 적은 있음)

## ⚠️ 지금 당장 이어서 처리해야 할 것
1. **정보나루(data4library) API 할당량이 계속 막혀있음** — Apps Script가 쓰는 구글 공유 IP 대역 전체가 나눠쓰는 하루 500건 한도라 언제 풀릴지 알 수 없음. 이 때문에 보유도서관 정보와 청구기호 데이터가 기존 등록된 책들 대부분 비어있음. **할당량이 풀린 걸 확인하면 `?action=populateAvailabilityCacheForAll` 을 한 번 호출**해서 기존 책들 데이터를 채워야 함(새로 등록하는 책은 자동으로 채워짐). 시간이 걸리니 백그라운드 실행 권장.
2. **청구기호(callno) 캡처 로직이 실데이터로 검증된 적 없음** — `backend/Code.js`의 `fetchRepresentativeCallNo_` 함수가 정보나루 `itemSrch` API 응답에서 `docs[0].doc.callNo` 필드를 읽는데, 할당량이 막혀서 실제로 맞는 필드명인지 확인 못 함. 1번으로 데이터가 채워진 후 `Books` 시트의 `callno` 컬럼이 그럴듯한 값(예: "813.6")으로 채워지는지 확인. 비어있거나 이상하면 정보나루 공식 API 문서 보고 필드 파싱 수정 필요.
3. **실기기(폰/PC)에서 아직 직접 테스트 안 된 기능들** — 코드는 완성해서 배포했지만 개발 중엔 브라우저 자동화 도구로 정확히 재현이 어려워 사람이 직접 확인 못 함: PC 드래그로 지점 순서변경, 대출함 체크 시 읽는중이용으로 즉시 이동, 지점 클릭 필터링/정렬, "전체" 최신순 정렬, 스크롤 지연 로딩 체감 속도, 헤더+탭 고정 스크롤, 4열 그리드/표지 크기.
4. **2024/2025 독서기록 PDF → 이미지 변환본 처리 미완료** — `C:\Users\종희컴\Desktop\송희\독서앱\2024독서기록\`, `...\2025독서기록\` 폴더에 jpg로 변환해서 넣어둠 (원본 PDF는 폰트 인코딩이 깨져서 텍스트 추출 자체가 안 됨 — 한글이 다 깨짐). 이미지를 읽어서 제목/저자/읽은 날짜/감상 파악 → 알라딘 검색으로 매칭 → 읽었어용에 일괄 등록하는 작업이 아직 시작 전.

## 배포 시 주의사항
- `clasp push`가 가끔 네트워크 오류(Internal error / ENOTFOUND)로 실패할 수 있음 — 재시도하면 대부분 해결됨
- **`gh-pages-site/` 폴더 자체를 `독서앱/` 루트에 두고 clasp를 쓰면 안 됨** — clasp가 `backend/` 안의 Code.js/appsscript.json까지 같이 스캔해서 "파일이 이미 존재함" 충돌 남. `.claspignore`로 `gh-pages-site`를 반드시 제외해야 함 (이미 처리되어 있음, 새 컴퓨터에서 클론 시 `.claspignore`가 없다면 다시 만들어야 함 — gh-pages-site 저장소에는 .claspignore가 없고, `독서앱` 원본 폴더에만 있었음. clasp 작업할 땐 `backend/` 폴더를 별도 rootDir로 잡는 걸 추천)

## 사용한 폰트/이미지 원본 파일
`C:\Users\종희컴\Desktop\송희\독서앱\` 폴더 안에 원본 폰트(.ttf/.otf), 공룡 이미지가 있음 — index.html에는 이미 base64로 임베딩되어 있어서 없어도 화면엔 문제없지만, 폰트 다시 손볼 일 있으면 참고.
