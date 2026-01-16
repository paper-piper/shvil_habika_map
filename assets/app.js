import {
  MAPBOX_ACCESS_TOKEN,
  DATA_URL,
  GPX_URL,
  SEG_COLORS,
  FALLBACK_COLOR,
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
function segColor(seg) { return SEG_COLORS[seg] || FALLBACK_COLOR; }

const SEGMENT_META = [
  { segment: 1, title: "שם מקטע 1", summary: "תיאור קצר למקטע 1 (מידע נוסף יתווסף בהמשך)." },
  { segment: 2, title: "שם מקטע 2", summary: "תיאור קצר למקטע 2 (מידע נוסף יתווסף בהמשך)." },
  { segment: 3, title: "שם מקטע 3", summary: "תיאור קצר למקטע 3 (מידע נוסף יתווסף בהמשך)." },
  { segment: 4, title: "שם מקטע 4", summary: "תיאור קצר למקטע 4 (מידע נוסף יתווסף בהמשך)." },
  { segment: 5, title: "שם מקטע 5", summary: "תיאור קצר למקטע 5 (מידע נוסף יתווסף בהמשך)." },
  { segment: 6, title: "שם מקטע 6", summary: "תיאור קצר למקטע 6 (מידע נוסף יתווסף בהמשך)." },
];

function getSegmentMeta(seg) {
  return SEGMENT_META.find(item => Number(item.segment) === Number(seg));
}

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

  const segArr = [...perSeg.values()].filter(x => x.segment !== 0).sort((a,b)=>a.segment-b.segment);
  return { totalKm, segArr, allBbox: allB, pointCount: pointFeatures.length };
}

