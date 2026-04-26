# CLAUDE.md

図書館検索アプリ - Library Search Application

## 技術スタック

- **フロントエンド**: React 18 + Vite
- **API**: Calil API（日本の図書館検索API）
- **HTTP クライアント**: Axios
- **スタイル**: CSS3

## 開発コマンド

- **開発サーバー起動**: `npm run dev` (http://localhost:5173)
- **本番ビルド**: `npm run build`
- **ビルドプレビュー**: `npm run preview`

## プロジェクト構成

```
src/
├── components/         # Reactコンポーネント
│   ├── SearchForm.jsx
│   ├── SearchResults.jsx
│   └── BookCard.jsx
├── services/           # API サービス
│   └── calilApi.js
├── styles/            # CSS スタイル
│   ├── SearchForm.css
│   ├── SearchResults.css
│   └── BookCard.css
├── App.jsx
├── main.jsx
└── index.css
```

## 主な機能

- **書籍検索**: Calil APIでタイトル・著者から検索
- **地域選択**: 都道府県を選択して図書館を指定
- **検索結果**: サムネイル、著者、出版社、ISBN等を表示

## Calil API 情報

- **API キー**: `100f06489a98c91ac4a4d1dae537769c`
- **ドキュメント**: https://calil.jp/doc/api.html
- **エンドポイント**:
  - `/search` - 書籍検索
  - `/library` - 図書館情報取得
  - `/check` - 蔵書確認
