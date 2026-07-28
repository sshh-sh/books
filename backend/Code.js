/**
 * 읽어용 - Apps Script 백엔드
 * 이 파일을 구글 시트에 연결된 Apps Script 프로젝트(확장 프로그램 > Apps Script)에
 * Code.gs로 붙여넣고 사용합니다.
 */

const SHEETS = {
  BOOKS: 'Books',
  BOOK_LIBRARIES: 'BookLibraries',
  USER_BOOKS: 'UserBooks',
  BRANCHES: 'LibraryBranches'
};

const APP_VERSION = 'v5';

function stripDoseogwan_(name) {
  return (name || '').replace(/도서관$/, '');
}

const YONGIN_REGION_CODE = '31'; // 정보나루 지역코드: 경기도
const YONGIN_DTL_CODE = '31018'; // 정보나루 상세지역코드: 용인시 (실제 값은 정보나루 문서에서 재확인 필요)

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('연결된 스프레드시트를 찾을 수 없습니다. Apps Script를 시트의 확장프로그램 메뉴로 열었는지 확인해주세요.');
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    // 탭 이름에 앞뒤 공백이 있는 경우를 대비한 보정 매칭
    sheet = ss.getSheets().find(s => s.getName().trim() === name);
  }
  if (!sheet) throw new Error('시트를 찾을 수 없습니다: "' + name + '". 실제 탭 이름: ' + ss.getSheets().map(s => '"' + s.getName() + '"').join(', '));
  return sheet;
}

/** 진단용: 실행 후 로그(보기 > 로그)에서 실제 탭 이름을 정확히 확인 */
function debugListSheetNames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) { Logger.log('연결된 스프레드시트 없음 (바인딩 안 됨)'); return; }
  ss.getSheets().forEach(s => Logger.log('[' + s.getName() + ']'));
}

function sheetToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function appendRow_(sheet, obj, headers) {
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  sheet.appendRow(row);
}

function nextId_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return 1;
  const ids = values.slice(1).map(r => Number(r[0]) || 0);
  return Math.max(0, ...ids) + 1;
}

/* ---------------- 알라딘 검색 ---------------- */

function searchAladin(query) {
  const key = PropertiesService.getScriptProperties().getProperty('ALADIN_KEY');
  if (!key) throw new Error('ALADIN_KEY가 설정되지 않았습니다.');
  const url = 'https://www.aladin.co.kr/ttb/api/ItemSearch.aspx'
    + '?ttbkey=' + encodeURIComponent(key)
    + '&Query=' + encodeURIComponent(query)
    + '&QueryType=Keyword&MaxResults=10&start=1&SearchTarget=Book'
    + '&output=js&Version=20131101';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());
  if (!data.item) return [];
  return data.item.map(it => ({
    title: cleanTitle_(it.title),
    author: it.author,
    isbn13: it.isbn13,
    pubDate: it.pubDate,
    cover: it.cover,
    description: it.description,
    category: guessCategory_(it.categoryName),
    country: '' // 알라딘은 국가 정보를 항상 주지 않음 → 없으면 '기타'로 처리
  }));
}

function cleanTitle_(title) {
  return (title || '').replace(/\s*-\s*.*$/, '').trim(); // 부제 정리(필요시 조정)
}

function guessCategory_(categoryName) {
  if (!categoryName) return '기타';
  return categoryName.indexOf('소설') !== -1 ? '소설' : '비소설';
}

/* ---------------- 정보나루: 지점 목록 ---------------- */

function fetchYonginBranches_() {
  const key = PropertiesService.getScriptProperties().getProperty('LIBRARY_KEY');
  if (!key) throw new Error('LIBRARY_KEY가 설정되지 않았습니다.');
  // dtl_region 코드가 불확실해서, 경기도 전체를 받아 주소에 "용인시"가 들어간 곳만 걸러냄
  const url = 'http://data4library.kr/api/libSrch'
    + '?authKey=' + encodeURIComponent(key)
    + '&region=' + YONGIN_REGION_CODE
    + '&pageSize=500&format=json';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());
  const allLibs = (data.response && data.response.libs) || [];
  const libs = allLibs.filter(l => (l.lib.address || '').indexOf('용인시') !== -1);
  return libs.map(l => l.lib);
}

/** 최초 1회 또는 필요할 때 실행: 지점 목록을 LibraryBranches 시트에 채워넣음 */
function syncLibraryBranches() {
  const sheet = getSheet_(SHEETS.BRANCHES);
  const existing = sheetToObjects_(sheet);
  if (existing.length > 0) return; // 이미 있으면 건드리지 않음(순서 보존)
  const libs = fetchYonginBranches_();
  libs.forEach((lib, i) => {
    sheet.appendRow([stripDoseogwan_(lib.libName), i + 1]);
  });
}

