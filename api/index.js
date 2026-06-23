'use strict';

// Vercel サーバーレス関数のエントリポイント。
// Express アプリ（API）をそのままハンドラとして公開する。
// 静的ファイル(public/)と SPA フォールバックは vercel.json のルーティングが担当。
module.exports = require('../src/app');
