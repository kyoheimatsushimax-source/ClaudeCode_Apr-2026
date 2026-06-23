'use strict';

// サンプルデータ投入ロジック（CLI と /api/seed の両方から利用）
// query: (text, params) => Promise<{rows}>
async function seedSampleData(query) {
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  const m1 = (await query(
    `INSERT INTO members (name, role, email, note) VALUES ($1,$2,$3,$4) RETURNING id`,
    ['佐藤 健', 'フロントエンドエンジニア', 'sato@example.com', '伸び盛り。UI設計が得意。'])).rows[0].id;
  const m2 = (await query(
    `INSERT INTO members (name, role, email, note) VALUES ($1,$2,$3,$4) RETURNING id`,
    ['鈴木 美咲', 'バックエンドエンジニア', 'suzuki@example.com', 'API設計のリード候補。'])).rows[0].id;
  const m3 = (await query(
    `INSERT INTO members (name, role, email, note) VALUES ($1,$2,$3,$4) RETURNING id`,
    ['田中 大輔', 'デザイナー', 'tanaka@example.com', null])).rows[0].id;

  const task = (vals) => query(
    `INSERT INTO tasks (title, description, member_id, status, priority, progress, due_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`, vals);
  await task(['新規ダッシュボードの実装', '管理画面のグラフ表示を追加', m1, 'in_progress', 'high', 60, day(2)]);
  await task(['認証APIのリファクタ', 'JWTの有効期限処理を見直し', m2, 'in_progress', 'urgent', 30, day(-1)]);
  await task(['ロゴ・配色の刷新', 'ブランドガイドに沿って更新', m3, 'review', 'medium', 90, day(5)]);
  await task(['E2Eテスト整備', null, m2, 'todo', 'medium', 0, day(10)]);
  await task(['問い合わせフォーム改善', 'バリデーション強化', m1, 'blocked', 'high', 20, day(3)]);
  await task(['採用面談の調整', '次四半期の採用計画', null, 'todo', 'low', 0, null]);
  await task(['リリースノート作成', null, m3, 'done', 'low', 100, day(-3)]);

  const rec = (vals) => query(
    `INSERT INTO records (member_id, type, date, rating, summary, next_action)
     VALUES ($1,$2,$3,$4,$5,$6)`, vals);
  await rec([m1, '1on1', day(-7), null, 'ダッシュボード実装の進め方を相談。設計方針OK。', 'コンポーネント分割案を共有']);
  await rec([m2, 'evaluation', day(-14), 4, 'Q2は安定して成果。API品質が向上。', 'リード業務を一部委譲']);
  await rec([m3, '1on1', day(-3), null, 'デザインの方向性をすり合わせ。', null]);
}

module.exports = { seedSampleData };
