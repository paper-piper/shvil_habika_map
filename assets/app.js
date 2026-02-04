import {
  MAPBOX_ACCESS_TOKEN,
  DATA_URL,
  BICYCLE_DATA_URL,
  GPX_URL,
  SEG_COLORS,
  SEG_OUTLINE,
  FALLBACK_COLOR,
  SEG_COLORS_BIKE,
  SEG_OUTLINE_BIKE,
  FALLBACK_COLOR_BIKE,
  HIGHLIGHT_COLOR,
  HIGHLIGHT_COLOR_BIKE,
  POI_COLOR,
  POI_STROKE,
  POI_COLOR_BIKE,
  POI_STROKE_BIKE,
  LOAD_TIMEOUT_MS,
  DEFAULT_VIEW,
} from "./config.js";

const $ = (id) => document.getElementById(id);

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

  img.addEventListener("error", () => {
    container.textContent = "אין תמונה";
  });

  container.appendChild(img);
}

const SEGMENT_META = [
  { segment: 1, title: "ארץ המעיינות", summary: "זהו המקטע המהנה ביותר בשביל,ביקור במספר מעיינות יהפהיפיים עם פינות ישיבה וצל." },
  { segment: 2, title: "ממחולה לרועי", summary: "תיאור קצר למקטע 2 (מידע נוסף יתווסף בהמשך)." },
  { segment: 3, title: "מרועי לגדי", summary: "תיאור קצר למקטע 3 (מידע נוסף יתווסף בהמשך)." },
  { segment: 4, title: "מגדי  לפצאל", summary: "תיאור קצר למקטע 4 (מידע נוסף יתווסף בהמשך)." },
  { segment: 5, title: "מפצאל לחוות מלאכי השלום", summary: "תיאור קצר למקטע 5 (מידע נוסף יתווסף בהמשך)." },
  { segment: 6, title: "מחוות מלאכי השלום למבואות יריחו", summary: "תיאור קצר למקטע 6 (מידע נוסף יתווסף בהמשך)." },
];

let segmentMeta = SEGMENT_META;

function getSegmentMeta(seg) {
  return segmentMeta.find(item => Number(item.segment) === Number(seg));
}

const MODE_CONFIG = {
  hike: {
    label: "מסלול רגלי",
    dataUrl: DATA_URL,
    colors: SEG_COLORS,
    outline: SEG_OUTLINE,
    fallback: FALLBACK_COLOR,
    highlight: HIGHLIGHT_COLOR,
    poiColor: POI_COLOR,
    poiStroke: POI_STROKE,
  },
  bike: {
    label: "מסלול אופניים",
    dataUrl: BICYCLE_DATA_URL,
    colors: SEG_COLORS_BIKE,
    outline: SEG_OUTLINE_BIKE,
    fallback: FALLBACK_COLOR_BIKE,
    highlight: HIGHLIGHT_COLOR_BIKE,
    poiColor: POI_COLOR_BIKE,
    poiStroke: POI_STROKE_BIKE,
  }
};

async function headOk(url) {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch { return false; }
}

function setLoading(isLoading) {
  $("loader").style.display = isLoading ? "grid" : "none";
}
function updateSubtitle(text) { $("subtitle").textContent = text; }

function waitForMapLoaded(mapInstance) {
  return new Promise((resolve) => {
    if (mapInstance.loaded()) return resolve();
    mapInstance.once("load", () => resolve());
  });
}

