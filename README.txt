
# 仁和管樂回條系統（回條＋統計網站）

這個資料夾是專門給「回條／資料統計」使用的前端＋後端程式碼（非官方網站）。

## 檔案結構

- `RenheRepliesApi.gs`  
  放到 Google Apps Script 裡當作主程式，佈署為 Web App。
  這份程式已經**配合目前 Google Sheet 的實際欄位與工作表名稱**（Replies / Latest / Auditlog），
  並新增一個 `fn=roster` 的 GET 路由，讓前端可以取得名單做下拉選單。

- `index.html`  
  學生端入口：  
  - 班級、姓名：下拉式選單（從 Roster 載入）  
  - 密碼（PIN）：手動輸入  
  - 登入、查看活動列表、填寫回條。

- `admin.html`  
  管理端入口：登入管理員、查看每個活動的回覆人數與回覆率、匯出 CSV。

- `assets/css/style.css`  
  兩個頁面共用的版面與樣式。

- `assets/js/api.js`  
  跟 GAS API 溝通的程式（請把 `API_BASE` 換成你實際的 Web App URL）。

- `assets/js/state.js`  
  負責 localStorage：學生登入狀態、管理員 token。

- `assets/js/ui.js`  
  共用的小工具：Toast 訊息顯示等。

- `assets/js/student.js`  
  學生端邏輯：  
  - 讀取 `fn=roster` → 建立「班級」「姓名」下拉選單  
  - 學生登入（authStudent）  
  - 活動列表（getEvents）  
  - 每個活動的回條表單（可針對不同 eventId 自訂）  
  - 送出回條（postReply）→ 存入 Replies / Latest。

- `assets/js/admin.js`  
  管理端邏輯：管理員登入、統計表、匯出 CSV。

## Google Sheet 結構（需與現況相同）

- Config:  
  `eventId, title, startAt, deadline, allowEdit, statDescription, status, date, place, contact`

- Roster:  
  `class, name, pin, enabled`（enabled 可以是「是」，程式會視為啟用，只要不是 "false"）  
  - `fn=roster` 只會回傳 `class` 與 `name` 給前端。

- Replies:  
  `ts, eventId, class, name, answer, email, ua`  
  - 程式會把整份回條答案存成 JSON 字串在 `answer` 欄。

- Latest:  
  `eventId, studentKey, class, name, lastReplyTs, answer`  
  - 每位學生、每個活動只保留最新一筆回覆。  
  - `answer` 一樣是 JSON 字串。

- Auditlog:  
  `ts, actor, action, eventId, detail`  
  - 用來記錄登入、回覆等動作。

## 登入頁的「班級」「姓名」下拉邏輯

1. 前端載入時會先呼叫 `getRoster()` → `GET ?fn=roster`。
2. 後端會回傳：

   ```json
   {
     "ok": true,
     "roster": [
       { "class": "八甲", "name": "王小明" },
       { "class": "八甲", "name": "李小華" },
       { "class": "八乙", "name": "何同學" }
     ]
   }
   ```

3. 前端會整理成 `_rosterByClass = { "八甲": ["王小明","李小華"], "八乙":["何同學"] }`，
   並建立：

   - 班級下拉：`八甲 / 八乙 / ...`（依字母排序）
   - 姓名下拉：選班級後才啟用，只顯示該班級的學生姓名。

4. 學生登入時，前端會送：

   ```json
   { "class": "八甲", "name": "王小明", "pin": "12345" }
   ```

   到 `fn=auth`，配合 `Roster` 驗證。

## 每個活動使用不同的回條表單

在 `assets/js/student.js` 裡的：

```js
const FORM_DEFINITIONS = {
  default: { ... },
  '20251015-camp': { ... },
  // ...
};
```

- key：`eventId`（對應 Config 裡的 eventId）
- value：定義這個活動要顯示的欄位、題目、選項
- 前端會把填好的資料打包成一個物件，存進 `Replies / Latest` 的 `answer` 欄（JSON 字串）

## 使用步驟簡要

1. 打開 Google Apps Script 專案，貼上 `RenheRepliesApi.gs` 全部內容。
2. 在 Script Properties 設定：
   - `SPREADSHEET_ID`：你的 Google Sheet ID
   - `ADMIN_TOKEN`：自訂的一組安全碼（管理員登入要用）
3. 佈署為 Web App，記下 `/exec` 結尾的 URL。
4. 打開 `assets/js/api.js`，把 `API_BASE` 改成你的 Web App URL。
5. 把整個網站上傳到你要的主機（例如 GitHub Pages / 學校主機），
   - 學生使用 `index.html`
   - 管理員使用 `admin.html`
