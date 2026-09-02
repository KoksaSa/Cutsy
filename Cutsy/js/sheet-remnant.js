// ═══════════════════════════════════════════════════════════════
// SilikinK — Sheet Remnant Module v2.0
// ═══════════════════════════════════════════════════════════════
// Работа с остатками листа: загрузка фото, калибровка,
// создание контура, проверка размещения деталей (ray casting).
// ═══════════════════════════════════════════════════════════════

'use strict';

/** @typedef {{x: number, y: number}} Point */
/** @typedef {{x1: number, y1: number, x2: number, y2: number}} Edge */

const REMNANT_CONFIG = Object.freeze({
    PLACEMENT_GAP_MM: 3,
    DIALOG_Z_INDEX: 10001,
    CONNECTIVITY_TOLERANCE_MM: 3,
    MIN_CALIBRATION_DISTANCE_PX: 10,
    EDGE_CHAIN_TOLERANCE_MM: 1.0,
    POLYLINE_CLOSE_TOLERANCE_MM: 3,
    EDGE_DEDUP_PRECISION: 2,
    ARC_SEGMENTS_MIN: 8,
    ARC_SEGMENTS_MAX: 48,
    ARC_CHORD_DIVISOR: 10,
    CIRCLE_SEGMENTS_MIN: 16,
    CIRCLE_SEGMENTS_MAX: 64,
    CIRCLE_SEGMENTS_FACTOR: 0.4,
    RECT_SUBDIVISIONS: 3,
    DEBUG: false,
    DEBUG_LOG_LIMIT: 10,
});

// ─── УТИЛИТЫ ─────────────────────────────────────────────────

/** Расстояние между двумя точками */
function _dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Сместить геометрический объект на (-offX, -offY) для нормализации к (0,0) */
function _shiftObject(obj, offX, offY) {
    const clone = { ...obj };
    const type = _resolveObjType(obj);

    switch (type) {
        case 'line':
            clone.x1 -= offX; clone.y1 -= offY;
            clone.x2 -= offX; clone.y2 -= offY;
            break;
        case 'rect':
            clone.x -= offX; clone.y -= offY;
            break;
        case 'circle':
        case 'arc':
            clone.cx = (obj.cx || 0) - offX;
            clone.cy = (obj.cy || 0) - offY;
            break;
        case 'polygon':
            // v4.46 H2: обрабатываем plain-object polygon {vertices:[...]} без getVertices.
            const polyV = (typeof obj.getVertices === 'function') ? obj.getVertices() : (obj.vertices || []);
            if (polyV.length > 0) {
                const shiftedV = polyV.map(p => ({ x: p.x - offX, y: p.y - offY }));
                clone.vertices = shiftedV;
                if (typeof obj.getVertices === 'function') {
                    clone.getVertices = () => shiftedV;
                }
            }
            break;
        case 'polyline':
        case 'lwpolyline': {
            const pts = obj.points || obj.vertices || [];
            const shifted = pts.map(p => ({ x: p.x - offX, y: p.y - offY }));
            clone.points = shifted;
            clone.vertices = shifted;
            if (obj.closed !== undefined) clone.closed = obj.closed;
            if (obj.isClosed !== undefined) clone.isClosed = obj.isClosed;
            break;
        }
    }
    return clone;
}

/**
 * Определить тип объекта (obj.type или по свойствам).
 * Нормализует к lowercase для совместимости с Fabric.js ('Line' → 'line').
 */
function _resolveObjType(obj) {
    if (!obj) return 'unknown';
    let t = obj.type;
    if (!t) {
        if (typeof getShapeType === 'function') return getShapeType(obj);
        if (obj.x1 !== undefined && obj.y1 !== undefined && obj.x2 !== undefined && obj.y2 !== undefined) return 'line';
        if (obj.cx !== undefined && obj.cy !== undefined && obj.radius !== undefined && obj.startAngle !== undefined) return 'arc';
        if (obj.cx !== undefined && obj.cy !== undefined && obj.radius !== undefined && obj.sides !== undefined) return 'polygon';
        if (obj.cx !== undefined && obj.cy !== undefined && obj.radius !== undefined) return 'circle';
        if (obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) return 'rect';
        if (obj.points || obj.vertices) return 'polyline';
        return 'unknown';
    }
    return t.toLowerCase();
}

/**
 * Вычислить sweep дуги с учётом direction.
 * @param {number} startAngle
 * @param {number} endAngle
 * @param {number|string} direction — 1, -1, 'CW', 'CCW' или undefined
 * @returns {{sweep: number, dir: number}} — sweep > 0, dir = 1 или -1
 */
function _computeArcSweep(startAngle, endAngle, direction) {
    let dir;
    if (direction === 'CW') dir = -1;
    else if (direction === 'CCW') dir = 1;
    else dir = direction !== undefined ? (direction >= 0 ? 1 : -1) : 1;

    let sweep;
    if (dir >= 0) { sweep = endAngle - startAngle; if (sweep <= 0) sweep += 2 * Math.PI; }
    else { sweep = startAngle - endAngle; if (sweep <= 0) sweep += 2 * Math.PI; }

    return { sweep, dir };
}