/** 마이그레이션용: 이미 채워진 지점명에서 "도서관" 접미사만 제거 */
function stripBranchSuffixes() {
  const sheet = getSheet_(SHEETS.BRANCHES);
  const rows = sheetToObjects_(sheet);
  if (!rows.length) return;
  const out = rows.map(r => [stripDoseogwan_(r.branch_name), r.sort_order]);
  sheet.getRange(2, 1, out.length, 2).setValues(out);
}

function getLibraryBranches() {
  return sheetToObjects_(getSheet_(SHEETS.BRANCHES))
    .sort((a, b) => a.sort_order - b.sort_order);
}

function updateBranchOrder(orderedNames) {
  const sheet = getSheet_(SHEETS.BRANCHES);
  const rows = sheetToObjects_(sheet);
  const byName = {};
  rows.forEach(r => byName[r.branch_name] = r);
  const out = orderedNames.map((name, i) => [name, i + 1]);
  sheet.getRange(2, 1, Math.max(out.length, 1), 2).clearContent();
  if (out.length) sheet.getRange(2, 1, out.length, 2).setValues(out);
}

/* ---------------- 정보나루: 도서 소장/대출 여부 ---------------- */

function getBookAvailability(isbn13) {
  const key = PropertiesService.getScriptProperties().getProperty('LIBRARY_KEY');
  if (!key) throw new Error('LIBRARY_KEY가 설정되지 않았습니다.');

  // 1) 이 책을 보유한 도서관 목록 조회 (경기도 전체 중 용인시만 필터)
  const srchUrl = 'http://data4library.kr/api/libSrchByBook'
    + '?authKey=' + encodeURIComponent(key)
    + '&isbn=' + encodeURIComponent(isbn13)
    + '&region=' + YONGIN_REGION_CODE
    + '&pageSize=500&format=json';
  const srchRes = UrlFetchApp.fetch(srchUrl, { muteHttpExceptions: true });
  const srchData = JSON.parse(srchRes.getContentText());
  const allLibs = (srchData.response && srchData.response.libs) || [];
  const yonginLibs = allLibs
    .map(l => l.lib)
    .filter(l => (l.address || '').indexOf('용인시') !== -1);

  // 2) 보유한 도서관마다 대출가능 여부 개별 조회
  return yonginLibs.map(l => {
    let available = false;
    try {
      const existUrl = 'http://data4library.kr/api/bookExist'
        + '?authKey=' + encodeURIComponent(key)
        + '&isbn13=' + encodeURIComponent(isbn13)
        + '&libCode=' + encodeURIComponent(l.libCode)
        + '&format=json';
      const existRes = UrlFetchApp.fetch(existUrl, { muteHttpExceptions: true });
      const existData = JSON.parse(existRes.getContentText());
      available = existData.response.result.loanAvailable === 'Y';
    } catch (err) { /* 개별 조회 실패는 무시하고 대출불가로 처리 */ }
    return { libraryName: stripDoseogwan_(l.libName), available: available };
  });
}

/* ---------------- Books / BookLibraries ---------------- */

function findOrCreateBook_(bookData) {
  const sheet = getSheet_(SHEETS.BOOKS);
  const books = sheetToObjects_(sheet);
  const existing = books.find(b => b.isbn === bookData.isbn13);
  if (existing) return existing.id;

  const id = nextId_(sheet);
  sheet.appendRow([
    id, bookData.title, bookData.author, bookData.isbn13,
    bookData.category || '기타', bookData.country || '기타',
    bookData.cover || '', bookData.series_name || '',
    bookData.series_total || '', bookData.series_order || ''
  ]);
  return id;
}

function saveBookLibraries_(bookId, callnoByLibrary) {
  // callnoByLibrary: { "용인중앙": "813.6", ... }
  const sheet = getSheet_(SHEETS.BOOK_LIBRARIES);
  const id0 = nextId_(sheet);
  let i = 0;
  Object.keys(callnoByLibrary).forEach(libName => {
    sheet.appendRow([id0 + i, bookId, libName, callnoByLibrary[libName]]);
    i++;
  });
}

/* ---------------- UserBooks (읽을래용/읽는중이용/읽었어용) ---------------- */

function addToWantList(bookData, reasonNote) {
  const bookId = findOrCreateBook_(bookData);
  const sheet = getSheet_(SHEETS.USER_BOOKS);
  const id = nextId_(sheet);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sheet.appendRow([id, bookId, '읽고싶음', '도서관', today, '', false, reasonNote || '']);
  return id;
}

function addToReadingList(bookData, reasonNote, source) {
  const bookId = findOrCreateBook_(bookData);
  const sheet = getSheet_(SHEETS.USER_BOOKS);
  const id = nextId_(sheet);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sheet.appendRow([id, bookId, '읽는중', source || '도서관외', today, '', false, reasonNote || '']);
  return id;
}

