// 足跡地圖的 3D 地球（MapLibre）：衛星底圖、去過的國家亮起來、從台灣拉航線到每個去過的國家
// 首頁每次重畫都會換掉 HTML，所以地球放在固定的區塊，重畫後搬回 #globeslot，轉到哪裡不會跑掉
// MapLibre 和國界資料都很大，切到 3D 才載入
// 衛星影像：EOX Sentinel-2 cloudless 2016（CC BY 4.0，免金鑰）；沒網路時只看得到國界色塊

const TW = [120.96, 23.7]; // 航線起點：台灣
const HOME = [112, 18]; // 一開始和按「回到台灣」時看的中心：東亞、東南亞都在畫面上
const SAT = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';
const CREDIT = '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX・Copernicus 2016';
const LIT = '#ffb547', ARC = '#ffd27a';

let ready, map, box, popup, shapes, lastKey = '', spin = 0, idleAt = 0, plane = 0;
// 依框的大小算縮放，讓整顆地球剛好放進框裡（地球在 zoom 0 時半徑約 81 像素）
const fitZoom = () => Math.log2(0.44 * Math.min(box.clientWidth, box.clientHeight) / 81);
const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function load() {
  ready ??= Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl.css'),
    import('world-atlas/countries-50m.json'),
    import('topojson-client'),
  ]).then(([ml, , atlas, topo]) => {
    const fc = topo.feature(atlas.default || atlas, (atlas.default || atlas).objects.countries);
    shapes = fc.features.filter(f => f.id).map(f => ({ ...f, properties: { id: String(f.id) } }));
    return ml.default || ml;
  }).catch(err => { ready = null; throw err; });
  return ready;
}

// 國家的代表點：最大那塊陸地的外框中心（俄羅斯、美國這種跨很大的國家才不會落在海上）
function centerOf(f) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let best = null, area = -1;
  for (const p of polys) {
    const ring = p[0];
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    if (Math.abs(a) > area) { area = Math.abs(a); best = ring; }
  }
  // 經度跨 180 度的陸地（例：俄羅斯東端）先攤平再算
  const xs = best.map(c => c[0]), ys = best.map(c => c[1]);
  const wrap = Math.max(...xs) - Math.min(...xs) > 180;
  const xx = wrap ? xs.map(x => (x < 0 ? x + 360 : x)) : xs;
  let x = (Math.min(...xx) + Math.max(...xx)) / 2;
  if (x > 180) x -= 360;
  return [x, (Math.min(...ys) + Math.max(...ys)) / 2];
}

// 大圓航線：沿著地球表面最短的路徑取點，中間往上拱一點看起來像飛行路線
function arc(a, b, n = 64) {
  const r = Math.PI / 180, [l1, p1] = [a[0] * r, a[1] * r], [l2, p2] = [b[0] * r, b[1] * r];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (!d) return [a, b];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push([Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r]);
  }
  // 經度跳過 180 度時接起來，線才不會橫切整個地球
  for (let i = 1; i < out.length; i++) {
    while (out[i][0] - out[i - 1][0] > 180) out[i][0] -= 360;
    while (out[i - 1][0] - out[i][0] > 180) out[i][0] += 360;
  }
  return out;
}