/** Вычислить bounding box массива геометрических объектов */
function _calculateBounds(objs) {
    if (!objs || objs.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const obj of objs) {
        const pts = _getPointsFromObject(obj);
        for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Извлечь характерные точки из геометрического объекта */
function _getPointsFromObject(obj) {
    if (!obj) return [];
    if (typeof obj.getPoints === 'function') return obj.getPoints();

    const type = _resolveObjType(obj);
    switch (type) {
        case 'line': return [{ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }];
        case 'circle': {
            const { cx, cy, radius: r } = obj;
            return [
                { x: cx, y: cy },
                { x: cx + r, y: cy }, { x: cx - r, y: cy },
                { x: cx, y: cy + r }, { x: cx, y: cy - r }
            ];
        }
        case 'rect': {
            // v4.46 H1: учитываем rotation (obj.angle) для повёрнутых прямоугольников.
            const { x, y, width: w, height: h, angle: ang } = obj;
            const corners = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
            if (ang && Math.abs(ang) > 0.001) {
                const cx = x + w / 2, cy = y + h / 2;
                const cos = Math.cos(ang), sin = Math.sin(ang);
                return corners.map(p => ({
                    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
                    y: cy + (p.x - cx) * sin + (p.y - cy) * cos
                }));
            }
            return corners;
        }
        case 'polygon':
            return typeof obj.getVertices === 'function' ? obj.getVertices() : (obj.vertices || []);
        case 'polyline':
        case 'lwpolyline':
            return obj.points || obj.vertices || [];
        case 'arc': {
            const acx = obj.cx || 0, acy = obj.cy || 0, r = Math.abs(obj.radius || 0);
            if (r <= 0) return [];
            const sa = obj.startAngle ?? 0, ea = obj.endAngle ?? (2 * Math.PI);
            const { sweep, dir } = _computeArcSweep(sa, ea, obj.direction);
            const segs = 12;
            const step = sweep / segs;
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const a = sa + dir * step * i;
                pts.push({ x: acx + Math.cos(a) * r, y: acy + Math.sin(a) * r });
            }
            return pts;
        }
        default: return [];
    }
}

// ═══════════════════════════════════════════════════════════════
// ЗАГРУЗКА ФОТО ОСТАТКА
// ═══════════════════════════════════════════════════════════════

let _sheetImageObjectURL = null;
let _prevSheetSize = null;
let _prevShowSheetView = null;

/** Освободить blob URL предыдущего изображения */
function _revokeImageURL() {
    if (_sheetImageObjectURL) {
        URL.revokeObjectURL(_sheetImageObjectURL);
        _sheetImageObjectURL = null;
    }
}

/** Загрузить фото остатка листа и перейти в режим калибровки */
async function loadSheetRemnantImage(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('⚠️ Пожалуйста, выберите изображение (JPG/PNG/WebP)');
        return;
    }
    _revokeImageURL();
    _prevSheetSize = sheetSize;
    _prevShowSheetView = showSheetView;

    try {
        const img = new Image();
        const loadPromise = new Promise((resolve, reject) => {
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Не удалось декодировать изображение'));
        });
        _sheetImageObjectURL = URL.createObjectURL(file);
        img.src = _sheetImageObjectURL;
        await loadPromise;

        sheetBackgroundImage = img;
        window.sheetBackgroundImage = img;
        sheetImageScale = 1;
        window.sheetImageScale = 1;
        sheetImageSize = { width: img.width, height: img.height };
        window.sheetBackgroundImageVisible = true;

        showSheetView = true;
        isCalibrating = true;
        window.isCalibrating = true;
        calibratePoint1 = null;
        calibratePoint2 = null;
        sheetSize = { width: img.width, height: img.height };

        // v4.56: Показываем панели инструментов листа
        ['markupRectTools', 'cutRemnantTools', 'rulerTools', 'overlapTools'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });
        syncSheetRemnantVars();
        showCalibrationDialog();
        render();
    } catch (err) {
        alert('❌ Ошибка загрузки фото: ' + err.message);
        _revokeImageURL();
    }
}

// ═══════════════════════════════════════════════════════════════
// ДИАЛОГ КАЛИБРОВКИ
// ═══════════════════════════════════════════════════════════════