function markBorrowed_toReading(userBookId) {
  updateUserBookField_(userBookId, 'status', '읽는중');
}

function markFinished(userBookId, readDate) {
  updateUserBookField_(userBookId, 'status', '읽음');
  updateUserBookField_(userBookId, 'read_date', readDate);
}

function markDropped(userBookId) {
  updateUserBookField_(userBookId, 'status', '읽음');
  updateUserBookField_(userBookId, 'dropped', true);
}

function updateUserBookField_(userBookId, field, value) {
  const sheet = getSheet_(SHEETS.USER_BOOKS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const colIndex = headers.indexOf(field);
  if (colIndex === -1) throw new Error('알 수 없는 필드: ' + field);
  for (let r = 1; r < values.length; r++) {
    if (Number(values[r][0]) === Number(userBookId)) {
      sheet.getRange(r + 1, colIndex + 1).setValue(value);
      return;
    }
  }
  throw new Error('UserBooks id를 찾을 수 없습니다: ' + userBookId);
}

/* ---------------- 목록 조회 (화면용) ---------------- */

function getListByStatus_(status) {
  const userBooks = sheetToObjects_(getSheet_(SHEETS.USER_BOOKS))
    .filter(ub => ub.status === status);
  const books = sheetToObjects_(getSheet_(SHEETS.BOOKS));
  const bookById = {};
  books.forEach(b => bookById[b.id] = b);

  return userBooks
    .sort((a, b) => new Date(a.added_date) - new Date(b.added_date))
    .map(ub => Object.assign({}, bookById[ub.book_id], { userBook: ub }));
}

function getWantList() { return getListByStatus_('읽고싶음'); }
function getReadingList() { return getListByStatus_('읽는중'); }
function getDoneList() { return getListByStatus_('읽음'); }

/* ---------------- 통계 ---------------- */

function getStats() {
  const userBooks = sheetToObjects_(getSheet_(SHEETS.USER_BOOKS));
  const books = sheetToObjects_(getSheet_(SHEETS.BOOKS));
  const bookById = {};
  books.forEach(b => bookById[b.id] = b);
  const thisYear = new Date().getFullYear();

  const doneThisYear = userBooks.filter(ub =>
    ub.status === '읽음' && !ub.dropped && ub.read_date &&
    new Date(ub.read_date).getFullYear() === thisYear
  );
  const want = userBooks.filter(ub => ub.status === '읽고싶음');

  const categoryCounts = { '소설': 0, '비소설': 0 };
  doneThisYear.forEach(ub => {
    const cat = (bookById[ub.book_id] || {}).category;
    if (cat === '소설') categoryCounts['소설']++;
    else categoryCounts['비소설']++;
  });

  return {
    doneThisYear: doneThisYear.length,
    wantCount: want.length,
    categoryCounts: categoryCounts
  };
}

/* ---------------- 웹앱 진입점 ---------------- */

/* ---------------- JSON API (깃허브 페이지에서 fetch로 호출) ---------------- */

const API_ACTIONS = {
  searchAladin: (p) => searchAladin(p.query),
  getWantList: () => getWantList(),
  getReadingList: () => getReadingList(),
  getDoneList: () => getDoneList(),
  getStats: () => getStats(),
  getLibraryBranches: () => getLibraryBranches(),
  getBookAvailability: (p) => getBookAvailability(p.isbn13),
  addToWantList: (p) => addToWantList(p.bookData, p.reasonNote),
  addToReadingList: (p) => addToReadingList(p.bookData, p.reasonNote, p.source),
  markBorrowed_toReading: (p) => markBorrowed_toReading(p.userBookId),
  markFinished: (p) => markFinished(p.userBookId, p.readDate),
  markDropped: (p) => markDropped(p.userBookId),
  updateBranchOrder: (p) => updateBranchOrder(p.orderedNames),
  syncLibraryBranches: () => syncLibraryBranches(),
  stripBranchSuffixes: () => stripBranchSuffixes(),
  getVersion: () => APP_VERSION
};

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleApi_(action, params) {
  try {
    const fn = API_ACTIONS[action];
    if (!fn) return jsonOutput_({ ok: false, error: '알 수 없는 action: ' + action });
    const result = fn(params || {});
    return jsonOutput_({ ok: true, data: result });
  } catch (err) {
    return jsonOutput_({ ok: false, error: err.message });
  }
}

/** 읽기 전용 호출: GET ?action=xxx&query=... 형태 */
function doGet(e) {
  const action = e.parameter.action;
  if (!action) return jsonOutput_({ ok: false, error: 'action 파라미터가 필요합니다.' });
  return handleApi_(action, e.parameter);
}

/** 쓰기 호출: POST body(JSON) = { action, ...payload } — CORS 프리플라이트 피하려고 text/plain으로 보냄 */
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  return handleApi_(body.action, body);
}
