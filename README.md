# Where To Eat（該吃啥）

決定下一餐吃什麼的小工具。PWA，手機可加到主螢幕當 App 使用。

**線上版本：** https://clovermikelai.github.io/where-to-eat/

---

## 日後更新流程

### 前置資訊（只需設定一次）

- 本地專案位置：`R:\Claude_code_workspace\where_to_eat\`
- GitHub repo：`https://github.com/clovermikelai/where-to-eat`
- 網址：`https://clovermikelai.github.io/where-to-eat/`

### 每次更新的操作步驟

#### 1. 打開 Git Bash，切到專案目錄

```bash
cd R:/Claude_code_workspace/where_to_eat
```

#### 2. 修改檔案（直接用任何編輯器編輯 `index.html` 或其他）

#### 3. **若改了邏輯/UI，記得更新 Service Worker 的版號**

打開 `sw.js`，把：

```js
const CACHE_NAME = 'where-to-eat-v1';
```

改成 `v2`（下次就改 `v3`、`v4`…）。不改版號的話，手機上的 PWA 會用舊快取看不到新版。

#### 4. 查看修改的內容

```bash
HOME="$USERPROFILE" git status
HOME="$USERPROFILE" git diff
```

#### 5. 加入變更並 commit

```bash
HOME="$USERPROFILE" git add .
HOME="$USERPROFILE" git commit -m "簡短說明你改了什麼"
```

> 如果首次在新電腦上執行，可能需要先設定：
> ```bash
> HOME="$USERPROFILE" git config --global user.name "clovermikelai"
> HOME="$USERPROFILE" git config --global user.email "clovermikelai@users.noreply.github.com"
> ```

#### 6. 推上 GitHub

```bash
HOME="$USERPROFILE" git -c http.sslBackend=schannel push
```

> **為何加 `HOME="$USERPROFILE"`？** 某些受管環境會把 HOME 指向唯讀或網路磁碟，導致 git config 鎖檔失敗。`$USERPROFILE` 指向本機使用者目錄，可避開問題。
>
> **為何加 `-c http.sslBackend=schannel`？** 部分網路有 TLS 中間人憑證，Git 內建 OpenSSL 不認得。schannel 改用 Windows 系統憑證庫，能正常連線。

#### 7. 等 GitHub Pages 重新建置（約 30 秒～2 分鐘）

可以打開 https://github.com/clovermikelai/where-to-eat/actions 看建置進度，綠色打勾就完成。

#### 8. 在手機上強制更新快取

Service Worker 會自動偵測新版，但手機上有時要手動幫忙：

- **如果有改 cache 版號**：只要關掉 PWA 再打開就會載入新版
- **如果忘了改版號**：在瀏覽器（Safari/Chrome）用原網址重新開一次，讓它重新註冊 SW

---

## 認證相關

GitHub 已不接受用明文密碼 push，必須用 **Personal Access Token (PAT)** 代替密碼。Token 有時效性（用完會過期），所以你之後偶爾需要重新產生一個。

### 產生 Personal Access Token（PAT）— 完整步驟

#### 1. 找到 Developer settings 頁面

**捷徑網址（最快）：** 👉 https://github.com/settings/tokens

**或手動找**（如果捷徑不行）：
- 右上角點自己的頭像 → **Settings**
- 左側選單**捲到最下面** → **Developer settings**（位置很隱蔽）
- **Personal access tokens** → **Tokens (classic)**

> 有兩種 token：**Classic** 比較簡單（整個 repo 權限打包一個勾勾），**Fine-grained** 比較細但設定繁瑣。自用推薦 Classic。

#### 2. 產生新 token

- 點右上 **Generate new token** → **Generate new token (classic)**
- 可能會要求重新輸入 GitHub 密碼

#### 3. 填寫表單

| 欄位 | 建議填法 |
|---|---|
| **Note** | `where-to-eat-push`（之後看得懂就好） |
| **Expiration** | `30 days`（推薦；到期再產新的比較安全） |
| **Select scopes** | 只勾 ☑ **`repo`**（整包會自動勾 `repo:status`、`public_repo` 等子項目，沒關係） |

#### 4. 產生並複製

- 捲到最下面點 **Generate token**
- 會跳出 `ghp_` 開頭的一長串字
- **⚠️ 重要：token 只會顯示這一次**，關掉頁面就看不到了。請：
  - 立刻複製
  - 貼到安全的地方（例如你的密碼管理器、加密筆記）
  - 或直接用下面步驟推一次（Windows 會記住）

#### 5. 用 token 推送

**方法 A：一次性推送（最簡單）**

```bash
cd R:/Claude_code_workspace/where_to_eat
HOME="$USERPROFILE" git -c http.sslBackend=schannel \
  push https://clovermikelai:YOUR_TOKEN_HERE@github.com/clovermikelai/where-to-eat.git main
```

把 `YOUR_TOKEN_HERE` 換成你剛剛複製的 `ghp_...`。這次推完就結束，不會被儲存。

**方法 B：讓 Windows 記住（之後不用再輸入）**

先設定 credential helper：

```bash
HOME="$USERPROFILE" git config --global credential.helper manager
```