function _syncAlignState() { window.isAlignMode = isAlignMode; window.alignPoint1 = alignPoint1; window.alignPoint2 = alignPoint2; window.alignPoint3 = alignPoint3; }
let alignPoint1 = null, alignPoint2 = null, alignPoint3 = null, isAlignMode = false;
function _rotatePoint(x, y, cos, sin) { return { x: x * cos - y * sin, y: x * sin + y * cos }; }
function showCalibrationDialog() {
    let dialog = document.getElementById('calibrationDialog');
    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = 'calibrationDialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #252526;
            border: 1px solid #3c3c3c;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.7);
            z-index: ${REMNANT_CONFIG.DIALOG_Z_INDEX};
            min-width: 400px;
            max-width: 95vw;
            font-family: system-ui, -apple-system, sans-serif;
        `;
        dialog.innerHTML = `
            <h3 style="margin:0 0 15px 0;color:#007acc;font-size:16px;">📏 Калибровка фото остатка</h3>
            <div style="color:#ccc;font-size:12px;line-height:1.8;margin-bottom:15px;">
                <strong>Шаг 1:</strong> Кликните первую точку на фото<br>
                <strong>Шаг 2:</strong> Кликните вторую точку на фото<br>
                <strong>Шаг 3:</strong> Введите реальное расстояние между точками (мм)
            </div>
            <div style="background:#1e1e1e;padding:10px;border-radius:4px;margin-bottom:15px;">
                <div style="color:#aaa;font-size:11px;margin-bottom:5px;">Точка 1:</div>
                <div id="calibratePoint1Info" style="color:#fff;font-size:13px;">Не выбрана — кликните на фото</div>
                <div style="color:#aaa;font-size:11px;margin-bottom:5px;margin-top:8px;">Точка 2:</div>
                <div id="calibratePoint2Info" style="color:#fff;font-size:13px;">Не выбрана</div>
            </div>
            <div id="calibrateDistanceSection" style="display:none;margin-bottom:15px;">
                <label style="color:#aaa;font-size:11px;display:block;margin-bottom:5px;">📏 Расстояние между точками (пиксели):</label>
                <div id="calibratePixelDist" style="color:#fff;font-size:13px;padding:8px;background:#1e1e1e;border-radius:4px;"></div>
                <label style="color:#aaa;font-size:11px;display:block;margin-bottom:5px;margin-top:10px;">📐 Реальный размер (мм):</label>
                <input type="number" id="calibrateRealDist" value="1000" min="1" max="100000" step="1"
                    style="width:100%;padding:8px;background:#3c3c3c;color:#fff;border:1px solid #555;border-radius:4px;font-size:13px;box-sizing:border-box;">
                <div style="color:#2d7d2d;font-size:11px;margin-top:8px;">📊 Масштаб: <span id="calibrateScaleInfo">-</span> px/мм</div>
            </div>
            <div id="calibrateError" style="color:#ff6b6b;font-size:12px;margin-bottom:10px;display:none;"></div>
            <div style="border-top:1px solid #3c3c3c;margin-top:15px;padding-top:15px;">
                <h4 style="margin:0 0 10px 0;color:#007acc;font-size:14px;">Выравнивание по осям (опционально)</h4>
                <div style="color:#aaa;font-size:11px;line-height:1.6;margin-bottom:10px;">
                    Поставьте 3 точки на фото:<br>
                    <strong style="color:#ff6b6b;">Точка 1</strong> — вершина (станет 0,0)<br>
                    <strong style="color:#4ad97a;">Точка 2</strong> — направление оси Y<br>
                    <strong style="color:#4a9ad9;">Точка 3</strong> — направление оси X
                </div>
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
                    <div id="alignPoint1Info" style="color:#ff6b6b;font-size:12px;flex:1;">Точка 1: ❌</div>
                    <div id="alignPoint2Info" style="color:#4ad97a;font-size:12px;flex:1;">Точка 2: ❌</div>
                    <div id="alignPoint3Info" style="color:#4a9ad9;font-size:12px;flex:1;">Точка 3: ❌</div>
                </div>
                <div style="display:flex;gap:8px;">
                    <button id="alignEnableBtn" style="padding:6px 12px;background:#5a4a7a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">Поставить точки</button>
                    <button id="alignResetBtn" style="padding:6px 12px;background:#3c3c3c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">Сбросить</button>
                    <button id="alignApplyBtn" style="padding:6px 12px;background:#007acc;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;" disabled>Выровнять</button>
                </div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:15px;">
                <button id="calibrateReset" style="padding:8px 16px;background:#5a4a7a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">🔄 Сбросить</button>
                <button id="calibrateCancel" style="padding:8px 16px;background:#3c3c3c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Отмена</button>
                <button id="calibrateApply" style="padding:8px 16px;background:#007acc;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;" disabled>✅ Применить</button>
            </div>
        `;
        document.body.appendChild(dialog);

        document.getElementById('calibrateCancel').addEventListener('click', cancelCalibration);
        document.getElementById('calibrateReset').addEventListener('click', () => {
            calibratePoint1 = null; calibratePoint2 = null;
            updateCalibrationDialog(); render();
        });
        document.getElementById('calibrateApply').addEventListener('click', applyCalibration);
        document.getElementById('calibrateRealDist').addEventListener('input', updateCalibrationDialog);
        document.getElementById('calibrateRealDist').addEventListener('focus', function() { this.select(); });
        document.getElementById('calibrateRealDist').addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
                const btn = document.getElementById('calibrateApply');
                if (btn && !btn.disabled) applyCalibration();
            }
        });
        document.getElementById('alignEnableBtn').addEventListener('click', () => {
            isAlignMode = !isAlignMode; _syncAlignState();
            const b = document.getElementById('alignEnableBtn');
            b.textContent = isAlignMode ? 'Завершить' : 'Поставить точки';
            b.style.background = isAlignMode ? '#007acc' : '#5a4a7a';
            render();
        });
        document.getElementById('alignResetBtn').addEventListener('click', () => {
            alignPoint1 = null; alignPoint2 = null; alignPoint3 = null; _syncAlignState(); updateAlignDialog(); render();
        });
        document.getElementById('alignApplyBtn').addEventListener('click', applyAlignment);
    }
    dialog.style.display = 'block';
    updateCalibrationDialog(); updateAlignDialog();
}
function updateAlignDialog() {
    const p1 = document.getElementById('alignPoint1Info');
    const p2 = document.getElementById('alignPoint2Info');
    const p3 = document.getElementById('alignPoint3Info');
    const applyBtn = document.getElementById('alignApplyBtn');
    if (!p1) return;
    p1.textContent = alignPoint1 ? 'Точка 1: ✅ (' + Math.round(alignPoint1.x) + ',' + Math.round(alignPoint1.y) + ')' : 'Точка 1: ❌';
    p2.textContent = alignPoint2 ? 'Точка 2: ✅ (' + Math.round(alignPoint2.x) + ',' + Math.round(alignPoint2.y) + ')' : 'Точка 2: ❌';
    p3.textContent = alignPoint3 ? 'Точка 3: ✅ (' + Math.round(alignPoint3.x) + ',' + Math.round(alignPoint3.y) + ')' : 'Точка 3: ❌';
    if (applyBtn) applyBtn.disabled = !(alignPoint1 && alignPoint2 && alignPoint3);
}
function handleAlignClick(x, y) {
    if (!isAlignMode) return false;
    if (!alignPoint1) { alignPoint1 = { x, y }; _syncAlignState(); updateAlignDialog(); render(); return true; }
    if (!alignPoint2) { if (_dist({ x, y }, alignPoint1) < 10) return false; alignPoint2 = { x, y }; _syncAlignState(); updateAlignDialog(); render(); return true; }
    if (!alignPoint3) { if (_dist({ x, y }, alignPoint1) < 10) return false; alignPoint3 = { x, y }; _syncAlignState(); updateAlignDialog(); render(); return true; }
    return false;
}
function applyAlignment() {
    if (!alignPoint1 || !alignPoint2 || !alignPoint3) return;
    const dx = alignPoint3.x - alignPoint1.x;
    const dy = alignPoint3.y - alignPoint1.y;
    const angle = Math.atan2(dy, dx);
    const offX = alignPoint1.x;
    const offY = alignPoint1.y;
    window.sheetImageOffsetX = -offX;
    window.sheetImageOffsetY = -offY;
    window.sheetImageRotation = -angle;
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    if (typeof calibratePoint1 !== 'undefined' && calibratePoint1) calibratePoint1 = _rotatePoint(calibratePoint1.x - offX, calibratePoint1.y - offY, cos, sin);
    if (typeof calibratePoint2 !== 'undefined' && calibratePoint2) calibratePoint2 = _rotatePoint(calibratePoint2.x - offX, calibratePoint2.y - offY, cos, sin);
    alignPoint1 = null; alignPoint2 = null; alignPoint3 = null; isAlignMode = false; _syncAlignState();
    const btn = document.getElementById('alignEnableBtn');
    if (btn) { btn.textContent = 'Поставить точки'; btn.style.background = '#5a4a7a'; }
    updateAlignDialog();
    // v4.47: Сбрасываем pan чтобы (0,0) мировых координат оказалась в центре canvas
    if (typeof panX !== 'undefined') { panX = 0; window.panX = 0; }
    if (typeof panY !== 'undefined') { panY = 0; window.panY = 0; }
    console.log('Align: angle=' + (angle * 180 / Math.PI).toFixed(1) + ', offset=(' + (-offX).toFixed(0) + ',' + (-offY).toFixed(0) + '), pan reset');
    if (typeof render === 'function') render();
}


function updateCalibrationDialog() {
    const p1 = document.getElementById('calibratePoint1Info');
    const p2 = document.getElementById('calibratePoint2Info');
    const distSection = document.getElementById('calibrateDistanceSection');
    const pixelDiv = document.getElementById('calibratePixelDist');
    const scaleInfo = document.getElementById('calibrateScaleInfo');
    const applyBtn = document.getElementById('calibrateApply');
    const err = document.getElementById('calibrateError');
    const input = document.getElementById('calibrateRealDist');

    if (calibratePoint1) { p1.textContent = `✅ (${Math.round(calibratePoint1.x)}, ${Math.round(calibratePoint1.y)})`; p1.style.color = '#2d7d2d'; }
    else { p1.textContent = 'Не выбрана — кликните на фото'; p1.style.color = '#888'; }

    if (calibratePoint2) { p2.textContent = `✅ (${Math.round(calibratePoint2.x)}, ${Math.round(calibratePoint2.y)})`; p2.style.color = '#2d7d2d'; }
    else { p2.textContent = calibratePoint1 ? 'Кликните вторую точку' : 'Не выбрана'; p2.style.color = '#888'; }

    if (calibratePoint1 && calibratePoint2) {
        const pixelDist = _dist(calibratePoint1, calibratePoint2);
        const wasHidden = distSection.style.display === 'none' || distSection.style.display === '';
        distSection.style.display = 'block';
        pixelDiv.textContent = `${Math.round(pixelDist)} px`;
        const realDist = parseFloat(input?.value) || 0;

        if (pixelDist < REMNANT_CONFIG.MIN_CALIBRATION_DISTANCE_PX) {
            err.style.display = 'block'; err.textContent = `⚠️ Расстояние слишком мало (${Math.round(pixelDist)} px)`;
            applyBtn.disabled = true; scaleInfo.textContent = '-'; return;
        } else { err.style.display = 'none'; }

        if (realDist > 0) {
            const scale = pixelDist / realDist;
            scaleInfo.textContent = `${scale.toFixed(4)} px/мм`;
            applyBtn.disabled = false;
        } else { scaleInfo.textContent = '-'; applyBtn.disabled = true; }

        if (wasHidden && input) { setTimeout(() => { input.focus(); input.select(); }, 50); }
    } else {
        distSection.style.display = 'none'; applyBtn.disabled = true; err.style.display = 'none';
    }
}

function cancelCalibration() {
    const d = document.getElementById('calibrationDialog');
    if (d) d.style.display = 'none';
    isCalibrating = false;
    window.isCalibrating = false;
    calibratePoint1 = null; calibratePoint2 = null;
    alignPoint1 = null; alignPoint2 = null; alignPoint3 = null; isAlignMode = false; _syncAlignState();

    // Удаляем фото с холста
    _revokeImageURL();
    sheetBackgroundImage = null;
    window.sheetBackgroundImage = null;
    sheetImageScale = 1;
    window.sheetImageScale = 1;
    sheetImageSize = null;
    window.sheetBackgroundImageVisible = false;

    // Восстанавливаем прежний размер и режим просмотра
    if (_prevSheetSize !== null) { sheetSize = _prevSheetSize; _prevSheetSize = null; }
    if (_prevShowSheetView !== null) { showSheetView = _prevShowSheetView; _prevShowSheetView = null; }

    render();
}

function applyCalibration() {
    if (!calibratePoint1 || !calibratePoint2) { alert('⚠️ Выберите 2 точки на фото'); return; }
    const pixelDist = _dist(calibratePoint1, calibratePoint2);
    if (pixelDist < REMNANT_CONFIG.MIN_CALIBRATION_DISTANCE_PX) { alert('⚠️ Точки слишком близко'); return; }
    const realDist = parseFloat(document.getElementById('calibrateRealDist').value);
    if (!realDist || realDist <= 0) { alert('⚠️ Введите корректный реальный размер'); return; }

    const oldScale = sheetImageScale || 1;
    sheetImageScale = pixelDist / realDist;
    window.sheetImageScale = sheetImageScale;
    sheetImageSize = {
        width: sheetBackgroundImage.width / sheetImageScale,
        height: sheetBackgroundImage.height / sheetImageScale
    };
    sheetSize = { width: sheetImageSize.width, height: sheetImageSize.height };

    // v4.47: Если было выравнивание — перерасчитываем offset с новым масштабом.
    // Offset был в pixel-координатах, нужно перевести в world-координаты нового масштаба.
    if (window.sheetImageOffsetX || window.sheetImageOffsetY) {
        const scaleRatio = oldScale / sheetImageScale;
        window.sheetImageOffsetX *= scaleRatio;
        window.sheetImageOffsetY *= scaleRatio;
        console.log('Align rescaled: ratio=' + scaleRatio.toFixed(3) + ', new offset=(' + window.sheetImageOffsetX.toFixed(0) + ',' + window.sheetImageOffsetY.toFixed(0) + ')');
    }

    const d = document.getElementById('calibrationDialog');
    if (d) d.remove();
    isCalibrating = false; window.isCalibrating = false;
    window.sheetBackgroundImageVisible = true;
    calibratePoint1 = null; calibratePoint2 = null;
    syncSheetRemnantVars(); render();

    // ─── АВТОРАСКЛАДКА — после калибровки остатка ───────────────
    const autoNestingCheckbox = document.getElementById('autoNestingCheckbox');
    if (autoNestingCheckbox && autoNestingCheckbox.checked && parts.length > 0) {
        console.log('🚀 Авторасскладка (фото остатка): запуск раскладки...');
        setTimeout(async () => {
            try {
                const nestBtn = document.getElementById('nestMultiParts');
                if (nestBtn && typeof nestBtn.onclick === 'function') {
                    nestBtn.onclick();
                } else if (nestBtn) {
                    nestBtn.dispatchEvent(new MouseEvent('click'));
                }
            } catch (err) {
                console.error('❌ Ошибка авторасскладки:', err);
            }
        }, 500);
    }
}

function handleCalibrationClick(x, y) {
    if (!isCalibrating) return false;
    if (isAlignMode && handleAlignClick(x, y)) return true;
    if (!calibratePoint1) { calibratePoint1 = { x, y }; updateCalibrationDialog(); render(); return true; }
    if (!calibratePoint2) {
        if (_dist({ x, y }, calibratePoint1) < REMNANT_CONFIG.MIN_CALIBRATION_DISTANCE_PX) return false;
        calibratePoint2 = { x, y }; updateCalibrationDialog(); render(); return true;
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════
// СОЗДАНИЕ ОСТАТКА (С НОРМАЛИЗАЦИЕЙ КООРДИНАТ)
// ═══════════════════════════════════════════════════════════════

function createSheetRemnantFromSelection() {
    if (!selectedObjects || selectedObjects.length === 0) {
        alert('⚠️ Выделите контур остатка и/или отверстия'); return;
    }

    const contourObjects = [...selectedObjects];
    const bounds = _calculateBounds(contourObjects);
    if (!bounds) { alert('❌ Не удалось вычислить границы'); return; }

    // ─── ГРУППИРОВКА ПО СВЯЗНОСТИ ─────────────────────────────
    const groups = findConnectedContourGroups(contourObjects);
    if (groups.length === 0) { alert('⚠️ Не удалось распознать контуры'); return; }

    // Определяем внешний контур (наибольшая площадь bbox)
    let maxArea = -1, outerGroupIndex = 0;
    groups.forEach((group, idx) => {
        const b = _calculateBounds(group);
        const area = b ? b.width * b.height : 0;
        if (area > maxArea) { maxArea = area; outerGroupIndex = idx; }
    });

    const outerObjects = groups[outerGroupIndex];
    const innerObjects = groups.filter((_, idx) => idx !== outerGroupIndex);

    // Нормализация: смещаем все координаты к (0,0)
    const offX = bounds.minX;
    const offY = bounds.minY;
    const normOuter = outerObjects.map(obj => _shiftObject(obj, offX, offY));
    const normInner = innerObjects.map(group => group.map(obj => _shiftObject(obj, offX, offY)));

    // Сохраняем остаток
    sheetRemnant = {
        outerContour: normOuter,
        innerContours: normInner,
        contourObjects: [...normOuter, ...normInner.flat()],
        image: sheetBackgroundImage,
        scale: sheetImageScale,
        size: { width: bounds.width, height: bounds.height },
        bounds: { minX: 0, minY: 0, maxX: bounds.width, maxY: bounds.height, width: bounds.width, height: bounds.height }
    };
    window.sheetRemnant = sheetRemnant;
    syncSheetRemnantVars();

    objects = []; selectedObjects.length = 0;
    sheetBackgroundImage = null; window.sheetBackgroundImage = null;

    showRemnantSheetItem();
    switchToRemnantSheet();

    const deleteBtn = document.getElementById('deleteRemnant');
    if (deleteBtn) deleteBtn.style.display = 'block';
    
    useRemnant = true;
    window.useRemnant = true;
    syncSheetRemnantVars();
    render();

    saveRemnantMetadata();
}

/** Группировка объектов по связности (BFS с допуском) */
function findConnectedContourGroups(objects) {
    const groups = [];
    const visited = new Set();
    const tol = REMNANT_CONFIG.CONNECTIVITY_TOLERANCE_MM;

    for (let i = 0; i < objects.length; i++) {
        if (visited.has(i)) continue;
        const group = [objects[i]];
        const queue = [i];
        visited.add(i);

        while (queue.length > 0) {
            const curObj = objects[queue.shift()];
            for (let j = 0; j < objects.length; j++) {
                if (visited.has(j)) continue;
                if (_objectsTouch(curObj, objects[j], tol)) {
                    group.push(objects[j]);
                    visited.add(j);
                    queue.push(j);
                }
            }
        }
        if (group.length > 0) groups.push(group);
    }
    return groups;
}

/** Проверка: два объекта касаются друг друга в пределах допуска */
function _objectsTouch(obj1, obj2, tolerance) {
    if (obj1 === obj2) return false;
    const pts1 = _getPointsFromObject(obj1);
    const pts2 = _getPointsFromObject(obj2);
    for (const p1 of pts1) {
        for (const p2 of pts2) {
            if (_dist(p1, p2) <= tolerance) return true;
        }
    }
    // Дополнительная проверка для пар кругов
    if (_resolveObjType(obj1) === 'circle' && _resolveObjType(obj2) === 'circle') {
        const d = _dist({ x: obj1.cx, y: obj1.cy }, { x: obj2.cx, y: obj2.cy });
        return d <= (obj1.radius + obj2.radius + tolerance);
    }
    return false;
}

function showRemnantSheetItem() {
    const item = document.getElementById('remnantSheetItem');
    const name = document.getElementById('remnantSheetName');
    if (item && sheetRemnant) {
        name.textContent = `📸 Остаток листа (${parseFloat(sheetRemnant.size.width.toFixed(2))} × ${parseFloat(sheetRemnant.size.height.toFixed(2))} мм)`;
        item.style.display = 'block';
    }
}

function hideRemnantSheetItem() {
    const item = document.getElementById('remnantSheetItem');
    if (item) item.style.display = 'none';
}

function switchToRemnantSheet() {
    if (!sheetRemnant) return;
    showSheetView = true;
    sheetSize = { ...sheetRemnant.size };
    useRemnant = true;
    window.useRemnant = true;
    // v4.56: Показываем панели инструментов листа
    ['markupRectTools', 'cutRemnantTools', 'rulerTools', 'overlapTools'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'block';
    });
    syncSheetRemnantVars();
    render();

    // ─── АВТОРАСКЛАДКА — при выборе сохранённого остатка ───────────────
    const autoNestingCheckbox = document.getElementById('autoNestingCheckbox');
    if (autoNestingCheckbox && autoNestingCheckbox.checked && parts.length > 0) {
        console.log('🚀 Авторасскладка (сохранённый остаток): запуск раскладки...');
        setTimeout(async () => {
            try {
                const nestBtn = document.getElementById('nestMultiParts');
                if (nestBtn && typeof nestBtn.onclick === 'function') {
                    nestBtn.onclick();
                } else if (nestBtn) {
                    nestBtn.dispatchEvent(new MouseEvent('click'));
                }
            } catch (err) {
                console.error('❌ Ошибка авторасскладки:', err);
            }
        }, 500);
    }
}

// ═══════════════════════════════════════════════════════════════
// RAY CASTING — ПРОВЕРКА ТОЧКИ ВНУТРИ КОНТУРА
// ═══════════════════════════════════════════════════════════════

// Кеш рёбер контура (WeakMap: массив объектов → массив рёбер).
const _contourEdgesCache = new WeakMap();
let _ipcDebugCount = 0;

/**
 * Конвертация геометрического объекта в массив отрезков (рёбер).
 * @param {Object} obj
 * @returns {Edge[]}
 */
function _objectToEdges(obj) {
    const edges = [];
    const type = _resolveObjType(obj);

    switch (type) {
        case 'line':
            edges.push({ x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 });
            break;

        case 'rect': {
            // v4.46 H1: учитываем rotation (obj.angle) для повёрнутых прямоугольников.
            const { x, y, width: w, height: h, angle: ang } = obj;
            const corners = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
            let pts = corners;
            if (ang && Math.abs(ang) > 0.001) {
                const cx = x + w / 2, cy = y + h / 2;
                const cos = Math.cos(ang), sin = Math.sin(ang);
                pts = corners.map(p => ({
                    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
                    y: cy + (p.x - cx) * sin + (p.y - cy) * cos
                }));
            }
            for (let i = 0; i < 4; i++) {
                const j = (i + 1) % 4;
                edges.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[j].x, y2: pts[j].y });
            }
            break;
        }

        case 'polygon': {
            const v = (typeof obj.getVertices === 'function') ? obj.getVertices() : (obj.vertices || []);
            for (let i = 0; i < v.length; i++) {
                const j = (i + 1) % v.length;
                edges.push({ x1: v[i].x, y1: v[i].y, x2: v[j].x, y2: v[j].y });
            }
            break;
        }

        case 'arc': {
            const acx = obj.cx || 0, acy = obj.cy || 0, r = Math.abs(obj.radius || 0);
            if (r <= 0) break;
            const sa = obj.startAngle ?? 0, ea = obj.endAngle ?? (2 * Math.PI);
            const { sweep, dir } = _computeArcSweep(sa, ea, obj.direction);
            const { ARC_SEGMENTS_MIN, ARC_SEGMENTS_MAX, ARC_CHORD_DIVISOR } = REMNANT_CONFIG;
            const arcSegs = Math.max(ARC_SEGMENTS_MIN, Math.min(ARC_SEGMENTS_MAX, Math.ceil(sweep * r / ARC_CHORD_DIVISOR)));
            const step = sweep / arcSegs;
            let prevX = acx + Math.cos(sa) * r, prevY = acy + Math.sin(sa) * r;
            for (let k = 1; k <= arcSegs; k++) {
                const a = sa + dir * step * k;
                const curX = acx + Math.cos(a) * r, curY = acy + Math.sin(a) * r;
                edges.push({ x1: prevX, y1: prevY, x2: curX, y2: curY });
                prevX = curX; prevY = curY;
            }
            break;
        }

        case 'circle': {
            const ccx = obj.cx || 0, ccy = obj.cy || 0, r = Math.abs(obj.radius || 0);
            if (r <= 0) break;
            const { CIRCLE_SEGMENTS_MIN, CIRCLE_SEGMENTS_MAX, CIRCLE_SEGMENTS_FACTOR } = REMNANT_CONFIG;
            const segs = Math.max(CIRCLE_SEGMENTS_MIN, Math.min(CIRCLE_SEGMENTS_MAX, Math.ceil(r * CIRCLE_SEGMENTS_FACTOR)));
            for (let i = 0; i < segs; i++) {
                const a1 = (2 * Math.PI * i) / segs;
                const a2 = (2 * Math.PI * (i + 1)) / segs;
                edges.push({
                    x1: ccx + Math.cos(a1) * r, y1: ccy + Math.sin(a1) * r,
                    x2: ccx + Math.cos(a2) * r, y2: ccy + Math.sin(a2) * r
                });
            }
            break;
        }

        case 'polyline':
        case 'lwpolyline': {
            const pts = obj.points || obj.vertices || [];
            for (let i = 0; i < pts.length - 1; i++) {
                edges.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y });
            }
            if (pts.length >= 3) {
                const isClosed = obj.closed === true || obj.isClosed === true;
                const gap = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
                if (isClosed || gap < REMNANT_CONFIG.POLYLINE_CLOSE_TOLERANCE_MM) {
                    edges.push({ x1: pts[pts.length - 1].x, y1: pts[pts.length - 1].y, x2: pts[0].x, y2: pts[0].y });
                }
            }
            break;
        }

        default:
            if (REMNANT_CONFIG.DEBUG) console.warn(`[_objectToEdges] Unknown type: ${type}`);
            break;
    }
    return edges;
}

/** Дедупликация рёбер (прямых и обратных) */
function _deduplicateEdges(edges) {
    const seen = new Set();
    const p = REMNANT_CONFIG.EDGE_DEDUP_PRECISION;
    return edges.filter(e => {
        const r = v => (v || 0).toFixed(p);
        const k1 = `${r(e.x1)},${r(e.y1)},${r(e.x2)},${r(e.y2)}`;
        const k2 = `${r(e.x2)},${r(e.y2)},${r(e.x1)},${r(e.y1)}`;
        if (seen.has(k1) || seen.has(k2)) return false;
        seen.add(k1);
        return true;
    });
}

/** Упорядочить рёбра в замкнутую цепочку, добавить недостающие замыкающие сегменты */
function _orderAndCloseEdges(edges) {
    if (edges.length < 3) return edges;

    const TOL = REMNANT_CONFIG.EDGE_CHAIN_TOLERANCE_MM;
    const ordered = [];
    const used = new Set();

    ordered.push(edges[0]);
    used.add(0);
    let currentEnd = { x: edges[0].x2, y: edges[0].y2 };
    const startPt = { x: edges[0].x1, y: edges[0].y1 };

    let maxIter = edges.length * 2;
    while (used.size < edges.length && maxIter-- > 0) {
        let foundIdx = -1, foundReversed = false, bestDist = TOL;

        for (let i = 0; i < edges.length; i++) {
            if (used.has(i)) continue;
            const e = edges[i];
            const dFwd = Math.hypot(e.x1 - currentEnd.x, e.y1 - currentEnd.y);
            const dRev = Math.hypot(e.x2 - currentEnd.x, e.y2 - currentEnd.y);
            if (dFwd < bestDist) { bestDist = dFwd; foundIdx = i; foundReversed = false; }
            if (dRev < bestDist) { bestDist = dRev; foundIdx = i; foundReversed = true; }
        }

        if (foundIdx >= 0) {
            const e = edges[foundIdx];
            if (foundReversed) {
                ordered.push({ x1: e.x2, y1: e.y2, x2: e.x1, y2: e.y1 });
                currentEnd = { x: e.x1, y: e.y1 };
            } else {
                ordered.push(e);
                currentEnd = { x: e.x2, y: e.y2 };
            }
            used.add(foundIdx);
        } else {
            // Цепочка разорвана — ищем ближайшее ребро без ограничения допуска
            let farDist = Infinity, farIdx = -1, farReversed = false;
            for (let i = 0; i < edges.length; i++) {
                if (used.has(i)) continue;
                const e = edges[i];
                const dF = Math.hypot(e.x1 - currentEnd.x, e.y1 - currentEnd.y);
                const dR = Math.hypot(e.x2 - currentEnd.x, e.y2 - currentEnd.y);
                if (dF < farDist) { farDist = dF; farIdx = i; farReversed = false; }
                if (dR < farDist) { farDist = dR; farIdx = i; farReversed = true; }
            }
            if (farIdx < 0) break;

            const e = edges[farIdx];
            const bridgeEnd = farReversed ? { x: e.x2, y: e.y2 } : { x: e.x1, y: e.y1 };
            ordered.push({ x1: currentEnd.x, y1: currentEnd.y, x2: bridgeEnd.x, y2: bridgeEnd.y });
            if (farReversed) {
                ordered.push({ x1: e.x2, y1: e.y2, x2: e.x1, y2: e.y1 });
                currentEnd = { x: e.x1, y: e.y1 };
            } else {
                ordered.push(e);
                currentEnd = { x: e.x2, y: e.y2 };
            }
            used.add(farIdx);
        }
    }

    const closeDist = Math.hypot(currentEnd.x - startPt.x, currentEnd.y - startPt.y);
    if (closeDist > 0.01) {
        ordered.push({ x1: currentEnd.x, y1: currentEnd.y, x2: startPt.x, y2: startPt.y });
    }

    return ordered;
}

/** Построить рёбра контура: конвертация → дедупликация → упорядочивание → замыкание */
function _buildContourEdges(contourObjects) {
    const rawEdges = [];
    for (const obj of contourObjects) {
        rawEdges.push(..._objectToEdges(obj));
    }
    return _orderAndCloseEdges(_deduplicateEdges(rawEdges));
}

/** Получить рёбра контура из кеша или построить */
function _getCachedContourEdges(contourObjects) {
    let cached = _contourEdgesCache.get(contourObjects);
    if (!cached) {
        cached = _buildContourEdges(contourObjects);
        _contourEdgesCache.set(contourObjects, cached);
    }
    return cached;
}

/** Ray casting: точка внутри контура? */
function isPointInsideContour(x, y, contourObjects) {
    if (!contourObjects || contourObjects.length === 0) return false;
    const edges = _getCachedContourEdges(contourObjects);
    let inside = false;
    for (const e of edges) {
        if (((e.y1 > y) !== (e.y2 > y)) &&
            (x < (e.x2 - e.x1) * (y - e.y1) / (e.y2 - e.y1) + e.x1)) {
            inside = !inside;
        }
    }
    if (REMNANT_CONFIG.DEBUG && _ipcDebugCount < REMNANT_CONFIG.DEBUG_LOG_LIMIT) {
        console.log(`[IPC #${_ipcDebugCount}] (${x.toFixed(1)},${y.toFixed(1)}) → ${inside ? 'IN' : 'OUT'} (${edges.length} edges)`);
        _ipcDebugCount++;
    }
    return inside;
}

