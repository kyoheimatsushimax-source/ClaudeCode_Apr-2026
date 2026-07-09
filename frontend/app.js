/* 関東マンション割安マップ フロントエンド */

const map = L.map("map").setView([35.68, 139.75], 10);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const cluster = L.markerClusterGroup({ maxClusterRadius: 45 });
map.addLayer(cluster);
const heatGroup = L.layerGroup();

let currentType = "sale";
let markersById = {};

/* ---------- 表示ユーティリティ ---------- */

function scoreColor(score) {
  if (score == null) return "#999";
  if (score >= 70) return "#1a9850";
  if (score >= 60) return "#91cf60";
  if (score >= 45) return "#fee08b";
  if (score >= 30) return "#fc8d59";
  return "#d73027";
}

function fmtPrice(l) {
  if (l.listing_type === "rent") return (l.price / 10000).toFixed(1) + "万円/月";
  return (l.price / 10000).toLocaleString() + "万円";
}

function fmtUnit(v, type) {
  if (v == null) return "—";
  if (type === "rent") return Math.round(v).toLocaleString() + "円/㎡·月";
  return (v / 10000).toFixed(1) + "万円/㎡";
}

function fmtDev(pct) {
  if (pct == null) return "—";
  const cls = pct <= 0 ? "dev-cheap" : "dev-expensive";
  const sign = pct > 0 ? "+" : "";
  return `<span class="${cls}">${sign}${pct.toFixed(1)}%</span>`;
}

const CONF_LABEL = { high: "高", medium: "中", low: "低" };

function popupHtml(l) {
  const age = l.building_year ? `${new Date().getFullYear() - l.building_year}年（${l.building_year}年築）` : "—";
  const conf = l.confidence ? `${CONF_LABEL[l.confidence]}（サンプル${l.market_sample_count}件）` : "—";
  let rows = `
    <tr><td>価格</td><td><b>${fmtPrice(l)}</b>（${l.area_sqm}㎡）</td></tr>
    <tr><td>㎡単価</td><td>${fmtUnit(l.unit_price, l.listing_type)}</td></tr>
    <tr><td>エリア相場中央値</td><td>${fmtUnit(l.market_median, l.listing_type)}</td></tr>
    <tr><td>相場乖離</td><td>${fmtDev(l.market_deviation_pct)}</td></tr>
    <tr><td>トレンド乖離</td><td>${fmtDev(l.trend_deviation_pct)}</td></tr>
    <tr><td>スコア</td><td><b>${l.score ?? "—"}</b> / 100（信頼度: ${conf}）</td></tr>
    <tr><td>築年</td><td>${age}</td></tr>
    <tr><td>駅徒歩</td><td>${l.station ?? "—"}駅 徒歩${l.walk_min ?? "—"}分</td></tr>`;
  if (l.gross_yield_pct != null) {
    rows += `<tr><td>想定表面利回り</td><td>${l.gross_yield_pct}%（参考値）</td></tr>`;
  }
  const link = l.url ? `<tr><td>掲載元</td><td><a href="${l.url}" target="_blank" rel="noopener">リンク</a></td></tr>` : "";
  const warn = l.outlier ? `<div class="warn">⚠ ${l.outlier_reason ?? "外れ値の可能性"}</div>` : "";
  return `<div class="popup-card"><h3>${l.title ?? l.source_id}</h3><table>${rows}${link}</table>${warn}</div>`;
}

/* ---------- データ読込 ---------- */

function filterParams() {
  const p = new URLSearchParams({ listing_type: currentType });
  const priceFactor = 10000; // 入力は万円
  const v = (id) => document.getElementById(id).value;
  if (v("priceMin")) p.set("price_min", v("priceMin") * priceFactor);
  if (v("priceMax")) p.set("price_max", v("priceMax") * priceFactor);
  if (v("areaMin")) p.set("area_min", v("areaMin"));
  if (v("areaMax")) p.set("area_max", v("areaMax"));
  if (v("ageMax")) p.set("age_max", v("ageMax"));
  if (v("walkMax")) p.set("walk_max", v("walkMax"));
  if (v("muni")) p.set("municipality", v("muni"));
  if (+v("scoreMin") > 0) p.set("score_min", v("scoreMin"));
  p.set("exclude_outliers", document.getElementById("excludeOutliers").checked);
  return p;
}

