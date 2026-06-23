'use strict';

// ローカル開発用サーバ。
// 本番(Vercel)では api/index.js がエントリになり、静的配信は Vercel が担当する。
const path = require('path');
const express = require('express');
const app = require('./app');

// 静的ファイル配信 + SPA フォールバック（ローカル時のみ）
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`チームミッション管理 → http://localhost:${PORT}`);
});