/** Точка внутри остатка: внутри внешнего контура И вне отверстий */
function isPointInsideRemnant(x, y) {
    if (!useRemnant || !sheetRemnant?.outerContour?.length) return true;
    if (!isPointInsideContour(x, y, sheetRemnant.outerContour)) return false;
    if (sheetRemnant.innerContours) {
        for (const hole of sheetRemnant.innerContours) {
            if (isPointInsideContour(x, y, hole)) return false;
        }
    }
    return true;
}

// ═══════════════════════════════════════════════════════════════
// ПРОВЕРКА РАЗМЕЩЕНИЯ ПРЯМОУГОЛЬНИКА
// ═══════════════════════════════════════════════════════════════

/** Прямоугольник целиком внутри остатка? (углы + центр + точки вдоль рёбер) */
function isRectInsideRemnant(x, y, w, h, angle) {
    // v4.46 H3: добавлен параметр angle для повёрнутых деталей + fail-closed.
    if (typeof useRemnant === 'undefined' || !useRemnant) return true;  // M1: fail-closed
    if (!sheetRemnant?.outerContour?.length) return true;
    const sub = REMNANT_CONFIG.RECT_SUBDIVISIONS;

    // v4.46 H3: если есть angle — вычисляем повёрнутые углы прямоугольника
    const corners = [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h }
    ];
    let checkPts = corners;
    if (angle && Math.abs(angle) > 0.001) {
        const cx = x + w / 2, cy = y + h / 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        checkPts = corners.map(p => ({
            x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
            y: cy + (p.x - cx) * sin + (p.y - cy) * cos
        }));
    }

    // Центр
    if (!isPointInsideRemnant(x + w / 2, y + h / 2)) return false;

    // Углы (повёрнутые если есть angle)
    for (const pt of checkPts) {
        if (!isPointInsideRemnant(pt.x, pt.y)) return false;
    }

    // Подразделение по краям (только для axis-aligned)
    if (!angle || Math.abs(angle) < 0.001) {
        for (let i = 1; i < sub; i++) {
            const t = i / sub;
            if (!isPointInsideRemnant(x + w * t, y)) return false;
            if (!isPointInsideRemnant(x + w * t, y + h)) return false;
            if (!isPointInsideRemnant(x, y + h * t)) return false;
            if (!isPointInsideRemnant(x + w, y + h * t)) return false;
        }
    }
    return true;
}

