# チームミッション管理 (Team Mission Manager)

部下のミッション・アサイン業務を一元管理する、管理者向けの Web アプリです。

## 主な機能

| 機能 | 説明 |
| --- | --- |
| 📋 ミッション/タスク管理 | 担当・期限・優先度・進捗・ステータスを管理。フィルタ付き一覧。 |
| 📊 進捗ダッシュボード | 全体の完了率、ステータス内訳、メンバー別の負荷を可視化。 |
| 🗣 1on1・評価記録 | メンバーごとの面談メモ・評価(★)・ネクストアクションを蓄積。 |
| 🔔 通知・リマインド | 期限超過・期限間近・ブロック中・未アサインを自動抽出。ヘッダーに件数バッジ。 |

## 技術構成

- **バックエンド**: Node.js + Express 5（REST API）
- **データベース**: SQLite（`better-sqlite3`、`data/app.db` に保存）
- **フロントエンド**: 素の HTML/CSS/JavaScript の SPA（ビルド工程なし）

依存は最小限で、ビルドツールなしに `npm install` → `npm start` だけで動きます。

## セットアップ

```bash
npm install        # 依存インストール
npm run seed       # （任意）サンプルデータ投入
npm start          # サーバ起動 → http://localhost:3000
```

開発時はファイル変更を監視する `npm run dev` も利用できます。

### 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `PORT` | `3000` | 待ち受けポート |
| `DATA_DIR` | `./data` | DB ファイルの保存先ディレクトリ |
| `DB_PATH` | `./data/app.db` | DB ファイルのパス（直接指定する場合） |

## データモデル

- **members** — メンバー（部下）: 氏名 / 役割 / メール / メモ / 在籍フラグ
- **tasks** — ミッション/タスク: タイトル / 詳細 / 担当 / ステータス / 優先度 / 進捗 / 期限
- **records** — 面談記録: メンバー / 種別(1on1・評価・メモ) / 日付 / 評価 / サマリ / ネクストアクション

## API 概要

```
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
```

## 注意

現状は単一管理者での利用を前提としており、認証は実装していません。
社内ネットワークや個人環境での利用を想定しています。外部公開する場合は
リバースプロキシでの Basic 認証などを併用してください。
