# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

関東近郊のマンション（購入・賃貸）を地図上にマッピングし、相場より割安な
物件を発見するローカルアプリ。詳細仕様と使い方は README.md を参照。

- バックエンド: Python 3.10+ / FastAPI / SQLite（外部依存は requirements.txt の4つのみ）
- フロント: `frontend/` の Leaflet シングルページ（ビルド不要、Leaflet は vendor 同梱）
- データ: 国交省「不動産情報ライブラリ」API（要 `REINFOLIB_API_KEY`）+ CSV インポート

## コマンド

```bash
pip install -r requirements.txt          # セットアップ
python -m pytest tests/ -v               # テスト実行
python -m pytest tests/test_scoring.py -k test_name   # 単一テスト
python -m app.cli demo                   # 合成データで一式セットアップ（APIキー不要）
python -m app.cli serve                  # 開発サーバ http://127.0.0.1:8000
```

リンタ・フォーマッタは未導入。PEP 8 準拠、行長はおおむね88桁。

## アーキテクチャの要点

- **スコアリングのコアは `app/scoring.py` の純粋関数**。DB アクセスを含む
  バッチ処理は `app/stats.py`。スコアロジックを変更したら必ず両方のテスト
  （test_scoring.py / test_stats.py）を更新する。
- エリア相場は `area_stats` テーブルにフォールバックレベル別（0=地区×築年帯×
  広さ帯 〜 4=市区町村全体、5=ヒートマップ専用の地区全体）で事前計算される。
  レベル定義は `app/stats.py` の `_LEVELS`。
- 掲載物件の取得元は `app/listings/provider.py` の `ListingProvider` 抽象で
  分離。新しい取得元はアダプタとして追加する。スクレイピング型は
  `PoliteScraperProvider` を基底にし、robots.txt 遵守・5秒間隔・UA明示・
  リトライ上限を必ず守る。
- データを取込・変更したら `stats` → `score` の順で再計算が必要
  （`python -m app.cli stats && python -m app.cli score`）。

## 規約

- コメント・docstring・UI 文言は日本語
- コミットメッセージは日本語または英語の命令形で簡潔に
- 金額は円、単価は 円/㎡（賃貸は 円/㎡/月）で統一。表示時のみ万円換算