// ═══════════════════════════════════════════════════════════════
// СЕРИАЛИЗАЦИЯ / ДЕСЕРИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════════

const _SERIALIZE_MAP = {
    line:       obj => ({ x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 }),
    circle:     obj => ({ cx: obj.cx, cy: obj.cy, radius: obj.radius }),
    rect:       obj => ({ x: obj.x, y: obj.y, width: obj.width, height: obj.height }),
    polygon:    obj => ({ vertices: typeof obj.getVertices === 'function' ? obj.getVertices() : (obj.vertices || []) }),
    arc:        obj => ({ cx: obj.cx, cy: obj.cy, radius: obj.radius,
                          startAngle: obj.startAngle, endAngle: obj.endAngle, direction: obj.direction }),
    polyline:   obj => ({ points: obj.points || obj.vertices || [], closed: obj.closed, isClosed: obj.isClosed }),
    lwpolyline: obj => ({ points: obj.points || obj.vertices || [], closed: obj.closed, isClosed: obj.isClosed }),
};

function serializeObject(obj) {
    const type = obj.type || _resolveObjType(obj);
    const fn = _SERIALIZE_MAP[type];
    return fn ? { type, ...fn(obj) } : { type };
}

function deserializeObject(data) {
    if (!data?.type) return null;
    switch (data.type) {
        case 'line':
            return typeof Line !== 'undefined'
                ? new Line(data.x1, data.y1, data.x2, data.y2)
                : { type: 'line', x1: data.x1, y1: data.y1, x2: data.x2, y2: data.y2 };
        case 'circle':
            return { type: 'circle', cx: data.cx, cy: data.cy, radius: data.radius };
        case 'rect':
            return { type: 'rect', x: data.x, y: data.y, width: data.width, height: data.height };
        case 'polygon':
            return { type: 'polygon', getVertices: () => data.vertices || [], vertices: data.vertices || [] };
        case 'arc':
            return { type: 'arc', cx: data.cx, cy: data.cy, radius: data.radius,
                     startAngle: data.startAngle, endAngle: data.endAngle, direction: data.direction };
        case 'polyline':
        case 'lwpolyline':
            return { type: data.type, points: data.points || [], vertices: data.points || [],
                     closed: data.closed, isClosed: data.isClosed };
        default:
            return null;
    }
}