async function withTimeout(promise, ms, label) {
  let to;
  const timeout = new Promise((_, reject) => {
    to = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(to);
  }
}

function fitBounds(map, bbox, padding = 50) {
  map.fitBounds([[bbox[0], bbox[1]],[bbox[2], bbox[3]]], { padding, duration: 650 });
}

function buildTrailColorExpression(colors, fallback) {
  return [
    "case",
    ["has", "segment"],
    [
      "match",
      ["get", "segment"],
      1, colors[1],
      2, colors[2],
      3, colors[3],
      4, colors[4],
      5, colors[5],
      6, colors[6],
      fallback
    ],
    fallback
  ];
}

function computeIndexes(geojson) {
  const lineFeatures = geojson.features.filter(f => f.geometry?.type === "LineString");
  const pointFeatures = geojson.features.filter(f => f.geometry?.type === "Point");

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
    if (!entry.bbox) entry.bbox = bb;
    else entry.bbox = [
      Math.min(entry.bbox[0], bb[0]),
      Math.min(entry.bbox[1], bb[1]),
      Math.max(entry.bbox[2], bb[2]),
      Math.max(entry.bbox[3], bb[3]),
    ];

    if (!allB) allB = bb;
    else allB = [
      Math.min(allB[0], bb[0]),
      Math.min(allB[1], bb[1]),
      Math.max(allB[2], bb[2]),
      Math.max(allB[3], bb[3]),
    ];
  }

  const segArrRaw = [...perSeg.values()].filter(x => x.segment !== 0);
  const sortedByNorth = segArrRaw
    .map(entry => ({
      ...entry,
      northLat: entry.bbox ? entry.bbox[3] : -Infinity
    }))
    .sort((a, b) => b.northLat - a.northLat);

  const segmentMap = new Map();
  const segArr = sortedByNorth.map((entry, index) => {
    const newSegment = index + 1;
    segmentMap.set(entry.segment, newSegment);
    return {
      ...entry,
      originalSegment: entry.segment,
      segment: newSegment
    };
  });

  return {
    totalKm,
    segArr,
    allBbox: allB,
    pointCount: pointFeatures.length,
    segmentMap
  };
}

function remapSegmentMeta(segmentMap) {
  return SEGMENT_META
    .map(meta => {
      const mapped = segmentMap.get(meta.segment);
      if (!mapped) return { ...meta };
      return { ...meta, originalSegment: meta.segment, segment: mapped };
    })
    .sort((a, b) => a.segment - b.segment);
}

function remapTrailSegments(trailData, segmentMap) {
  trailData.features.forEach(feature => {
    const current = feature.properties?.segment;
    const mapped = segmentMap.get(Number(current));
    if (mapped && feature.properties) {
      feature.properties.segment = mapped;
    }
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

    const title = document.createElement("div");
    title.className = "segTitle";
    title.textContent = `מקטע ${meta.segment} — ${meta.title}`;

    const subtitle = document.createElement("div");
    subtitle.className = "segSubtitle";
    subtitle.textContent = `אורך משוער: ${fmtKm(entry?.lengthKm ?? NaN)}`;

    const badge = document.createElement("div");
    badge.className = "segBadge";

    const swatch = document.createElement("span");
    swatch.className = "segSwatch";
    swatch.style.background = segColor(meta.segment);

    const badgeText = document.createElement("span");
    badgeText.textContent = "לחצו למידע נוסף וזום";

    badge.appendChild(swatch);
    badge.appendChild(badgeText);

    content.appendChild(title);
    content.appendChild(subtitle);
    content.appendChild(badge);

    div.appendChild(image);
    div.appendChild(content);

    div.addEventListener("click", () => selectSegment(meta.segment, true));
    segListEl.appendChild(div);
  });
}

function setActiveSegUI(seg) {
  [...$("segList").querySelectorAll(".segCard")].forEach(el => {
    el.classList.toggle("active", Number(el.dataset.segment) === Number(seg));
  });
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
  const q = safeStr($("poiSearch").value).toLowerCase();

  const filters = ["all", ["==", ["geometry-type"], "Point"]];
  if (typeVal && typeVal !== "__all__") filters.push(["==", ["get", "type"], typeVal]);
  if (q) filters.push([">=", ["index-of", q, ["downcase", ["coalesce", ["get", "name"], ""]]], 0]);

  map.setFilter("poi-layer", filters);
}

function applyPalette(map, palette) {
  activeColors = palette.colors;
  activeFallback = palette.fallback;

  if (map.getLayer("trail-halo")) {
    map.setPaintProperty("trail-halo", "line-color", palette.outline);
  }
  if (map.getLayer("trail-base")) {
    map.setPaintProperty("trail-base", "line-color", buildTrailColorExpression(palette.colors, palette.fallback));
  }
  if (map.getLayer("trail-highlight")) {
    map.setPaintProperty("trail-highlight", "line-color", palette.highlight);
  }
  if (map.getLayer("poi-layer")) {
    map.setPaintProperty("poi-layer", "circle-color", palette.poiColor);
    map.setPaintProperty("poi-layer", "circle-stroke-color", palette.poiStroke);
  }
}

