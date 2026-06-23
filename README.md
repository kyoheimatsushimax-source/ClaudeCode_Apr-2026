# チームミッション管理 (Team Mission Manager)

部下のミッション・アサイン業務を一元管理する、管理者向けの Web アプリです。
**Vercel + Postgres** で動作し、スマホからも閲覧・編集できます。

## 主な機能

| 機能 | 説明 |
| --- | --- |
| 📋 ミッション/タスク管理 | 担当・期限・優先度・進捗・ステータスを管理。フィルタ付き一覧。 |
| 📊 進捗ダッシュボード | 全体の完了率、ステータス内訳、メンバー別の負荷を可視化。 |
| 🗣 1on1・評価記録 | メンバーごとの面談メモ・評価(★)・ネクストアクションを蓄積。 |
| 🔔 通知・リマインド | 期限超過・期限間近・ブロック中・未アサインを自動抽出。ヘッダーに件数バッジ。 |
| 🔒 簡易パスワード認証 | `APP_PASSWORD` を設定すると、ログインしないと閲覧・編集できません。 |

スマホ対応（レスポンシブ）。

## 技術構成

- **フロントエンド**: 素の HTML/CSS/JavaScript の SPA（ビルド工程なし、`public/`）
- **バックエンド**: Node.js + Express 5（REST API、`src/app.js`）
- **データベース**: PostgreSQL（`pg` ドライバ。Vercel Postgres / Neon を想定）
- **ホスティング**: Vercel（API はサーバーレス関数 `api/index.js`、静的配信は `public/`）

---

## Vercel へのデプロイ手順（スマホから使う）

### 1. データベースを用意する（Vercel Postgres / Neon）
1. Vercel のプロジェクト → **Storage** タブ → **Create Database** → **Postgres (Neon)** を作成。
2. 作成したDBをこのプロジェクトに **Connect** する。
   → `POSTGRES_URL` などの環境変数が自動で設定されます。

### 2. パスワードを設定する
Vercel のプロジェクト → **Settings → Environment Variables** で以下を追加：

| 変数 | 値 | 説明 |
| --- | --- | --- |
| `APP_PASSWORD` | 任意のパスワード | ログイン用。未設定だと誰でもアクセス可になります。 |

### 3. デプロイ
`main`（または対象ブランチ）に push すれば Vercel が自動デプロイします。
表示された URL をスマホのブラウザで開き、設定したパスワードでログインしてください。

### 4. 初期データ
初回アクセス時はデータが空です。ダッシュボードの
**「メンバーを追加」** から登録するか、**「サンプルデータを投入」** で試せます。

---

## ローカル開発

ローカルでも PostgreSQL が必要です（Neon の接続文字列をそのまま使ってもOK）。

```bash
npm install
export POSTGRES_URL="postgresql://user:pass@host:5432/dbname"
export APP_PASSWORD="任意"          # 省略すると認証なしで起動
npm run seed                        # （任意）サンプルデータ投入
npm start                           # → http://localhost:3000
```

ファイル監視つきの `npm run dev` も利用できます。

### 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `POSTGRES_URL` / `DATABASE_URL` | （必須） | Postgres 接続文字列 |
| `APP_PASSWORD` | （空） | ログインパスワード。未設定なら認証なし |
| `PORT` | `3000` | ローカルの待ち受けポート |
| `PGSSL` | — | `1` で SSL 接続を強制（マネージドDBは自動判定） |

---

## データモデル

- **members** — メンバー（部下）: 氏名 / 役割 / メール / メモ / 在籍フラグ
- **tasks** — ミッション/タスク: タイトル / 詳細 / 担当 / ステータス / 優先度 / 進捗 / 期限
- **records** — 面談記録: メンバー / 種別(1on1・評価・メモ) / 日付 / 評価 / サマリ / ネクストアクション

スキーマはアプリ起動時に自動作成されます（`CREATE TABLE IF NOT EXISTS`）。

## API 概要

```
GET    /api/session              認証状態の確認
POST   /api/login                ログイン（{ password }）
POST   /api/logout               ログアウト
GET    /api/dashboard            ダッシュボード集計
GET    /api/reminders            リマインド対象（?days=N で期限間近の日数）
GET    /api/members              メンバー一覧
POST   /api/members              メンバー追加
GET    /api/members/:id          メンバー詳細（タスク・記録込み）
PUT    /api/members/:id          メンバー更新
DELETE /api/members/:id          メンバー削除
GET    /api/tasks                タスク一覧（?status=&priority=&member_id=）
POST   /api/tasks                タスク作成
PUT    /api/tasks/:id            タスク更新
DELETE /api/tasks/:id            タスク削除
GET    /api/records              記録一覧（?member_id=&type=）
POST   /api/records              記録作成
DELETE /api/records/:id          記録削除
POST   /api/seed                 サンプルデータ投入（空のときのみ）
```
（`/api/login`・`/api/logout`・`/api/session` 以外は要ログイン）
