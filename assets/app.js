import {
  MAPBOX_ACCESS_TOKEN,
  DATA_URL,
  BICYCLE_DATA_URL,
  POI_DATA_URL,
  GPX_URL,
  FIRE_ZONE_INFO_URL,
  POI_ICON_URLS,
  SEG_COLORS,
  SEG_OUTLINE,
  FALLBACK_COLOR,
  SEG_COLORS_BIKE,
  SEG_OUTLINE_BIKE,
  FALLBACK_COLOR_BIKE,
  HIGHLIGHT_COLOR,
  HIGHLIGHT_COLOR_BIKE,
  LOAD_TIMEOUT_MS,
  DEFAULT_VIEW,
} from "./config.js";

const $ = (id) => document.getElementById(id);
const FIRE_ZONE_SEGMENT = 3;
const FIRE_ZONE_PHONE = "0505804258";
const FALLBACK_POI_ICON_ID = "poi-icon-fallback";
const POI_CATEGORY_LABELS = {
  water_source: "מקור מים",
  spring: "מעיין",
  container: "מכולת"
};
const POI_CATEGORY_ICON_IDS = {
  water_source: "poi-icon-water_source",
  spring: "poi-icon-spring",
  container: "poi-icon-container"
};

function showToast(msg, ms = 4500) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  window.clearTimeout(showToast._to);
  showToast._to = window.setTimeout(() => t.classList.remove("show"), ms);
}

function fmtKm(km) {
  if (!isFinite(km)) return "—";
  return (Math.round(km * 10) / 10).toFixed(1) + " ק״מ";
}
function safeStr(v) { return (v ?? "").toString().trim(); }
function normalizeHebrew(v) { return safeStr(v).toLocaleLowerCase("he"); }

async function copyText(text, successMsg = "המספר הועתק") {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg);
  } catch {
    showToast("לא ניתן להעתיק כרגע.");
  }
}

let activeColors = SEG_COLORS;
let activeFallback = FALLBACK_COLOR;
function segColor(seg) { return activeColors[seg] || activeFallback; }
function segmentImageSrc(seg) {
  const num = String(seg).padStart(2, "0");
  return `./data/images/segment-${num}.jpg`;
}

function renderSegmentImage(container, seg, title) {
  container.innerHTML = "";
  const img = document.createElement("img");
  img.src = segmentImageSrc(seg);
  img.alt = title ? `מקטע ${seg} — ${title}` : `מקטע ${seg}`;
  img.loading = "lazy";
  img.addEventListener("error", () => { container.textContent = "אין תמונה"; });
  container.appendChild(img);
}

function renderLodging(container, lodgingList = []) {
  container.innerHTML = "";
  const details = document.createElement("details");
  details.className = "segAccordion";
  const summary = document.createElement("summary");
  summary.textContent = "לינה";
  details.appendChild(summary);

  const content = document.createElement("div");
  content.className = "segAccordionContent";
  if (!lodgingList.length) {
    const empty = document.createElement("div");
    empty.className = "segEmpty";
    empty.textContent = "אין מקומות לינה במקטע זה עדיין.";
    content.appendChild(empty);
  } else {
    const grid = document.createElement("div");
    grid.className = "lodgingGrid";
    lodgingList.forEach(place => {
      const card = document.createElement("div");
      card.className = "lodgingCard";
      const imageWrap = document.createElement("div");
      imageWrap.className = "lodgingImage";
      const img = document.createElement("img");
      img.src = place.image;
      img.alt = place.title || "מקום לינה";
      img.loading = "lazy";
      img.addEventListener("error", () => { imageWrap.textContent = "אין תמונה"; });
      imageWrap.appendChild(img);

      const body = document.createElement("div");
      body.className = "lodgingBody";
      body.innerHTML = `
        <div class="lodgingTitle">${place.title || "מקום לינה"}</div>
        <div class="lodgingDesc">${place.description || "אין תיאור."}</div>
      `;
      const link = document.createElement("a");
      link.className = "lodgingLink";
      link.href = place.link || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "לצפייה באתר";

      body.appendChild(link);
      card.appendChild(imageWrap);
      card.appendChild(body);
      grid.appendChild(card);
    });
    content.appendChild(grid);
  }

  details.appendChild(content);
  container.appendChild(details);
}