function initLayersOnce(map, trailData, selectSegment) {
  if (map.getSource("trail-src")) return;

  map.addSource("trail-src", { type: "geojson", data: trailData });

  map.addLayer({
    id: "trail-halo",
    type: "line",
    source: "trail-src",
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-width": 6,
      "line-opacity": 0.9,
      "line-color": SEG_OUTLINE
    }
  });

  map.addLayer({
    id: "trail-base",
    type: "line",
    source: "trail-src",
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-width": 4,
      "line-opacity": 0.85,
      "line-color": buildTrailColorExpression(SEG_COLORS, FALLBACK_COLOR)
    }
  });

  map.addLayer({
    id: "trail-highlight",
    type: "line",
    source: "trail-src",
    filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "segment"], -9999]],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-width": 7,
      "line-opacity": 0.95,
      "line-color": HIGHLIGHT_COLOR
    }
  });

  map.addLayer({
    id: "poi-layer",
    type: "circle",
    source: "trail-src",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 6,
      "circle-color": POI_COLOR,
      "circle-stroke-width": 2,
      "circle-stroke-color": POI_STROKE
    }
  });

  map.on("mouseenter", "poi-layer", () => map.getCanvas().style.cursor = "pointer");
  map.on("mouseleave", "poi-layer", () => map.getCanvas().style.cursor = "");

  map.on("click", "poi-layer", (e) => {
    const f = e.features && e.features[0];
    if (!f) return;

    const p = f.properties || {};
    const name = safeStr(p.name) || "נקודת עניין";
    const type = safeStr(p.type);
    const desc = safeStr(p.desc).replace(/\n/g, "<br/>");

    const html = `
      <div style="font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial; min-width: 220px;">
        <div style="font-weight:900; margin-bottom:4px;">${name}</div>
        ${type ? `<div style="font-size:12px; opacity:0.8; margin-bottom:6px;">${type}</div>` : ""}
        ${desc ? `<div style="font-size:12px; opacity:0.9;">${desc}</div>` : `<div style="font-size:12px; opacity:0.7;">אין תיאור.</div>`}
      </div>
    `;

    new mapboxgl.Popup({ closeButton: true, maxWidth: "320px" })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  });

  map.on("click", "trail-base", (e) => {
    const f = e.features && e.features[0];
    const seg = f?.properties?.segment;
    if (seg != null) selectSegment(seg, true);
  });
}