然後正常推送：

```bash
HOME="$USERPROFILE" git -c http.sslBackend=schannel push
```

第一次會跳 Windows 視窗問帳密：
- Username: `clovermikelai`
- Password: **貼上 token**（不是 GitHub 登入密碼！）

之後就會自動認證，直到 token 過期。

### Token 到期或遺失的處理

當 push 出現 `Authentication failed` 或 `remote: Invalid username or password` 錯誤：

1. **到期的 token 先撤銷**：到 https://github.com/settings/tokens 把舊的刪掉（保持帳號整潔）
2. **依上面步驟產生新 token**
3. **清除 Windows 記住的舊帳密**（如果用過方法 B）：
   - 開啟「控制台」→ 使用者帳戶 → **認證管理員** → **Windows 認證**
   - 找到 `git:https://github.com` → **移除**
4. 用新 token 推送一次（方法 A 或 B）

### 安全提醒

- **Token 等於你的 GitHub 帳號權限**，漏出去別人就能改你的 repo
- 不要 commit token 進任何檔案（`.env`、code 都不行）
- 用完不再需要的 token 請到 https://github.com/settings/tokens 刪掉
- Expiration 盡量不要選 `No expiration`，被外洩時損害範圍比較小

---

## 首次建立新專案的完整指令套裝

> 這份備忘是為「建立全新工具」用的，例如以後要做晚餐選擇器。複製這段、把 `where-to-eat` 換成新專案名稱就能跑。

### 步驟 1：在 GitHub 建立 repo（用 API，不用點網頁）

```bash
# 把 YOUR_TOKEN 換成有效 PAT
/c/Windows/System32/curl.exe -s -X POST https://api.github.com/user/repos \
  -H "Authorization: token YOUR_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  -d '{"name":"where-to-eat","private":false,"has_issues":false,"has_projects":false,"has_wiki":false}'
```

> 為何用 Windows 原生 curl (`/c/Windows/System32/curl.exe`)？
> 部分網路有 TLS 中間人憑證，Git Bash 內建的 curl 因為用 OpenSSL 會驗證失敗。Windows 原生 curl 用系統憑證庫（Schannel）就能連。

### 步驟 2：本地初始化 Git 並 commit

```bash
cd R:/Claude_code_workspace/where_to_eat
HOME="$USERPROFILE" git init -b main
HOME="$USERPROFILE" git add .
HOME="$USERPROFILE" git commit -m "Initial commit"
```

### 步驟 3：加 remote 並推送

```bash
HOME="$USERPROFILE" git remote add origin https://github.com/clovermikelai/where-to-eat.git
HOME="$USERPROFILE" git -c http.sslBackend=schannel \
  push -u https://clovermikelai:YOUR_TOKEN@github.com/clovermikelai/where-to-eat.git main
```

### 步驟 4：啟用 GitHub Pages（API 方式）

```bash
/c/Windows/System32/curl.exe -s -X POST \
  https://api.github.com/repos/clovermikelai/where-to-eat/pages \
  -H "Authorization: token YOUR_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  -d '{"source":{"branch":"main","path":"/"}}'
```

成功會回傳 `"html_url": "https://clovermikelai.github.io/where-to-eat/"`。等 30 秒～2 分鐘建置完成即可訪問。

### 步驟 5：手機加入主螢幕

#### iPhone (Safari)

1. Safari 打開網址
2. 點下方「分享」按鈕（方形向上箭頭）
3. 捲下來找「加入主畫面」
4. 點右上「加入」
5. 主螢幕會有圖示，點開就是全螢幕 App

#### Android (Chrome)

1. Chrome 打開網址
2. 網址列可能出現「安裝」小圖示，或從右上三個點選單選「安裝應用程式」
3. 主螢幕會多一個圖示

---

## 檔案結構

| 檔案 | 作用 |
|---|---|
| `index.html` | 主程式（UI + 互動邏輯） |
| `manifest.json` | PWA 設定（App 名稱、圖示、主題色） |
| `sw.js` | Service Worker（離線快取策略） |
| `icon.svg` | 向量圖示 |
| `apple-touch-icon.png` | iOS 主螢幕圖示（180×180） |
| `.gitignore` | 排除不需上傳的本地檔案 |
| `README.md` | 本文件 |

---

## 常見狀況排查

### 推送失敗：SSL certificate problem

忘了加 `-c http.sslBackend=schannel`，重試：

```bash
HOME="$USERPROFILE" git -c http.sslBackend=schannel push
```

### 推送失敗：Permission denied / could not lock config

忘了加 `HOME="$USERPROFILE"`，重試。

### 推送失敗：Authentication failed

Token 過期，依上面「認證相關」重新產 token。

### 網頁改了但手機看到舊版

- 檢查 `sw.js` 有沒有改版號
- 在手機瀏覽器網址列的 PWA（不是桌面那個圖示）打開並下拉刷新
- 最後手段：刪掉手機主螢幕的 PWA 圖示，重新從網址加入

### GitHub Pages 沒有更新

打開 https://github.com/clovermikelai/where-to-eat/actions 看最新 workflow 是不是失敗。失敗的話點進去看錯誤。