function renderRavshatz(container, ravshatz) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "segActionWrap";
  const title = document.createElement("div");
  title.className = "segActionTitle";
  title.textContent = "לינה ותיאום מול ראבש״צ";
  wrap.appendChild(title);

  if (!safeStr(ravshatz?.phone)) {
    const line = document.createElement("div");
    line.className = "segActionMeta";
    line.textContent = "פרטי ראבש״צ לא זמינים כרגע.";
    wrap.appendChild(line);
    container.appendChild(wrap);
    return;
  }

  const settlement = document.createElement("div");
  settlement.className = "segActionText";
  settlement.textContent = `יישוב לינה: ${safeStr(ravshatz?.settlement_name) || "—"}`;
  wrap.appendChild(settlement);

  if (safeStr(ravshatz?.name)) {
    const name = document.createElement("div");
    name.className = "segActionMeta";
    name.textContent = `ראבש״צ: ${ravshatz.name}`;
    wrap.appendChild(name);
  }

  const phone = document.createElement("div");
  phone.className = "segActionMeta";
  phone.textContent = `טלפון: ${ravshatz.phone}`;
  wrap.appendChild(phone);

  if (safeStr(ravshatz?.notes)) {
    const notes = document.createElement("div");
    notes.className = "segActionMeta";
    notes.textContent = ravshatz.notes;
    wrap.appendChild(notes);
  }

  const btns = document.createElement("div");
  btns.className = "segActionBtns";
  const call = document.createElement("a");
  call.className = "btn";
  call.href = `tel:${ravshatz.phone.replace(/[^\d+]/g, "")}`;
  call.textContent = "📞 התקשר";

  const copy = document.createElement("button");
  copy.className = "btn";
  copy.type = "button";
  copy.textContent = "📋 העתק מספר";
  copy.addEventListener("click", () => copyText(ravshatz.phone));

  btns.appendChild(call);
  btns.appendChild(copy);
  wrap.appendChild(btns);
  container.appendChild(wrap);
}

function renderFireSafety(container, seg) {
  container.innerHTML = "";
  if (Number(seg) !== FIRE_ZONE_SEGMENT) return;

  const wrap = document.createElement("div");
  wrap.className = "segActionWrap";
  wrap.innerHTML = `
    <div class="segActionTitle">⚠ בטיחות ותיאום</div>
    <div class="segActionText">מקטע זה עובר כמעט כולו בשטח אש פעיל. חובה לתאם כניסה מול מתא״ם/פיקוד מרכז לפני היציאה לשטח.</div>
  `;

  const btns = document.createElement("div");
  btns.className = "segActionBtns";

  const call = document.createElement("a");
  call.className = "btn danger";
  call.href = `tel:${FIRE_ZONE_PHONE}`;
  call.textContent = "📞 התקשר לתיאום";

  const copy = document.createElement("button");
  copy.className = "btn";
  copy.type = "button";
  copy.textContent = "📋 העתק מספר";
  copy.addEventListener("click", () => copyText(FIRE_ZONE_PHONE, "מספר התיאום הועתק"));

  btns.appendChild(call);
  btns.appendChild(copy);

  if (safeStr(FIRE_ZONE_INFO_URL)) {
    const link = document.createElement("a");
    link.className = "btn";
    link.href = FIRE_ZONE_INFO_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "🔗 מידע נוסף";
    btns.appendChild(link);
  }

  wrap.appendChild(btns);
  container.appendChild(wrap);
}