async function loadListings() {
  const res = await fetch("/api/listings?" + filterParams());
  const listings = await res.json();
  cluster.clearLayers();
  markersById = {};
  for (const l of listings) {
    if (l.lat == null || l.lng == null) continue;
    const marker = L.circleMarker([l.lat, l.lng], {
      radius: 9,
      fillColor: scoreColor(l.score),
      fillOpacity: 0.9,
      color: l.outlier ? "#888" : "#fff",
      weight: l.outlier ? 3 : 1.5,
    }).bindPopup(popupHtml(l), { maxWidth: 320 });
    cluster.addLayer(marker);
    markersById[l.id] = marker;
  }
}

async function loadRanking() {
  const res = await fetch(`/api/rankings?listing_type=${currentType}&limit=15`);
  const items = await res.json();
  const ol = document.getElementById("ranking");
  ol.innerHTML = "";
  for (const l of items) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="score-chip" style="background:${scoreColor(l.score)}">${l.score}</span>` +
      `${l.title ?? l.source_id}<br><small>${l.municipality ?? ""}${l.district ?? ""} ${fmtPrice(l)} ` +
      `相場比 ${l.market_deviation_pct != null ? l.market_deviation_pct.toFixed(1) + "%" : "—"}</small>`;
    li.onclick = () => {
      if (l.lat == null) return;
      map.setView([l.lat, l.lng], 15);
      const m = markersById[l.id];
      if (m) cluster.zoomToShowLayer(m, () => m.openPopup());
    };
    ol.appendChild(li);
  }
  if (!items.length) ol.innerHTML = "<li>スコア済み物件がありません</li>";
}

async function loadHeatmap() {
  heatGroup.clearLayers();
  const res = await fetch(`/api/areas?basis=${currentType}`);
  const areas = await res.json();
  if (!areas.length) return;
  const values = areas.map((a) => a.median_unit_price).sort((x, y) => x - y);
  const q = (p) => values[Math.min(values.length - 1, Math.floor(p * values.length))];
  const ramp = [
    [q(0.2), "#2166ac"], [q(0.4), "#67a9cf"], [q(0.6), "#fddbc7"],
    [q(0.8), "#ef8a62"], [Infinity, "#b2182b"],
  ];
  const color = (v) => ramp.find(([t]) => v <= t)[1];
  for (const a of areas) {
    L.circleMarker([a.lat, a.lng], {
      radius: 16 + Math.min(a.sample_count, 120) / 8,
      fillColor: color(a.median_unit_price),
      fillOpacity: 0.4,
      color: color(a.median_unit_price),
      weight: 1,
    }).bindTooltip(
      `<div class="heat-tip"><b>${a.municipality}${a.district}</b><br>` +
      `中央値 ${fmtUnit(a.median_unit_price, currentType)}<br>` +
      `サンプル ${a.sample_count}件</div>`
    ).addTo(heatGroup);
  }
}

async function loadMeta() {
  const res = await fetch("/api/meta");
  const meta = await res.json();
  const sel = document.getElementById("muni");
  const cur = sel.value;
  sel.innerHTML = '<option value="">すべて</option>';
  for (const m of meta.municipalities) {
    const opt = document.createElement("option");
    opt.value = m.municipality;
    opt.textContent = `${m.prefecture} ${m.municipality}`;
    sel.appendChild(opt);
  }
  sel.value = cur;
  const tx = meta.transactions;
  document.getElementById("meta").textContent =
    `成約・取引データ: ${tx.count.toLocaleString()}件（${tx.from ?? "—"}〜${tx.to ?? "—"}） / ` +
    `掲載物件: 売買${meta.listings.sale ?? 0}件・賃貸${meta.listings.rent ?? 0}件`;
}

function refresh() {
  loadListings();
  loadRanking();
  if (document.getElementById("heatLayer").checked) {
    loadHeatmap();
    map.addLayer(heatGroup);
  } else {
    map.removeLayer(heatGroup);
  }
}

/* ---------- イベント ---------- */

document.querySelectorAll("#typeToggle button").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll("#typeToggle button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentType = btn.dataset.type;
    document.getElementById("priceUnit").textContent =
      currentType === "rent" ? "(万円/月)" : "(万円)";
    refresh();
  };
});

["priceMin", "priceMax", "areaMin", "areaMax", "ageMax", "walkMax"].forEach((id) => {
  document.getElementById(id).addEventListener("change", refresh);
});
document.getElementById("muni").addEventListener("change", refresh);
document.getElementById("excludeOutliers").addEventListener("change", refresh);
document.getElementById("heatLayer").addEventListener("change", refresh);
const scoreMin = document.getElementById("scoreMin");
scoreMin.addEventListener("input", () => {
  document.getElementById("scoreMinVal").textContent = scoreMin.value;
});
scoreMin.addEventListener("change", refresh);

loadMeta();
refresh();