function saveRemnantMetadata() {
    if (!sheetRemnant) return;
    try {
        const metadata = {
            version: 2,
            size: sheetRemnant.size,
            bounds: sheetRemnant.bounds,
            scale: sheetRemnant.scale,
            outerContour: sheetRemnant.outerContour.map(serializeObject),
            innerContours: sheetRemnant.innerContours.map(g => g.map(serializeObject))
        };
        // Сохраняем в новый кэш с LZString сжатием
        var json = JSON.stringify(metadata);
        if (typeof LZString !== 'undefined') {
            localStorage.setItem('nesting_sheet_remnant_cache', LZString.compressToUTF16(json));
        } else {
            localStorage.setItem('nesting_sheet_remnant_cache', json);
        }
        // Также сохраняем в старый кэш для совместимости
        localStorage.setItem('sheetRemnant', json);
    } catch (err) {
        console.error('[saveRemnantMetadata]', err);
    }
}

function loadRemnantMetadata() {
    // Проверяем новый кэш nesting_sheet_remnant_cache
    let saved = localStorage.getItem('nesting_sheet_remnant_cache');
    
    // v4.46 M3: fallback — sheetRemnant (не cadSheetRemnant — тот был dead code)
    if (!saved) {
        saved = localStorage.getItem('sheetRemnant');
    }
    
    if (!saved) return false;
    
    try {
        // Распаковываем если сжато
        let json;
        if (typeof LZString !== 'undefined') {
            try {
                json = LZString.decompressFromUTF16(saved);
            } catch (e) {
                json = saved;
            }
        }
        if (!json) json = saved;

        let m;
        try {
            m = JSON.parse(json);
        } catch (e) {
            console.warn('[loadRemnantMetadata] Данные повреждены:', e);
            return false;
        }

        // v4.46 M4: валидация данных на NaN/null
        if (!m || typeof m !== 'object') return false;
        if (m.size) {
            if (!Number.isFinite(m.size.width) || !Number.isFinite(m.size.height) ||
                m.size.width <= 0 || m.size.height <= 0) {
                console.warn('[loadRemnantMetadata] Невалидный size, пропускаем');
                return false;
            }
        }
        if (m.bounds) {
            if (!Number.isFinite(m.bounds.minX) || !Number.isFinite(m.bounds.maxX)) {
                console.warn('[loadRemnantMetadata] Невалидные bounds, пропускаем bounds');
                m.bounds = null;
            }
        }

        const outer = (m.outerContour || []).map(deserializeObject).filter(Boolean);
        const inner = (m.innerContours || []).map(g =>
            (g || []).map(deserializeObject).filter(Boolean)
        ).filter(g => g.length > 0);
        if (outer.length === 0) return false;

        sheetRemnant = {
            outerContour: outer,
            innerContours: inner,
            contourObjects: [...outer, ...inner.flat()],
            image: null,
            scale: Number.isFinite(m.scale) ? m.scale : 1,
            size: m.size,
            bounds: m.bounds
        };
        window.sheetRemnant = sheetRemnant;
        showRemnantSheetItem();

        useRemnant = true;
        window.useRemnant = true;
        if (m.size) sheetSize = { ...m.size };
        if (typeof syncSheetRemnantVars === 'function') syncSheetRemnantVars();
        console.log('[loadRemnantMetadata] остаток листа восстановлен из кэша');
        return true;
    } catch (err) {
        console.error('[loadRemnantMetadata]', err);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
// ОБРАБОТКА КРЕСТИКА ЗАКРЫТИЯ ФОТО
// ═══════════════════════════════════════════════════════════════

(function initBackgroundImageCloseHandler() {
    function handleCloseClick(e) {
        if (!window.sheetBgCloseBtn || !sheetBackgroundImage || !window.sheetBackgroundImageVisible) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = (e.clientX - rect.left - canvas.width / 2 - panX) / zoom;
        const clickY = (e.clientY - rect.top - canvas.height / 2 - panY) / zoom;

        const btn = window.sheetBgCloseBtn;
        // v4.79: Защита от NaN — если координаты кнопки некорректны,
        // не блокируем клик (иначе stopPropagation глушит ВСЕ mousedown)
        if (!isFinite(btn.x) || !isFinite(btn.y) || !isFinite(btn.radius) ||
            !isFinite(clickX) || !isFinite(clickY) ||
            Math.hypot(clickX - btn.x, clickY - btn.y) > btn.radius) return;

        e.stopPropagation();
        e.preventDefault();

        _revokeImageURL();
        sheetBackgroundImage = null;
        window.sheetBackgroundImage = null;
        window.sheetBackgroundImageVisible = false;
        window.sheetBgCloseBtn = null;
        render();
    }

    function attachHandlers() {
        if (typeof canvas !== 'undefined' && canvas) {
            canvas.addEventListener('mousedown', handleCloseClick, true);
            canvas.addEventListener('touchstart', handleCloseClick, true);
        }
    }

    if (typeof canvas !== 'undefined' && canvas) attachHandlers();
    else document.addEventListener('DOMContentLoaded', attachHandlers);
})();

// ═══════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ И ЭКСПОРТЫ
// ═══════════════════════════════════════════════════════════════

function initSheetRemnant() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadRemnantMetadata);
    } else {
        loadRemnantMetadata();
    }
}

window.createSheetRemnantFromSelection = createSheetRemnantFromSelection;
window.showRemnantSheetItem = showRemnantSheetItem;
window.hideRemnantSheetItem = hideRemnantSheetItem;
window.switchToRemnantSheet = switchToRemnantSheet;
window.isPointInsideRemnant = isPointInsideRemnant;
window.isRectInsideRemnant = isRectInsideRemnant;
window.isPointInsideContour = isPointInsideContour;
window.serializeObject = serializeObject;
window.deserializeObject = deserializeObject;
window._buildContourEdges = _buildContourEdges;

initSheetRemnant();