const SEGMENT_META = [
  { segment: 1, title: "ארץ המעיינות", summary: "זהו המקטע המהנה ביותר בשביל,ביקור במספר מעיינות יהפהיפיים עם פינות ישיבה וצל.", lodging: [], ravshatz: { settlement_name: "מחולה", phone: "050-1111111", notes: "תיאום מראש לפני הגעה" } },
  { segment: 2, title: "שדמות מחולה לרועי", summary: "תיאור קצר למקטע 2 (מידע נוסף יתווסף בהמשך).", lodging: [], ravshatz: { settlement_name: "רועי", phone: "050-2222222" } },
  { segment: 3, title: "מרועי לגדי", summary: "תיאור קצר למקטע 3 (מידע נוסף יתווסף בהמשך).", lodging: [], ravshatz: { settlement_name: "גדי", phone: "050-3333333", notes: "בשל שטח האש יש לתאם גם מול מתא״ם" } },
  { segment: 4, title: "מגדי  לפצאל", summary: "תיאור קצר למקטע 4 (מידע נוסף יתווסף בהמשך).", lodging: [], ravshatz: { settlement_name: "פצאל", phone: "" } },
  { segment: 5, title: "מפצאל לחוות מלאכי השלום", summary: "תיאור קצר למקטע 5 (מידע נוסף יתווסף בהמשך).", lodging: [], ravshatz: { settlement_name: "חוות מלאכי השלום", phone: "050-5555555", name: "יוסי" } },
  { segment: 6, title: "מחוות מלאכי השלום למבואות יריחו", summary: "תיאור קצר למקטע 6 (מידע נוסף יתווסף בהמשך).", lodging: [], ravshatz: { settlement_name: "מבואות יריחו", phone: "050-6666666" } }
];

let segmentMeta = SEGMENT_META;

function syncTrailSegmentsWithGeo(trailData) {
  const daySegments = trailData.features
    .filter(feature => feature.geometry?.type === "LineString")
    .filter(feature => /מקטע\s+יום/.test(safeStr(feature.properties?.name)))
    .map(feature => ({ feature, northLat: turf.bbox(feature)[3] }))
    .sort((a, b) => b.northLat - a.northLat);

  daySegments.forEach(({ feature }, index) => {
    if (!feature.properties) feature.properties = {};
    feature.properties.segment = index + 1;
  });
}

function getSegmentMeta(seg) { return segmentMeta.find(item => Number(item.segment) === Number(seg)); }

const MODE_CONFIG = {
  hike: { label: "מסלול רגלי", dataUrl: DATA_URL, colors: SEG_COLORS, outline: SEG_OUTLINE, fallback: FALLBACK_COLOR, highlight: HIGHLIGHT_COLOR },
  bike: { label: "מסלול אופניים", dataUrl: BICYCLE_DATA_URL, colors: SEG_COLORS_BIKE, outline: SEG_OUTLINE_BIKE, fallback: FALLBACK_COLOR_BIKE, highlight: HIGHLIGHT_COLOR_BIKE }
};

async function headOk(url) {
  try { const res = await fetch(url, { method: "HEAD", cache: "no-store" }); return res.ok; }
  catch { return false; }
}

function setLoading(isLoading) { $("loader").style.display = isLoading ? "grid" : "none"; }
function updateSubtitle(text) { $("subtitle").textContent = text; }

function waitForMapLoaded(mapInstance) {
  return new Promise((resolve) => {
    if (mapInstance.loaded()) return resolve();
    mapInstance.once("load", () => resolve());
  });
}

async function withTimeout(promise, ms, label) {
  let to;
  const timeout = new Promise((_, reject) => { to = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms); });
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(to); }
}

function fitBounds(map, bbox, padding = 50) {
  map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding, duration: 650 });
}

function buildTrailColorExpression(colors, fallback) {
  return ["case", ["has", "segment"], ["match", ["get", "segment"],
    1, colors[1], 2, colors[2], 3, colors[3], 4, colors[4], 5, colors[5], 6, colors[6], fallback], fallback];
}

function computeIndexes(geojson) {
  const lineFeatures = geojson.features.filter(f => f.geometry?.type === "LineString");
  let totalKm = 0;
  const perSeg = new Map();
  let allB = null;

  for (const lf of lineFeatures) {
    const seg = Number(lf.properties?.segment ?? 0) || 0;
    const lenKm = turf.length(lf, { units: "kilometers" });
    totalKm += lenKm;
    if (!perSeg.has(seg)) perSeg.set(seg, { segment: seg, lengthKm: 0, bbox: null });
    const entry = perSeg.get(seg);
    entry.lengthKm += lenKm;
    const bb = turf.bbox(lf);
    entry.bbox = entry.bbox ? [Math.min(entry.bbox[0], bb[0]), Math.min(entry.bbox[1], bb[1]), Math.max(entry.bbox[2], bb[2]), Math.max(entry.bbox[3], bb[3])] : bb;
    allB = allB ? [Math.min(allB[0], bb[0]), Math.min(allB[1], bb[1]), Math.max(allB[2], bb[2]), Math.max(allB[3], bb[3])] : bb;
  }

  const segArr = [...perSeg.values()].filter(x => x.segment !== 0).map(entry => ({ ...entry, northLat: entry.bbox ? entry.bbox[3] : -Infinity }))
    .sort((a, b) => b.northLat - a.northLat)
    .map((entry, index) => ({ ...entry, originalSegment: entry.segment, segment: index + 1 }));

  const segmentMap = new Map(segArr.map(s => [s.originalSegment, s.segment]));
  return { totalKm, segArr, allBbox: allB, segmentMap };
}