async function boot() {
  setLoading(true);
  updateSubtitle("טוען נתונים ומפה…");

  mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/outdoors-v12",
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    cooperativeGestures: true
  });

  map.addControl(new mapboxgl.NavigationControl(), "top-left");
  map.addControl(new mapboxgl.FullscreenControl(), "top-left");

  const gpxOk = await headOk(GPX_URL);
  const dlBtn = $("downloadGpxBtn");
  if (gpxOk) { dlBtn.style.display = "inline-flex"; dlBtn.href = GPX_URL; }
  else dlBtn.style.display = "none";

  const mapPromise = waitForMapLoaded(map);

  let segmentsIndex = [];
  let wholeBbox = null;
  let currentMode = "hike";

  function clearSegmentSelection() {
    setActiveSegUI(null);
    setSegmentMode(false);
    if (map.getLayer("trail-base")) map.setPaintProperty("trail-base", "line-opacity", 0.85);
    if (map.getLayer("trail-highlight")) {
      map.setFilter("trail-highlight", ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "segment"], -9999]]);
    }
    $("selLenPill").textContent = "מקטע: —";
    $("segDetailTitle").textContent = "בחרו מקטע להצגת מידע.";
    $("segDetailMeta").textContent = "אורך: —";
    $("segDetailText").textContent = "כאן יוצג מידע נוסף על המקטע שנבחר.";
    $("segFocusTitle").textContent = "בחרו מקטע להצגת מידע.";
    $("segFocusMeta").textContent = "אורך: —";
    $("segFocusText").textContent = "כאן יוצג מידע נוסף על המקטע שנבחר.";
    $("segFocusSwatch").style.background = "transparent";
    updateSubtitle(`מוצג כל השביל — ${MODE_CONFIG[currentMode].label}.`);
  }

  function selectSegment(seg, zoom) {
    setActiveSegUI(seg);
    setSegmentMode(true);

    if (map.getLayer("trail-highlight")) {
      map.setFilter("trail-highlight", ["all",
        ["==", ["geometry-type"], "LineString"],
        ["==", ["get", "segment"], Number(seg)]
      ]);
    }
    if (map.getLayer("trail-base")) map.setPaintProperty("trail-base", "line-opacity", 0.28);

    const entry = segmentsIndex.find(s => Number(s.segment) === Number(seg));
    $("selLenPill").textContent = `מקטע ${seg}: ${fmtKm(entry?.lengthKm ?? NaN)}`;
    const meta = getSegmentMeta(seg);
    const title = `מקטע ${seg} — ${meta?.title ?? "שם המקטע"}`;
    const lengthText = `אורך משוער: ${fmtKm(entry?.lengthKm ?? NaN)}`;
    const summaryText = meta?.summary ?? "מידע נוסף על המקטע יופיע כאן.";

    $("segDetailTitle").textContent = title;
    $("segDetailMeta").textContent = lengthText;
    $("segDetailText").textContent = summaryText;
    $("segFocusTitle").textContent = title;
    $("segFocusMeta").textContent = lengthText;
    $("segFocusText").textContent = summaryText;
    $("segFocusSwatch").style.background = segColor(seg);
    renderSegmentImage($("segFocusImage"), seg, meta?.title);

    if (zoom && entry?.bbox) fitBounds(map, entry.bbox, 60);
    updateSubtitle(`נבחר מקטע ${seg} — ${MODE_CONFIG[currentMode].label}.`);
  }

  function updateModeToggleUI() {
    const toggleBtn = $("modeToggle");
    if (!toggleBtn) return;
    toggleBtn.dataset.mode = currentMode;
    toggleBtn.title = currentMode === "hike" ? "מעבר למסלול אופניים" : "מעבר למסלול רגלי";
    toggleBtn.setAttribute("aria-label", toggleBtn.title);
  }

  async function loadTrailData(modeKey, { fitToBounds } = {}) {
    const mode = MODE_CONFIG[modeKey];
    if (!mode) return;
    setLoading(true);
    updateSubtitle(`טוען ${mode.label}…`);

    const res = await fetch(mode.dataUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`GeoJSON HTTP ${res.status}`);
    const trailData = await res.json();

    const { totalKm, segArr, allBbox, pointCount, segmentMap } = computeIndexes(trailData);
    remapTrailSegments(trailData, segmentMap);
    segmentMeta = remapSegmentMeta(segmentMap);
    segmentsIndex = segArr;
    wholeBbox = allBbox;

    $("totalLenPill").textContent = `סה״כ: ${fmtKm(totalKm)}`;
    $("poiCountPill").textContent = `נק׳: ${pointCount}`;
    $("selLenPill").textContent = "מקטע: —";

    applyPalette(map, mode);
    buildSegList(segmentsIndex, selectSegment);

    initLayersOnce(map, trailData, selectSegment);
    const source = map.getSource("trail-src");
    if (source) source.setData(trailData);

    if (fitToBounds && wholeBbox) fitBounds(map, wholeBbox, 60);
    clearSegmentSelection();
    updateSubtitle(`מוכן. ${mode.label}.`);
    setLoading(false);
  }

  try {
    await withTimeout(mapPromise, LOAD_TIMEOUT_MS, "load map");
    await withTimeout(loadTrailData("hike", { fitToBounds: true }), LOAD_TIMEOUT_MS, "load geojson");

    $("fitAllBtn").addEventListener("click", () => {
      clearSegmentSelection();
      if (wholeBbox) fitBounds(map, wholeBbox, 60);
    });

    $("segFocusBack").addEventListener("click", () => {
      clearSegmentSelection();
    });

    $("segFocusBack").addEventListener("click", () => {
      clearSegmentSelection();
    });

    const panelBody = $("panelBody");
    let collapsed = false;
    $("togglePanel").addEventListener("click", () => {
      collapsed = !collapsed;
      panelBody.style.display = collapsed ? "none" : "block";
    });

    updateModeToggleUI();
    $("modeToggle").addEventListener("click", async () => {
      const nextMode = currentMode === "hike" ? "bike" : "hike";
      currentMode = nextMode;
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
    } else if (msg.toLowerCase().includes("access token")) {
      showToast("נראה שה-token של Mapbox לא תקין/חסר. הדבק token ציבורי (pk...).", 9000);
      updateSubtitle("שגיאה: Token.");
    } else {
      showToast("שגיאה בטעינה. פתח Console לפרטים.", 9000);
      updateSubtitle("שגיאה בטעינה.");
    }
  }
}

boot();