function style() {
  return {
    version: 8,
    projection: { type: 'globe' },
    sources: {
      sat: { type: 'raster', tiles: [SAT], tileSize: 256, maxzoom: 13, attribution: CREDIT },
      land: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      arcs: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      planes: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': '#0b2a45' } },
      // 沒網路、衛星圖還沒載入時，用國界色塊當陸地
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#2d4a3e' } },
      { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 200 } },
      { id: 'lit', type: 'fill', source: 'land', filter: ['>', ['get', 'n'], 0], paint: { 'fill-color': LIT, 'fill-opacity': ['interpolate', ['linear'], ['get', 'n'], 1, 0.35, 5, 0.6] } },
      { id: 'border', type: 'line', source: 'land', paint: { 'line-color': '#ffffff', 'line-opacity': 0.25, 'line-width': 0.6 } },
      { id: 'litline', type: 'line', source: 'land', filter: ['>', ['get', 'n'], 0], paint: { 'line-color': LIT, 'line-width': 1.4 } },
      { id: 'arcglow', type: 'line', source: 'arcs', layout: { 'line-cap': 'round' }, paint: { 'line-color': ARC, 'line-width': 6, 'line-opacity': 0.18, 'line-blur': 4 } },
      { id: 'arc', type: 'line', source: 'arcs', layout: { 'line-cap': 'round' }, paint: { 'line-color': ARC, 'line-width': 1.6, 'line-opacity': 0.9 } },
      { id: 'plane', type: 'circle', source: 'planes', paint: { 'circle-radius': 3.2, 'circle-color': '#fff', 'circle-stroke-color': ARC, 'circle-stroke-width': 2 } },
      { id: 'home', type: 'circle', source: 'planes', filter: ['==', ['get', 'home'], true], paint: { 'circle-radius': 5, 'circle-color': '#e8792b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
    ],
  };
}

// 沒有在操作時慢慢自轉；手一碰就停，放開 4 秒後再繼續
function rotate() {
  cancelAnimationFrame(spin);
  if (reduce()) return;
  let t0 = performance.now();
  const step = t => {
    const dt = t - t0; t0 = t;
    if (map && document.visibilityState === 'visible' && box.isConnected && t > idleAt && !map.isMoving() && map.getZoom() < fitZoom() + 1) {
      const c = map.getCenter();
      map.jumpTo({ center: [c.lng + dt * 0.0015, c.lat] });
    }
    spin = requestAnimationFrame(step);
  };
  spin = requestAnimationFrame(step);
}

// 每條航線上有一個小白點從台灣飛出去
function fly(lines) {
  cancelAnimationFrame(plane);
  const src = map.getSource('planes');
  const home = { type: 'Feature', properties: { home: true }, geometry: { type: 'Point', coordinates: TW } };
  const draw = k => src.setData({ type: 'FeatureCollection', features: [home, ...lines.map(l => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: l[Math.min(l.length - 1, Math.floor(k * l.length))] } }))] });
  if (reduce() || !lines.length) { draw(1); return; }
  const t0 = performance.now();
  const step = t => {
    if (!box.isConnected) { plane = 0; return; }
    draw(((t - t0) / 4000) % 1);
    plane = requestAnimationFrame(step);
  };
  plane = requestAnimationFrame(step);
}

// data：{ visited: Map(國家代碼 → 去過幾趟), nameOf: 代碼 → 國名 }
export async function syncGlobe(data) {
  const ml = await load();
  const slot = document.getElementById('globeslot'); // 載入期間畫面可能重畫過，重新找一次
  if (!slot) return;
  if (!map) {
    box = document.createElement('div');
    box.className = 'gmap';
    slot.appendChild(box);
    map = new ml.Map({
      container: box, style: style(), center: HOME, zoom: fitZoom(), minZoom: fitZoom() - 0.4, maxZoom: 8,
      attributionControl: { compact: true }, cooperativeGestures: true, dragRotate: false, pitchWithRotate: false,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': '按住 Ctrl 再滾動滑鼠可以縮放',
        'CooperativeGesturesHandler.MacHelpText': '按住 ⌘ 再滾動滑鼠可以縮放',
        'CooperativeGesturesHandler.MobileHelpText': '用兩指移動地球',
      },
    });
    popup = new ml.Popup({ closeButton: false, offset: 8, className: 'gpop' });
    const hold = () => { idleAt = Infinity; };
    const free = () => { idleAt = performance.now() + 4000; };
    map.on('mousedown', hold); map.on('touchstart', hold); map.on('mouseup', free); map.on('touchend', free);
    map.on('wheel', () => { idleAt = performance.now() + 4000; });
    map.on('click', 'lit', e => {
      const p = e.features[0].properties;
      popup.setLngLat(e.lngLat).setText(`${p.name}・${p.n} 趟`).addTo(map);
    });
    map.on('mouseenter', 'lit', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'lit', () => { map.getCanvas().style.cursor = ''; });
    await new Promise(ok => (map.loaded() ? ok() : map.once('load', ok)));
    box.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'); // 版權文字先收成 ⓘ，點了才展開
    rotate();
  }
  if (box.parentNode !== slot) { slot.appendChild(box); map.resize(); map.setMinZoom(fitZoom() - 0.4); }
  const key = JSON.stringify([...data.visited]);
  if (key === lastKey) return;
  lastKey = key;
  const land = shapes.map(f => {
    const n = data.visited.get(f.properties.id) || 0;
    return { ...f, properties: { id: f.properties.id, n, name: n ? data.nameOf(f.properties.id) : '' } };
  });
  map.getSource('land').setData({ type: 'FeatureCollection', features: land });
  const lines = land.filter(f => f.properties.n && f.properties.id !== '158').map(f => arc(TW, centerOf(f)));
  map.getSource('arcs').setData({ type: 'FeatureCollection', features: lines.map(l => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l } })) });
  fly(lines);
}

// 「回到台灣」按鈕
export function resetGlobe() {
  if (!map) return;
  idleAt = performance.now() + 4000;
  map.flyTo({ center: HOME, zoom: fitZoom(), duration: 900 });
}