function remapSegmentMeta(segmentMap) {
  return SEGMENT_META.map(meta => {
    const mapped = segmentMap.get(meta.segment);
    return mapped ? { ...meta, originalSegment: meta.segment, segment: mapped } : { ...meta };
  }).sort((a, b) => a.segment - b.segment);
}

function remapTrailSegments(trailData, segmentMap) {
  trailData.features.forEach(feature => {
    const mapped = segmentMap.get(Number(feature.properties?.segment));
    if (mapped && feature.properties) feature.properties.segment = mapped;
  });
}

function buildSegList(segmentsIndex, selectSegment) {
  const segListEl = $("segList");
  segListEl.innerHTML = "";

  segmentMeta.forEach(meta => {
    const entry = segmentsIndex.find(s => Number(s.segment) === Number(meta.segment));
    const div = document.createElement("div");
    div.className = "segCard";
    div.dataset.segment = meta.segment;

    const image = document.createElement("div");
    image.className = "segImage";
    renderSegmentImage(image, meta.segment, meta.title);

    const content = document.createElement("div");
    content.className = "segContent";

    const titleRow = document.createElement("div");
    titleRow.className = "segTitleRow";

    const title = document.createElement("div");
    title.className = "segTitle";
    title.textContent = `מקטע ${meta.segment} — ${meta.title}`;
    titleRow.appendChild(title);

    if (Number(meta.segment) === FIRE_ZONE_SEGMENT) {
      const fireBadge = document.createElement("div");
      fireBadge.className = "fireBadge";
      fireBadge.textContent = "⚠ שטח אש";
      titleRow.appendChild(fireBadge);
    }

    const subtitle = document.createElement("div");
    subtitle.className = "segSubtitle";
    subtitle.textContent = `אורך משוער: ${fmtKm(entry?.lengthKm ?? NaN)}`;

    const badge = document.createElement("div");
    badge.className = "segBadge";
    const swatch = document.createElement("span");
    swatch.className = "segSwatch";
    swatch.style.background = segColor(meta.segment);
    badge.appendChild(swatch);
    const badgeText = document.createElement("span");
    badgeText.textContent = "לחצו למידע נוסף וזום";
    badge.appendChild(badgeText);

    content.appendChild(titleRow);
    content.appendChild(subtitle);
    content.appendChild(badge);
    div.appendChild(image);
    div.appendChild(content);

    div.addEventListener("click", () => selectSegment(meta.segment, true));
    segListEl.appendChild(div);
  });
}

function setActiveSegUI(seg) {
  [...$("segList").querySelectorAll(".segCard")].forEach(el => el.classList.toggle("active", Number(el.dataset.segment) === Number(seg)));
}

function setSegmentMode(isSingle) {
  $("segFocus").classList.toggle("active", isSingle);
  $("segList").classList.toggle("hidden", isSingle);
  $("segDetails").classList.toggle("hidden", isSingle);
  $("segHint").classList.toggle("hidden", isSingle);
}

function applyPoiFilters(map) {
  if (!map.getLayer("poi-layer")) return;
  const typeVal = $("poiType").value;
  const q = normalizeHebrew($("poiSearch").value);
  const filters = ["all", ["==", ["geometry-type"], "Point"]];
  if (typeVal && typeVal !== "__all__") filters.push(["==", ["get", "category"], typeVal]);
  if (q) filters.push([">=", ["index-of", q, ["downcase", ["coalesce", ["get", "name"], ""]]], 0]);
  map.setFilter("poi-layer", filters);
}

function applyPalette(map, palette) {
  activeColors = palette.colors;
  activeFallback = palette.fallback;
  if (map.getLayer("trail-halo")) map.setPaintProperty("trail-halo", "line-color", palette.outline);
  if (map.getLayer("trail-base")) map.setPaintProperty("trail-base", "line-color", buildTrailColorExpression(palette.colors, palette.fallback));
  if (map.getLayer("trail-highlight")) map.setPaintProperty("trail-highlight", "line-color", palette.highlight);
}