function buildSegList(segmentsIndex, selectSegment) {
  const segListEl = $("segList");
  segListEl.innerHTML = "";

  SEGMENT_META.forEach(meta => {
    const entry = segmentsIndex.find(s => Number(s.segment) === Number(meta.segment));
    const div = document.createElement("div");
    div.className = "segCard";
    div.dataset.segment = meta.segment;

    const image = document.createElement("div");
    image.className = "segImage";
    image.textContent = "תמונה";

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

function applyPoiFilters(map) {
  if (!map.getLayer("poi-layer")) return;

  const typeVal = $("poiType").value;
  const q = safeStr($("poiSearch").value).toLowerCase();

  const filters = ["all", ["==", ["geometry-type"], "Point"]];
  if (typeVal && typeVal !== "__all__") filters.push(["==", ["get", "type"], typeVal]);
  if (q) filters.push([">=", ["index-of", q, ["downcase", ["coalesce", ["get", "name"], ""]]], 0]);

  map.setFilter("poi-layer", filters);
}

function initLayersOnce(map, trailData, selectSegment) {
  if (map.getSource("trail-src")) return;

  map.addSource("trail-src", { type: "geojson", data: trailData });

  map.addLayer({
    id: "trail-base",
    type: "line",
    source: "trail-src",
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-width": 4,
      "line-opacity": 0.9,
      "line-color": [
        "case",
        ["has", "segment"],
        [
          "match",
          ["get", "segment"],
          1, segColor(1),
          2, segColor(2),
          3, segColor(3),
          4, segColor(4),
          5, segColor(5),
          6, segColor(6),
          7, segColor(7),
          FALLBACK_COLOR
        ],
        FALLBACK_COLOR
      ]
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
      "line-color": [
        "match",
        ["get", "segment"],
        1, segColor(1),
        2, segColor(2),
        3, segColor(3),
        4, segColor(4),
        5, segColor(5),
        6, segColor(6),
        7, segColor(7),
        FALLBACK_COLOR
      ]
    }
  });

  map.addLayer({
    id: "poi-layer",
    type: "circle",
    source: "trail-src",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 6,
      "circle-color": "#111827",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff"
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

  const geolocate = new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
  });
  map.addControl(geolocate, "top-left");

  const gpxOk = await headOk(GPX_URL);
  const dlBtn = $("downloadGpxBtn");
  if (gpxOk) { dlBtn.style.display = "inline-flex"; dlBtn.href = GPX_URL; }
  else dlBtn.style.display = "none";

  const dataPromise = (async () => {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`GeoJSON HTTP ${res.status}`);
    return await res.json();
  })();

  const mapPromise = waitForMapLoaded(map);

  let segmentsIndex = [];
  let wholeBbox = null;

  function clearSegmentSelection() {
    setActiveSegUI(null);
    if (map.getLayer("trail-base")) map.setPaintProperty("trail-base", "line-opacity", 0.9);
    if (map.getLayer("trail-highlight")) {
      map.setFilter("trail-highlight", ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "segment"], -9999]]);
    }
    $("selLenPill").textContent = "מקטע: —";
    $("segDetailTitle").textContent = "בחרו מקטע להצגת מידע.";
    $("segDetailMeta").textContent = "אורך: —";
    $("segDetailText").textContent = "כאן יוצג מידע נוסף על המקטע שנבחר.";
    updateSubtitle("מוצג כל השביל.");
  }

  function selectSegment(seg, zoom) {
    setActiveSegUI(seg);

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
    $("segDetailTitle").textContent = `מקטע ${seg} — ${meta?.title ?? "שם המקטע"}`;
    $("segDetailMeta").textContent = `אורך משוער: ${fmtKm(entry?.lengthKm ?? NaN)}`;
    $("segDetailText").textContent = meta?.summary ?? "מידע נוסף על המקטע יופיע כאן.";

    if (zoom && entry?.bbox) fitBounds(map, entry.bbox, 60);
    updateSubtitle(`נבחר מקטע ${seg}.`);
  }

  try {
    const [trailData] = await withTimeout(Promise.all([dataPromise, mapPromise]), LOAD_TIMEOUT_MS, "load map + geojson");

    const { totalKm, segArr, allBbox, pointCount } = computeIndexes(trailData);
    segmentsIndex = segArr;
    wholeBbox = allBbox;

    $("totalLenPill").textContent = `סה״כ: ${fmtKm(totalKm)}`;
    $("poiCountPill").textContent = `נק׳: ${pointCount}`;
    $("selLenPill").textContent = "מקטע: —";

    buildSegList(segmentsIndex, selectSegment);

    const types = Array.from(new Set(
      trailData.features
        .filter(f => f.geometry?.type === "Point")
        .map(f => safeStr(f.properties?.type))
        .filter(Boolean)
    )).sort((a,b) => a.localeCompare(b, "he"));

    const sel = $("poiType");
    while (sel.options.length > 1) sel.remove(1);
    for (const t of types) {
      const opt = document.createElement("option");
      opt.value = t; opt.textContent = t;
      sel.appendChild(opt);
    }

    initLayersOnce(map, trailData, selectSegment);
    if (wholeBbox) fitBounds(map, wholeBbox, 60);

    $("poiType").addEventListener("change", () => applyPoiFilters(map));
    $("poiSearch").addEventListener("input", () => applyPoiFilters(map));

    $("clearFilters").addEventListener("click", () => {
      $("poiType").value = "__all__";
      $("poiSearch").value = "";
      applyPoiFilters(map);
      showToast("סינון נקודות נוקה.");
    });

    $("fitAllBtn").addEventListener("click", () => {
      clearSegmentSelection();
      if (wholeBbox) fitBounds(map, wholeBbox, 60);
    });

    $("locateBtn").addEventListener("click", () => {
      try { geolocate.trigger(); }
      catch { showToast("לא הצלחתי לקבל מיקום. בדוק הרשאות GPS בדפדפן."); }
    });

    $("resetBtn").addEventListener("click", () => {
      clearSegmentSelection();
      $("poiType").value = "__all__";
      $("poiSearch").value = "";
      applyPoiFilters(map);
      if (wholeBbox) fitBounds(map, wholeBbox, 60);
      showToast("אופס. חזרנו למצב ההתחלתי.");
    });

    const panelBody = $("panelBody");
    let collapsed = false;
    $("togglePanel").addEventListener("click", () => {
      collapsed = !collapsed;
      panelBody.style.display = collapsed ? "none" : "block";
    });

    applyPoiFilters(map);

    updateSubtitle("מוכן. בחר מקטע או סנן נקודות.");
    setLoading(false);

  } catch (err) {
    console.error(err);
    setLoading(false);

    const msg = String(err?.message || err);
    if (msg.includes("Timeout")) {
      showToast("הטעינה לוקחת יותר מדי זמן. בדוק שיש token תקין וש־data/trail.geojson נגיש.", 9000);
      updateSubtitle("תקלה בטעינה (Timeout).");
    } else if (msg.includes("GeoJSON HTTP 404") || msg.includes("404")) {
      showToast("לא מצאתי את data/trail.geojson בפריסה. בדוק שהקובץ נמצא בתיקייה data בשורש האתר.", 9000);
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
