# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

「チームミッション管理 (Team Mission Manager)」— 管理者が部下のミッション/アサイン業務、
進捗、1on1・評価記録を一元管理する Web アプリ。Vercel + Postgres で動作し、スマホ対応。

## Architecture

- **Frontend**: `public/` — ビルド不要の素の HTML/CSS/JS による SPA（タブ切替式）
- **Backend (API)**: `src/app.js` — Express 5 アプリ。ルート定義・簡易パスワード認証
- **DB layer**: `src/db.js` — `pg` の Pool。スキーマは起動時に自動作成（`CREATE TABLE IF NOT EXISTS`）
- **Serverless entry (Vercel)**: `api/index.js` — `src/app.js` を再エクスポート
- **Local dev server**: `src/server.js` — 静的配信 + SPA フォールバックを足して `listen`
- **Routing on Vercel**: `vercel.json`（`/api/*` → 関数、それ以外 → `public/`）
- **Seed**: `src/seed-data.js`（共通ロジック）/ `src/seed.js`（CLI）/ `POST /api/seed`

## Commands

- **Dev server**: `npm start`（または監視つき `npm run dev`）→ http://localhost:3000
- **Seed sample data**: `npm run seed`（上書きは `npm run seed -- --force`）
- ローカル実行には `POSTGRES_URL` が必須。`APP_PASSWORD` 未設定なら認証なしで起動。
- テストフレームワークは未導入。

## Conventions

- データはすべて Postgres。SQL は `$1` プレースホルダ、集計は `::int` で数値型に明示キャスト。
- 日付カラム(DATE)は `setTypeParser` により `YYYY-MM-DD` 文字列で返す（フロントの期待に合わせる）。
- 認証は `APP_PASSWORD` ベースの Cookie 方式。`/api/session|login|logout` 以外は要ログイン。