function createFallbackPoiImage(size = 32) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#4b5563";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f3f4f6";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 5, 0, Math.PI * 2);
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

async function ensurePoiIcons(map) {
  if (!map.hasImage(FALLBACK_POI_ICON_ID)) map.addImage(FALLBACK_POI_ICON_ID, createFallbackPoiImage(), { pixelRatio: 2 });
  for (const [category, iconUrl] of Object.entries(POI_ICON_URLS)) {
    const iconId = POI_CATEGORY_ICON_IDS[category];
    if (map.hasImage(iconId)) continue;
    try {
      const image = await new Promise((resolve, reject) => map.loadImage(iconUrl, (err, loaded) => err ? reject(err) : resolve(loaded)));
      map.addImage(iconId, image);
    } catch {
      map.addImage(iconId, createFallbackPoiImage(), { pixelRatio: 2 });
    }
  }
}

function initLayersOnce(map, trailData, selectSegment) {
  if (!map.getSource("trail-src")) map.addSource("trail-src", { type: "geojson", data: trailData });

  if (!map.getLayer("trail-halo")) map.addLayer({
    id: "trail-halo", type: "line", source: "trail-src", filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-width": 6, "line-opacity": 0.9, "line-color": SEG_OUTLINE }
  });

  if (!map.getLayer("trail-base")) map.addLayer({
    id: "trail-base", type: "line", source: "trail-src", filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-width": ["case", ["==", ["get", "segment"], FIRE_ZONE_SEGMENT], 5, 4],
      "line-opacity": 0.85,
      "line-dasharray": ["case", ["==", ["get", "segment"], FIRE_ZONE_SEGMENT], ["literal", [2, 1.4]], ["literal", [1, 0]]],
      "line-color": buildTrailColorExpression(SEG_COLORS, FALLBACK_COLOR)
    }
  });

  if (!map.getLayer("trail-highlight")) map.addLayer({
    id: "trail-highlight", type: "line", source: "trail-src", filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "segment"], -9999]],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-width": 7, "line-opacity": 0.95, "line-color": HIGHLIGHT_COLOR }
  });

  if (!map._poiHandlersBound) {
    map.on("click", "trail-base", (e) => {
      const seg = e.features?.[0]?.properties?.segment;
      if (seg != null) selectSegment(seg, true);
    });
    map._poiHandlersBound = true;
  }
}

function initPoiLayerOnce(map) {
  if (!map.getLayer("poi-layer") && map.getSource("poi-src")) {
    map.addLayer({
      id: "poi-layer",
      type: "symbol",
      source: "poi-src",
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "icon-image": ["case",
          ["==", ["get", "category"], "water_source"], POI_CATEGORY_ICON_IDS.water_source,
          ["==", ["get", "category"], "spring"], POI_CATEGORY_ICON_IDS.spring,
          ["==", ["get", "category"], "container"], POI_CATEGORY_ICON_IDS.container,
          FALLBACK_POI_ICON_ID
        ],
        "icon-size": 0.85,
        "icon-allow-overlap": true
      }
    });

    map.on("mouseenter", "poi-layer", () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", "poi-layer", () => map.getCanvas().style.cursor = "");
    map.on("click", "poi-layer", (e) => {
      const p = e.features?.[0]?.properties || {};
      const category = POI_CATEGORY_LABELS[safeStr(p.category)] || "לא ידוע";
      const html = `
      <div style="font: 14px/1.4 system-ui; min-width:220px;">
        <div style="font-weight:900; margin-bottom:4px;">${safeStr(p.name) || "נקודת עניין"}</div>
        <div style="font-size:12px; opacity:0.8; margin-bottom:6px;">${category}</div>
        <div style="font-size:12px; opacity:0.9; margin-bottom:6px;">${safeStr(p.description) || "אין תיאור."}</div>
        ${safeStr(p.notes) ? `<div style="font-size:12px; opacity:0.85;">${safeStr(p.notes)}</div>` : ""}
      </div>`;
      new mapboxgl.Popup({ closeButton: true, maxWidth: "320px" }).setLngLat(e.lngLat).setHTML(html).addTo(map);
    });
  }
}

