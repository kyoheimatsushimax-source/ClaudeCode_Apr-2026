'use strict';

// サンプルデータ投入スクリプト:  npm run seed
const db = require('./db');

const memberCount = db.prepare('SELECT COUNT(*) AS c FROM members').get().c;
if (memberCount > 0 && !process.argv.includes('--force')) {
  console.log('既にデータがあります。上書きする場合は `npm run seed -- --force`');
  process.exit(0);
}

db.exec('DELETE FROM records; DELETE FROM tasks; DELETE FROM members;');

const today = new Date();
const day = (offset) => {
  const d = new Date(today); d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const insMember = db.prepare('INSERT INTO members (name, role, email, note) VALUES (?, ?, ?, ?)');
const m1 = insMember.run('佐藤 健', 'フロントエンドエンジニア', 'sato@example.com', '伸び盛り。UI設計が得意。').lastInsertRowid;
const m2 = insMember.run('鈴木 美咲', 'バックエンドエンジニア', 'suzuki@example.com', 'API設計のリード候補。').lastInsertRowid;
const m3 = insMember.run('田中 大輔', 'デザイナー', 'tanaka@example.com', null).lastInsertRowid;

const insTask = db.prepare(`INSERT INTO tasks (title, description, member_id, status, priority, progress, due_date)
  VALUES (?, ?, ?, ?, ?, ?, ?)`);
insTask.run('新規ダッシュボードの実装', '管理画面のグラフ表示を追加', m1, 'in_progress', 'high', 60, day(2));
insTask.run('認証APIのリファクタ', 'JWTの有効期限処理を見直し', m2, 'in_progress', 'urgent', 30, day(-1));
insTask.run('ロゴ・配色の刷新', 'ブランドガイドに沿って更新', m3, 'review', 'medium', 90, day(5));
insTask.run('E2Eテスト整備', null, m2, 'todo', 'medium', 0, day(10));
insTask.run('問い合わせフォーム改善', 'バリデーション強化', m1, 'blocked', 'high', 20, day(3));
insTask.run('採用面談の調整', '次四半期の採用計画', null, 'todo', 'low', 0, null);
insTask.run('リリースノート作成', null, m3, 'done', 'low', 100, day(-3));

const insRec = db.prepare(`INSERT INTO records (member_id, type, date, rating, summary, next_action)
  VALUES (?, ?, ?, ?, ?, ?)`);
insRec.run(m1, '1on1', day(-7), null, 'ダッシュボード実装の進め方を相談。設計方針OK。', 'コンポーネント分割案を共有');
insRec.run(m2, 'evaluation', day(-14), 4, 'Q2は安定して成果。API品質が向上。', 'リード業務を一部委譲');
insRec.run(m3, '1on1', day(-3), null, 'デザインの方向性をすり合わせ。', null);

console.log('サンプルデータを投入しました。');
