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

## 현재 진행 상황 (2026-07-28 기준, 백엔드 v5)
- 화면 디자인: 완료 (핑크톤, 잘난체/나눔스퀘어라운드/나눔손글씨 폰트, 4개 탭)
- 검색→담기, 대출함 체크→읽는중이용 이동, 다읽음/중도포기→읽었어용, 통계: 실제 시트 연동 완료
- 도서관 지점 21곳(용인시) 동기화 완료, 보유도서관/대출가능 여부 실제 조회 완료 (`libSrchByBook`으로 소장 도서관 찾고 `bookExist`로 지점별 대출가능 여부 조회하는 2단계 방식)
- 지점명은 "OO도서관" 대신 "OO"만 표시 (`stripDoseogwan_`)
- 푸터의 버전 표시는 `getVersion` API를 호출해서 항상 백엔드 실제 배포 버전(`APP_VERSION` 상수, Code.js 상단)을 보여줌 — 버전 올릴 때는 Code.js의 `APP_VERSION` 값만 바꾸면 됨
- 아직 미구현: 바코드 스캔 실카메라 인식, 사진으로 여러 책 한번에 등록, 청구기호/작가/나라 정렬 콤보의 실제 데이터 연동, 이유 메모 저장(`saveReason`은 현재 미완성)

## 배포 시 주의사항
- `clasp push`가 가끔 네트워크 오류(Internal error / ENOTFOUND)로 실패할 수 있음 — 재시도하면 대부분 해결됨
- **`gh-pages-site/` 폴더 자체를 `독서앱/` 루트에 두고 clasp를 쓰면 안 됨** — clasp가 `backend/` 안의 Code.js/appsscript.json까지 같이 스캔해서 "파일이 이미 존재함" 충돌 남. `.claspignore`로 `gh-pages-site`를 반드시 제외해야 함 (이미 처리되어 있음, 새 컴퓨터에서 클론 시 `.claspignore`가 없다면 다시 만들어야 함 — gh-pages-site 저장소에는 .claspignore가 없고, `독서앱` 원본 폴더에만 있었음. clasp 작업할 땐 `backend/` 폴더를 별도 rootDir로 잡는 걸 추천)

## 사용한 폰트/이미지 원본 파일
`C:\Users\종희컴\Desktop\송희\독서앱\` 폴더 안에 원본 폰트(.ttf/.otf), 공룡 이미지가 있음 — index.html에는 이미 base64로 임베딩되어 있어서 없어도 화면엔 문제없지만, 폰트 다시 손볼 일 있으면 참고.