async function boot() {
  setLoading(true);
  updateSubtitle("טוען נתונים ומפה…");

  mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
  const map = new mapboxgl.Map({ container: "map", style: "mapbox://styles/mapbox/outdoors-v12", center: DEFAULT_VIEW.center, zoom: DEFAULT_VIEW.zoom, cooperativeGestures: true });
  map.addControl(new mapboxgl.NavigationControl(), "top-left");
  map.addControl(new mapboxgl.FullscreenControl(), "top-left");

  const gpxOk = await headOk(GPX_URL);
  const dlBtn = $("downloadGpxBtn");
  if (gpxOk) { dlBtn.style.display = "inline-flex"; dlBtn.href = GPX_URL; } else dlBtn.style.display = "none";

  const mapPromise = waitForMapLoaded(map);
  let segmentsIndex = [];
  let wholeBbox = null;
  let currentMode = "hike";

  function updateModeToggleUI() {
    const toggleBtn = $("modeToggle");
    toggleBtn.dataset.mode = currentMode;
    toggleBtn.title = currentMode === "hike" ? "מעבר למסלול אופניים" : "מעבר למסלול רגלי";
    toggleBtn.setAttribute("aria-label", toggleBtn.title);
  }

  function clearSegmentSelection() {
    setActiveSegUI(null);
    setSegmentMode(false);
    if (map.getLayer("trail-base")) map.setPaintProperty("trail-base", "line-opacity", 0.85);
    if (map.getLayer("trail-highlight")) map.setFilter("trail-highlight", ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "segment"], -9999]]);
    $("selLenPill").textContent = "מקטע: —";
    $("segDetailTitle").textContent = "בחרו מקטע להצגת מידע.";
    $("segDetailMeta").textContent = "אורך: —";
    $("segDetailText").textContent = "כאן יוצג מידע נוסף על המקטע שנבחר.";
    $("segFocusTitle").textContent = "בחרו מקטע להצגת מידע.";
    $("segFocusMeta").textContent = "אורך: —";
    $("segFocusText").textContent = "כאן יוצג מידע נוסף על המקטע שנבחר.";
    $("segFocusFireBadge").classList.add("hidden");
    renderLodging($("segFocusLodging"), []);
    renderRavshatz($("segFocusRavshatz"), null);
    renderFireSafety($("segFocusSafety"), null);
    $("segFocusSwatch").style.background = "transparent";
    updateSubtitle(`מוצג כל השביל — ${MODE_CONFIG[currentMode].label}.`);
  }

  function selectSegment(seg, zoom) {
    setActiveSegUI(seg);
    setSegmentMode(true);
    if (map.getLayer("trail-highlight")) map.setFilter("trail-highlight", ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "segment"], Number(seg)]]);
    if (map.getLayer("trail-base")) map.setPaintProperty("trail-base", "line-opacity", 0.28);

    const entry = segmentsIndex.find(s => Number(s.segment) === Number(seg));
    $("selLenPill").textContent = `מקטע ${seg}: ${fmtKm(entry?.lengthKm ?? NaN)}`;
    const meta = getSegmentMeta(seg);
    const title = `מקטע ${seg} — ${meta?.title ?? "שם המקטע"}`;
    const lengthText = `אורך משוער: ${fmtKm(entry?.lengthKm ?? NaN)}`;

    $("segDetailTitle").textContent = title;
    $("segDetailMeta").textContent = lengthText;
    $("segDetailText").textContent = meta?.summary ?? "מידע נוסף על המקטע יופיע כאן.";
    $("segFocusTitle").textContent = title;
    $("segFocusMeta").textContent = lengthText;
    $("segFocusText").textContent = meta?.summary ?? "מידע נוסף על המקטע יופיע כאן.";
    $("segFocusSwatch").style.background = segColor(seg);
    $("segFocusFireBadge").classList.toggle("hidden", Number(seg) !== FIRE_ZONE_SEGMENT);

    renderSegmentImage($("segFocusImage"), seg, meta?.title);
    renderLodging($("segFocusLodging"), meta?.lodging ?? []);
    renderRavshatz($("segFocusRavshatz"), meta?.ravshatz);
    renderFireSafety($("segFocusSafety"), seg);

    if (zoom && entry?.bbox) fitBounds(map, entry.bbox, 60);
    updateSubtitle(`נבחר מקטע ${seg} — ${MODE_CONFIG[currentMode].label}.`);
  }

  async function loadPoiData() {
    const section = $("poiControlsSection");
    try {
      const res = await fetch(POI_DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (!Array.isArray(data.features)) throw new Error("bad-geojson");

      if (!map.getSource("poi-src")) map.addSource("poi-src", { type: "geojson", data });
      else map.getSource("poi-src").setData(data);

      await ensurePoiIcons(map);
      initPoiLayerOnce(map);
      applyPoiFilters(map);

      $("poiCountPill").textContent = `נק׳: ${data.features.length}`;
      section.style.display = "block";
    } catch {
      section.style.display = "none";
      $("poiCountPill").textContent = "נק׳: —";
      showToast("קובץ נקודות העניין לא זמין כרגע.");
    }
  }

  async function loadTrailData(modeKey, { fitToBounds } = {}) {
    const mode = MODE_CONFIG[modeKey];
    if (!mode) return;
    setLoading(true);
    updateSubtitle(`טוען ${mode.label}…`);

    const res = await fetch(mode.dataUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`GeoJSON HTTP ${res.status}`);
    const trailData = await res.json();
    syncTrailSegmentsWithGeo(trailData);

    const { totalKm, segArr, allBbox, segmentMap } = computeIndexes(trailData);
    remapTrailSegments(trailData, segmentMap);
    segmentMeta = remapSegmentMeta(segmentMap);
    segmentsIndex = segArr;
    wholeBbox = allBbox;

    $("totalLenPill").textContent = `סה״כ: ${fmtKm(totalKm)}`;
    $("selLenPill").textContent = "מקטע: —";

    applyPalette(map, mode);
    buildSegList(segmentsIndex, selectSegment);

    initLayersOnce(map, trailData, selectSegment);
    map.getSource("trail-src")?.setData(trailData);

    if (fitToBounds && wholeBbox) fitBounds(map, wholeBbox, 60);
    clearSegmentSelection();
    updateSubtitle(`מוכן. ${mode.label}.`);
    setLoading(false);
  }

  try {
    await withTimeout(mapPromise, LOAD_TIMEOUT_MS, "load map");
    await ensurePoiIcons(map);
    await withTimeout(loadTrailData("hike", { fitToBounds: true }), LOAD_TIMEOUT_MS, "load geojson");
    await loadPoiData();

    $("poiType").addEventListener("change", () => applyPoiFilters(map));
    $("poiSearch").addEventListener("input", () => applyPoiFilters(map));

    $("fitAllBtn").addEventListener("click", () => {
      clearSegmentSelection();
      if (wholeBbox) fitBounds(map, wholeBbox, 60);
    });

    $("segFocusBack").addEventListener("click", () => clearSegmentSelection());

    const panelBody = $("panelBody");
    let collapsed = false;
    $("togglePanel").addEventListener("click", () => {
      collapsed = !collapsed;
      panelBody.style.display = collapsed ? "none" : "block";
    });

    updateModeToggleUI();
    $("modeToggle").addEventListener("click", async () => {
      currentMode = currentMode === "hike" ? "bike" : "hike";
      updateModeToggleUI();
      await withTimeout(loadTrailData(currentMode, { fitToBounds: true }), LOAD_TIMEOUT_MS, "load mode");
    });
  } catch (err) {
    console.error(err);
    setLoading(false);
    const msg = String(err?.message || err);
    if (msg.includes("Timeout")) {
      showToast("הטעינה לוקחת יותר מדי זמן. בדוק שיש token תקין ושקובצי ה־GeoJSON נגישים.", 9000);
      updateSubtitle("תקלה בטעינה (Timeout).");
    } else if (msg.includes("GeoJSON HTTP 404") || msg.includes("404")) {
      showToast("לא מצאתי את קובץ ה־GeoJSON בפריסה. בדוק שהקובץ נמצא בתיקייה data בשורש האתר.", 9000);
      updateSubtitle("שגיאה: GeoJSON לא נמצא.");
    } else {
      showToast("שגיאה בטעינה. פתח Console לפרטים.", 9000);
      updateSubtitle("שגיאה בטעינה.");
    }
  }
}

boot();
