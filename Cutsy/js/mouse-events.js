// ═══════════════════════════════════════════════════════════════
// ОБРАБОТЧИК МЫШИ (КОНСОЛИДИРОВАННЫЙ + ИСПРАВЛЕННЫЙ КУРСОР)
// Объединяет: mouse-events.js + index.html
// Исправление: Курсор теперь корректно переключается между инструментами
// ═══════════════════════════════════════════════════════════════

// v4.73: Point-in-polygon для проверки попадания клика в материал детали
// (а не в отверстие). Используется для деталей с пустотами (фланцы, кольца).
function pointInPolygonNested(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        if (((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

// ═══════════════════════════════════════════════════════════════
// УНИФИЦИРОВАННОЕ СРАВНЕНИЕ ID ДЕТАЛЕЙ
// Должно быть определено в первом загружаемом модуле
// ═══════════════════════════════════════════════════════════════
// Явно определяем samePartId на window для глобальной доступности
// (function-декларация внутри if-блока может не попасть в window в некоторых браузерах)
if (typeof window.samePartId !== 'function') {
    window.samePartId = function samePartId(a, b) {
        return Number(a) === Number(b);
    };
}

// ═══════════════════════════════════════════════════════════════
// ИМЕНОВАННЫЕ КОНСТАНТЫ
// ═══════════════════════════════════════════════════════════════
const SHEET_MARGIN = 50;
const SHEET_MAX_BASE_WIDTH = 400;
const SHEET_WIDTH_DIVISOR = 3;
const ZOOM_STEP = 0.1;
const MIN_MAIN_ZOOM = 0.1;
const MAX_MAIN_ZOOM = 40;
const MIN_SHEET_ZOOM = 0.5;
const MAX_SHEET_ZOOM = 15;
const MAX_REMNANT_SHEET_ZOOM = 5;
const CUT_LINE_TOLERANCE = 10;
const MIN_MARKUP_SIZE = 50;
const MIN_MARKUP_CIRCLE_RADIUS = 25;
const MIN_MICROJOINT_LENGTH = 5;
const DRAG_THRESHOLD = 3;
const POINT_SNAP_TOLERANCE = 0.5;
const ERASER_TOLERANCE_DEFAULT = undefined; // keep existing variable

// ═══════════════════════════════════════════════════════════════
// ЦЕНТРАЛИЗОВАННОЕ СОСТОЯНИЕ МОДУЛЯ (appState)
// ═══════════════════════════════════════════════════════════════
const _appStateInternal = {
    // Module-internal state (owned by this module)
    mouseX: undefined,
    mouseY: undefined,
    isDraggingCutLine: false,
    justFinishedCutLineDrag: false,
    selectedNestedParts: [],
    markupRects: [],
    currentRect: null,
    currentCircle: null,
    diagonalPatternSource: null,           // ОДНА деталь (backward compat) ИЛИ null если группа
    diagonalPatternSources: null,          // v4.42: МАССИВ деталей для групповой диагональной раскладки
    diagonalPatternDragging: false,
    diagonalPatternStartPoint: null,
    diagonalPatternEndPoint: null,
    diagonalPatternCount: 2,
    diagonalPatternCountManuallySet: false,
    diagonalPatternMouseLastX: null,
    diagonalPatternMouseLastY: null,
    lastMarkupMouseX: null,
    lastMarkupMouseY: null,
    frozenLineEnd: null,
    microjointIsDrawing: false,
    microjointLineStart: null,
    microjointLineEnd: null,
    _hoverRafPending: false,
    lastMouseX: null,
    lastMouseY: null,
    // v4.80: Pattern drag-режим (как diagonalPattern)
    rectPatternDragging: false,
    rectPatternWaitCenter: false,
    rectPatternSources: null,
    rectPatternIsSheetMode: false,
    rectPatternStartPoint: null,
    rectPatternGroupCenter: null,
    rectPatternEndPoint: null,
    rectPatternStepX: 50,
    rectPatternStepY: 50,
    rectPatternCount: 4,
    rectPatternCountManuallySet: false,
    circPatternDragging: false,
    circPatternWaitCenter: false,
    circPatternSources: null,
    circPatternIsSheetMode: false,
    circPatternCenter: null,
    circPatternGroupCenter: null,
    circPatternEndPoint: null,
    circPatternRadius: 50,
    circPatternCount: 6,
    circPatternArcAngle: 360,
    circPatternStartAngle: 0,
    circPatternCountManuallySet: false,
};

// External state: properties set by other modules — proxy reads/writes go to window
const _externalStateKeys = [
    'allSheets', 'currentSheetIndex', 'cutRemnantLine', 'showCutRemnantLine',
    'microjointEnabled', 'diagonalLayoutEnabled', 'allowOverlap', 'completeMicrojointLine',
    // v4.38 FIX M3: microjoint drawing-state должен синхронизироваться через Proxy.
    // Раньше microjoint-tool.js писал напрямую в window.* (строки 1040-1042),
    // но эти ключи НЕ были в _externalStateKeys → локальный Proxy-state оставался
    // stale → следующий клик вызывал фантомный completeMicrojointLine со старым start.
    'microjointIsDrawing', 'microjointLineStart', 'microjointLineEnd',
    // Диагональная раскладка — внешний код (HTML-обработчики, render.js)
    // работает через window.*, поэтому Proxy тоже должен читать из window
    'diagonalPatternSource', 'diagonalPatternDragging',
    'diagonalPatternSources',  // v4.42: массив для групповой диагональной раскладки
    'diagonalPatternStartPoint', 'diagonalPatternEndPoint',
    'diagonalPatternCount', 'diagonalPatternCountManuallySet',
    'diagonalPatternMouseLastX', 'diagonalPatternMouseLastY',
    // v4.80: Pattern drag-режим
    'rectPatternDragging', 'rectPatternWaitCenter', 'rectPatternSources', 'rectPatternIsSheetMode', 'rectPatternStartPoint', 'rectPatternGroupCenter', 'rectPatternEndPoint',
    'rectPatternStepX', 'rectPatternStepY', 'rectPatternCount', 'rectPatternCountManuallySet',
    'circPatternDragging', 'circPatternWaitCenter', 'circPatternSources', 'circPatternIsSheetMode', 'circPatternCenter', 'circPatternGroupCenter', 'circPatternEndPoint',
    'circPatternRadius', 'circPatternCount', 'circPatternArcAngle', 'circPatternStartAngle', 'circPatternCountManuallySet'
];

const appState = new Proxy(_appStateInternal, {
    get(target, prop) {
        if (_externalStateKeys.includes(prop)) return window[prop];
        return target[prop];
    },
    set(target, prop, value) {
        target[prop] = value;
        window[prop] = value; // backward-compatible sync
        return true;
    }
});

// ═══════════════════════════════════════════════════════════════
// ГЕОМЕТРИЯ ЛИСТА — ЕДИНАЯ ФУНКЦИЯ-РАСЧЁТ
// ═══════════════════════════════════════════════════════════════
function getSheetGeometry() {
    const margin = SHEET_MARGIN;
    const baseW = Math.min(sheetSize.width / SHEET_WIDTH_DIVISOR, SHEET_MAX_BASE_WIDTH);
    const baseH = baseW * sheetSize.height / sheetSize.width;
    const w = baseW * sheetZoom;
    const h = baseH * sheetZoom;
    const x = canvas.width - w - margin + sheetPanX;
    const y = margin + sheetPanY;
    return {
        x, y, w, h,
        scaleX: w / sheetSize.width,
        scaleY: h / sheetSize.height,
        margin,
        baseW, baseH
    };
}


// ═══════════════════════════════════════════════════════════════
// 1. Зум колесиком мыши
// ═══════════════════════════════════════════════════════════════
canvas.addEventListener('wheel', (e) => {
    if (isDraggingNested) {
        e.preventDefault();
        return;
    }

    e.preventDefault();
    // v4.97: Очищаем линии выравнивания при зуме
    if (window._alignmentGuides && window._alignmentGuides.length > 0) {
        window._alignmentGuides = [];
    }
    const rect = canvas.getBoundingClientRect();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;

    if (showSheetView) {
        const { x: sheetX, y: sheetY, w: sheetW, h: sheetH, margin: sheetMargin, baseW: baseSheetW, baseH: baseSheetH } = getSheetGeometry();

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        appState.mouseX = mouseX;
        appState.mouseY = mouseY;

        if (mouseX >= sheetX && mouseX <= sheetX + sheetW &&
            mouseY >= sheetY && mouseY <= sheetY + sheetH) {
            
            const oldZoom = sheetZoom;
            const newZoom = Math.max(MIN_SHEET_ZOOM, Math.min(MAX_SHEET_ZOOM, oldZoom + delta));

            const offsetX = mouseX - sheetX;
            const offsetY = mouseY - sheetY;
            const ratioX = offsetX / sheetW;
            const ratioY = offsetY / sheetH;

            const newSheetW = baseSheetW * newZoom;
            const newSheetH = baseSheetH * newZoom;

            const newSheetX = mouseX - ratioX * newSheetW;
            const newSheetY = mouseY - ratioY * newSheetH;

            sheetPanX = newSheetX - (canvas.width - newSheetW - sheetMargin);
            sheetPanY = newSheetY - sheetMargin;

            sheetZoom = newZoom;
            render();
            return;
        }
    }

    if (showSheetView && typeof sheetRemnant !== 'undefined' && sheetRemnant) {
        const { x: sheetX, y: sheetY, w: sheetW, h: sheetH, margin: sheetMargin, baseW: baseSheetW, baseH: baseSheetH } = getSheetGeometry();

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        appState.mouseX = mouseX;
        appState.mouseY = mouseY;

        if (mouseX >= sheetX && mouseX <= sheetX + sheetW &&
            mouseY >= sheetY && mouseY <= sheetY + sheetH) {
            
            const oldZoom = sheetZoom;
            const newZoom = Math.max(MIN_SHEET_ZOOM, Math.min(MAX_REMNANT_SHEET_ZOOM, oldZoom + delta));

            const offsetX = mouseX - sheetX;
            const offsetY = mouseY - sheetY;
            const ratioX = offsetX / sheetW;
            const ratioY = offsetY / sheetH;

            const newSheetW = baseSheetW * newZoom;
            const newSheetH = baseSheetH * newZoom;

            const newSheetX = mouseX - ratioX * newSheetW;
            const newSheetY = mouseY - ratioY * newSheetH;

            sheetPanX = newSheetX - (canvas.width - newSheetW - sheetMargin);
            sheetPanY = newSheetY - sheetMargin;

            sheetZoom = newZoom;
            render();
            return;
        }
    }

    const oldZoom = zoom;
    const newZoom = Math.max(MIN_MAIN_ZOOM, Math.min(MAX_MAIN_ZOOM, zoom + delta));
    
    const mouseX = e.clientX - rect.left - canvas.width / 2;
    const mouseY = e.clientY - rect.top - canvas.height / 2;

    const worldX = mouseX / oldZoom - panX / oldZoom;
    const worldY = mouseY / oldZoom - panY / oldZoom;

    panX = mouseX - worldX * newZoom;
    panY = mouseY - worldY * newZoom;

    zoom = newZoom;
    render();
});

// ═══════════════════════════════════════════════════════════════
<<<<<<< HEAD
=======
// v5.03: МАСШТАБИРОВАНИЕ КОНТУРА — вспомогательные функции
// ═══════════════════════════════════════════════════════════════

function _snapshotObject(obj) {
    if (obj.type === 'line') return { obj, type: 'line', x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
    if (obj.type === 'circle') return { obj, type: 'circle', cx: obj.cx, cy: obj.cy, radius: obj.radius };
    if (obj.type === 'arc') return { obj, type: 'arc', cx: obj.cx, cy: obj.cy, radius: obj.radius, startAngle: obj.startAngle, endAngle: obj.endAngle, direction: obj.direction };
    if (obj.type === 'rect') return { obj, type: 'rect', x: obj.x, y: obj.y, width: obj.width, height: obj.height };
    if (obj.type === 'polygon') return { obj, type: 'polygon', cx: obj.cx, cy: obj.cy, radius: obj.radius, vertices: obj.vertices ? obj.vertices.map(v => ({x:v.x, y:v.y})) : null };
    if (obj.type === 'text') return { obj, type: 'text', x: obj.x, y: obj.y };
    if (obj.type === 'polyline' || obj.type === 'lwpolyline') return { obj, type: obj.type, points: obj.points ? obj.points.map(p => ({x:p.x, y:p.y})) : null };
    return { obj, type: obj.type || 'unknown' };
}

function _scaleObjectFromSnapshot(snap, cx, cy, scale) {
    const obj = snap.obj;
    const sx = (p) => cx + (p - cx) * scale;
    const sy = (p) => cy + (p - cy) * scale;

    if (snap.type === 'line') {
        obj.x1 = sx(snap.x1); obj.y1 = sy(snap.y1);
        obj.x2 = sx(snap.x2); obj.y2 = sy(snap.y2);
    } else if (snap.type === 'circle') {
        obj.cx = sx(snap.cx); obj.cy = sy(snap.cy);
        obj.radius = Math.max(0.01, snap.radius * scale);
    } else if (snap.type === 'arc') {
        obj.cx = sx(snap.cx); obj.cy = sy(snap.cy);
        obj.radius = Math.max(0.01, snap.radius * scale);
        // Углы не меняются при масштабировании
    } else if (snap.type === 'rect') {
        const x2 = snap.x + snap.width, y2 = snap.y + snap.height;
        const nx1 = sx(snap.x), ny1 = sy(snap.y);
        const nx2 = sx(x2), ny2 = sy(y2);
        obj.x = Math.min(nx1, nx2); obj.y = Math.min(ny1, ny2);
        obj.width = Math.abs(nx2 - nx1); obj.height = Math.abs(ny2 - ny1);
    } else if (snap.type === 'polygon') {
        obj.cx = sx(snap.cx); obj.cy = sy(snap.cy);
        obj.radius = Math.max(0.01, snap.radius * scale);
        if (snap.vertices && obj.vertices) {
            for (let i = 0; i < snap.vertices.length && i < obj.vertices.length; i++) {
                obj.vertices[i].x = sx(snap.vertices[i].x);
                obj.vertices[i].y = sy(snap.vertices[i].y);
            }
        }
    } else if (snap.type === 'text') {
        obj.x = sx(snap.x); obj.y = sy(snap.y);
    } else if (snap.type === 'polyline' || snap.type === 'lwpolyline') {
        if (snap.points && obj.points) {
            for (let i = 0; i < snap.points.length && i < obj.points.length; i++) {
                obj.points[i].x = sx(snap.points[i].x);
                obj.points[i].y = sy(snap.points[i].y);
            }
        }
    }
}

function _getSelectionCentroid(objs) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const obj of objs) {
        if (!obj || typeof obj.getPoints !== 'function') continue;
        for (const pt of obj.getPoints()) {
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y > maxY) maxY = pt.y;
        }
    }
    if (minX === Infinity) return { x: 0, y: 0 };
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

// ═══════════════════════════════════════════════════════════════
>>>>>>> master
// v5.02: CROSSING SELECTION — пересечение объекта с прямоугольником
// ═══════════════════════════════════════════════════════════════
// Возвращает true, если объект пересекается с прямоугольником или
// хотя бы одна его точка внутри прямоугольника.
// Работает с классами (Line, Circle, Polygon, Arc) и plain objects.

function _segIntersectsRect(x1, y1, x2, y2, minX, minY, maxX, maxY) {
    const p1Inside = x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY;
    const p2Inside = x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY;
    if (p1Inside || p2Inside) return true;
    if (_segSegIntersect(x1, y1, x2, y2, minX, minY, minX, maxY)) return true;
    if (_segSegIntersect(x1, y1, x2, y2, maxX, minY, maxX, maxY)) return true;
    if (_segSegIntersect(x1, y1, x2, y2, minX, minY, maxX, minY)) return true;
    if (_segSegIntersect(x1, y1, x2, y2, minX, maxY, maxX, maxY)) return true;
    return false;
}

function _segSegIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
    if (Math.abs(d) < 1e-10) return false;
    const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
    const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function _circleIntersectsRect(cx, cy, r, minX, minY, maxX, maxY) {
    const nx = Math.max(minX, Math.min(cx, maxX));
    const ny = Math.max(minY, Math.min(cy, maxY));
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy <= r * r;
}

function _arcIntersectsRect(cx, cy, r, startAngle, endAngle, direction, minX, minY, maxX, maxY) {
    let sweep;
    if (direction === 'CW') {
        sweep = startAngle - endAngle;
        if (sweep < 0) sweep += Math.PI * 2;
    } else {
        sweep = endAngle - startAngle;
        if (sweep < 0) sweep += Math.PI * 2;
    }
    const seg = Math.max(8, Math.ceil(sweep / (Math.PI / 12)));
    const step = sweep / seg;
    const dir = direction === 'CW' ? -1 : 1;
    let prevX = cx + Math.cos(startAngle) * r;
    let prevY = cy + Math.sin(startAngle) * r;
    for (let i = 1; i <= seg; i++) {
        const a = startAngle + dir * step * i;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (_segIntersectsRect(prevX, prevY, px, py, minX, minY, maxX, maxY)) return true;
        prevX = px; prevY = py;
    }
    return false;
}

function objectIntersectsRect(obj, minX, minY, maxX, maxY) {
    if (!obj) return false;
    const type = obj.type;
    
    if (type === 'line') {
        return _segIntersectsRect(obj.x1, obj.y1, obj.x2, obj.y2, minX, minY, maxX, maxY);
    }
    if (type === 'circle') {
        return _circleIntersectsRect(obj.cx, obj.cy, obj.radius, minX, minY, maxX, maxY);
    }
    if (type === 'arc') {
        const r = Math.abs(obj.radius || 0);
        if (r < 0.001) return false;
        const sa = obj.startAngle ?? 0;
        const ea = obj.endAngle ?? (2 * Math.PI);
        const dir = obj.direction || 'CCW';
        if (!_circleIntersectsRect(obj.cx, obj.cy, r, minX, minY, maxX, maxY)) return false;
        return _arcIntersectsRect(obj.cx, obj.cy, r, sa, ea, dir, minX, minY, maxX, maxY);
    }
    if (type === 'rect') {
        const x = obj.x, y = obj.y, w = obj.width, h = obj.height;
        if (_segIntersectsRect(x, y, x + w, y, minX, minY, maxX, maxY)) return true;
        if (_segIntersectsRect(x + w, y, x + w, y + h, minX, minY, maxX, maxY)) return true;
        if (_segIntersectsRect(x + w, y + h, x, y + h, minX, minY, maxX, maxY)) return true;
        if (_segIntersectsRect(x, y + h, x, y, minX, minY, maxX, maxY)) return true;
        return false;
    }
    if (type === 'polygon' || type === 'polyline' || type === 'lwpolyline') {
        let verts;
        if (typeof obj.getVertices === 'function') {
            verts = obj.getVertices();
        } else if (obj.points && Array.isArray(obj.points)) {
            verts = obj.points;
        } else if (obj.vertices && Array.isArray(obj.vertices)) {
            verts = obj.vertices;
        } else {
            return false;
        }
        if (verts.length < 2) return false;
        const isClosed = type === 'polygon' || obj.closed;
        const segCount = isClosed ? verts.length : verts.length - 1;
        for (let i = 0; i < segCount; i++) {
            const v1 = verts[i];
            const v2 = verts[(i + 1) % verts.length];
            if (_segIntersectsRect(v1.x, v1.y, v2.x, v2.y, minX, minY, maxX, maxY)) return true;
        }
        return false;
    }
    if (type === 'text') {
        return obj.x >= minX && obj.x <= maxX && obj.y >= minY && obj.y <= maxY;
    }
    if (type === 'spline') {
        const pts = obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [];
        for (let i = 0; i < pts.length - 1; i++) {
            if (_segIntersectsRect(pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y, minX, minY, maxX, maxY)) return true;
        }
        return false;
    }
    if (type === 'ellipse') {
        const cx = obj.cx || 0, cy = obj.cy || 0;
        const rx = Math.abs(obj.rx || 0), ry = Math.abs(obj.ry || 0);
        if (cx + rx < minX || cx - rx > maxX || cy + ry < minY || cy - ry > maxY) return false;
        return true;
    }
    if (typeof obj.getPoints === 'function') {
        for (const pt of obj.getPoints()) {
            if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) return true;
        }
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════
// 2. Панорамирование средней кнопкой мыши
// ═══════════════════════════════════════════════════════════════
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const rect = canvas.getBoundingClientRect();
        
        if (showSheetView) {
            const { x: sheetX, y: sheetY, w: sheetW, h: sheetH } = getSheetGeometry();
            
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            if (mouseX >= sheetX && mouseX <= sheetX + sheetW &&
                mouseY >= sheetY && mouseY <= sheetY + sheetH) {
                isSheetPanning = true;
                sheetPanStart = { x: e.clientX, y: e.clientY };
                canvas.style.cursor = 'move';
                return;
            }
        }

        isPanning = true;
        panStart = { x: e.clientX - panX, y: e.clientY - panY };
        canvas.style.cursor = 'grabbing';
    }
});

// ═══════════════════════════════════════════════════════════════
// 3. ОСНОВНОЙ ОБРАБОТЧИК MOUSEDOWN
// ═══════════════════════════════════════════════════════════════
canvas.addEventListener('mousedown', (e) => {
    if (appState.isDraggingCutLine) return;
    if (e.button === 1) return;
    // v4.72: ПКМ (button === 2) НЕ сбрасывает выделение — контекстное меню
    // должно работать с уже выделенными объектами. Раньше mousedown от ПКМ
    // попадал в основной обработчик и очищал selectedObjects.
    if (e.button === 2) return;

    const rect = canvas.getBoundingClientRect();
    let x = (e.clientX - rect.left - canvas.width / 2 - panX) / zoom;
    let y = (e.clientY - rect.top - canvas.height / 2 - panY) / zoom;

    // v1.0: Offset — перехватываем клик если активен режим offset
    if (window.offsetMode && typeof window.handleOffsetClick === 'function') {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.handleOffsetClick(x, y);
        return;
    }

    // v1.0: Mirror — перехватываем клик если активен режим mirror
    if (window.mirrorMode && typeof window.handleMirrorClick === 'function') {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.handleMirrorClick(x, y);
        return;
    }

    // v4.80: Pattern drag-режим — клик = применить (работает и на холсте, и на листе)
    if (appState.rectPatternDragging) {
        e.preventDefault();
        e.stopImmediatePropagation();
        applyRectPattern();
        return;
    }
    // v2.9: rectPattern WaitCenter — клик устанавливает первый угол прямоугольника
    if (appState.rectPatternWaitCenter) {
        e.preventDefault();
        e.stopImmediatePropagation();
        let cx, cy;
        if (appState.rectPatternIsSheetMode && typeof showSheetView !== 'undefined' && showSheetView) {
            const { x: sheetX, y: sheetY, scaleX, scaleY } = getSheetGeometry();
            cx = (e.clientX - rect.left - sheetX) / scaleX;
            cy = (e.clientY - rect.top - sheetY) / scaleY;
        } else {
            cx = x;
            cy = y;
        }
        appState.rectPatternWaitCenter = false;
        appState.rectPatternDragging = true;
        appState.rectPatternStartPoint = { x: cx, y: cy };
        appState.rectPatternEndPoint = { x: cx, y: cy };
        if (typeof render === 'function') render();
        return;
    }
    // v2.6: WaitCenter — клик устанавливает центр окружности, затем dragging
    if (appState.circPatternWaitCenter) {
        e.preventDefault();
        e.stopImmediatePropagation();
        // Координаты клика (canvas или sheet)
        let cx, cy;
        if (appState.circPatternIsSheetMode && typeof showSheetView !== 'undefined' && showSheetView) {
            const { x: sheetX, y: sheetY, scaleX, scaleY } = getSheetGeometry();
            cx = (e.clientX - rect.left - sheetX) / scaleX;
            cy = (e.clientY - rect.top - sheetY) / scaleY;
        } else {
            cx = x;  // canvas-координаты уже вычислены выше
            cy = y;
        }
        appState.circPatternWaitCenter = false;
        appState.circPatternDragging = true;
        appState.circPatternCenter = { x: cx, y: cy };
        appState.circPatternEndPoint = { x: cx, y: cy };
        appState.circPatternRadius = 0;
        appState.circPatternStartAngle = 0;
        if (typeof render === 'function') render();
        return;
    }
    if (appState.circPatternDragging) {
        e.preventDefault();
        e.stopImmediatePropagation();
        applyCircPattern();
        return;
    }

    // ═══════════════════════════════════════════════════════════
    // КАЛИБРОВКА ФОТО ОСТАТКА
    // ═══════════════════════════════════════════════════════════
    if (isCalibrating && e.button === 0) {
        console.log(`🎯 [mouse-events] Калибровка: клик в (${x.toFixed(1)}, ${y.toFixed(1)}), isCalibrating=${isCalibrating}`);
        const handled = handleCalibrationClick(x, y);
        if (handled) {
            console.log(`✅ [mouse-events] Калибровка обработана: p1=${!!calibratePoint1}, p2=${!!calibratePoint2}`);
            e.stopImmediatePropagation();
            return;
        }
    }

    let clickedOnSheet = false;

    if (showSheetView && e.button === 0) {
        const { x: sheetX, y: sheetY, w: sheetW, h: sheetH, scaleX, scaleY } = getSheetGeometry();

        if (e.clientX - rect.left >= sheetX && e.clientX - rect.left <= sheetX + sheetW &&
            e.clientY - rect.top >= sheetY && e.clientY - rect.top <= sheetY + sheetH) {

            clickedOnSheet = true;
            const clickSheetX = (e.clientX - rect.left - sheetX) / scaleX;
            const clickSheetY = (e.clientY - rect.top - sheetY) / scaleY;

            // v4.56: Линейка — перехватываем клик если режим линейки активен
            if (window.RulerTool && window.RulerTool.isActive()) {
                if (window.RulerTool.handleClick(clickSheetX, clickSheetY, e)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
            }

            const currentSheetForDrag = appState.allSheets && appState.allSheets.length > 0
                ? appState.allSheets[appState.currentSheetIndex || 0] : null;
            const dragCutLine = currentSheetForDrag ? currentSheetForDrag.cutRemnantLine : appState.cutRemnantLine;
            const dragShowCutLine = currentSheetForDrag ? currentSheetForDrag.showCutRemnantLine : appState.showCutRemnantLine;

            if (dragShowCutLine && dragCutLine !== null && e.button === 0) {
                const lineY = dragCutLine.y;
                const tolerance = CUT_LINE_TOLERANCE / scaleY;
                if (Math.abs(clickSheetY - lineY) < tolerance) {
                    appState.isDraggingCutLine = true;
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
            }

            if (isDrawingRect && e.button === 0) {
                if (currentMarkupMode === 'rect') {
                    currentRect = {
                        x: clickSheetX, y: clickSheetY,
                        width: 0, height: 0,
                        startX: clickSheetX, startY: clickSheetY
                    };
                } else if (currentMarkupMode === 'circle') {
                    currentCircle = { cx: clickSheetX, cy: clickSheetY, radius: 0 };
                } else if (currentMarkupMode === 'polygon') {
                    if (!isDrawingMarkupPolygon) {
                        isDrawingMarkupPolygon = true;
                        markupPolygonPoints = [{ x: clickSheetX, y: clickSheetY }];
                    } else {
                        const firstPoint = markupPolygonPoints[0];
                        const distToFirst = Math.sqrt(
                            Math.pow(clickSheetX - firstPoint.x, 2) + 
                            Math.pow(clickSheetY - firstPoint.y, 2)
                        );
                        
                        if (distToFirst < 10 && markupPolygonPoints.length >= 3) {
                            markupRects.push({ type: 'polygon', points: [...markupPolygonPoints] });
                            appState.markupRects = markupRects;
                            markupPolygonPoints = [];
                            isDrawingMarkupPolygon = false;
                            render();
                            return;
                        } else {
                            markupPolygonPoints.push({ x: clickSheetX, y: clickSheetY });
                        }
                    }
                }
                selectedRectIndex = -1;
                render();
                return;
            }

            let foundIndex = -1;
            // v4.73: Ищем деталь под курсором с учётом реальной формы (полигона),
            // а не только bbox. Если деталь — кольцо (фланец), клик внутри отверстия
            // не должен выделять кольцо — должна выделяться деталь ВНУТРИ отверстия.
            // v4.75: Fallback на bbox для деталей без отверстий (L-shape, детали с вырезами).
            // Для таких деталей polygon = concave outline, который не покрывает пустоты.
            // Клик в пустоте L-shape должен выделять деталь (для drag / diagonal layout),
            // а не пропускать её. Только для деталей с отверстиями (outline.length > 1)
            // клик в отверстии пропускает деталь.
            for (let i = nestedParts.length - 1; i >= 0; i--) {
                const nested = nestedParts[i];
                // Быстрая проверка bbox
                if (clickSheetX < nested.x || clickSheetX > nested.x + nested.width ||
                    clickSheetY < nested.y || clickSheetY > nested.y + nested.height) {
                    continue;
                }
                // v4.73: Если есть polygon — точная проверка (point-in-polygon).
                if (nested.polygon && nested.polygon.length >= 3) {
                    if (!pointInPolygonNested(clickSheetX, clickSheetY, nested.polygon)) {
                        // v4.75: Не попали в polygon. Определяем причину:
                        // 1. Клик в отверстии (кольцо/фланец) → пропускаем деталь
                        // 2. Клик в пустоте L-shape / детали с вырезом → выделяем по bbox
                        // Признак отверстий: nested.outline содержит > 1 контура
                        // (внешний + отверстия). outline хранится в локальных координатах.
                        const hasHoles = Array.isArray(nested.outline) && nested.outline.length > 1;
                        if (hasHoles) {
                            // Клик в отверстии — пропускаем эту деталь, ищем следующую
                            continue;
                        }
                        // Иначе — клик в пустоте L-shape/выреза. Fallback на bbox:
                        // выделяем деталь (нужно для drag / diagonal layout).
                    }
                }
                foundIndex = i;
                break;
            }

            if (foundIndex >= 0) {
                if (e.button === 1) return;

                const nested = nestedParts[foundIndex];
                
                if (appState.diagonalLayoutEnabled) {
                    // v4.42: Поддержка группы деталей.
                    // selectedNestedParts содержит ИНДЕКСЫ (числа), не объекты!
                    // Нужно получить объекты через nestedParts[idx].
                    const sel = (typeof selectedNestedParts !== 'undefined') ? selectedNestedParts : [];
                    // Проверяем: кликнутая деталь (foundIndex) в выделении и выделено >1
                    const isInSelection = sel.length > 1 && sel.includes(foundIndex);
                    if (isInSelection) {
                        // Групповая диагональная раскладка
                        // Получаем объекты деталей по индексам
                        appState.diagonalPatternSources = sel.map(idx => nestedParts[idx]).filter(n => n);
                        appState.diagonalPatternSource = null;  // группа, не одна деталь
                        // startPoint = центр bbox группы
                        let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
                        for (const s of appState.diagonalPatternSources) {
                            gMinX = Math.min(gMinX, s.x);
                            gMinY = Math.min(gMinY, s.y);
                            gMaxX = Math.max(gMaxX, s.x + s.width);
                            gMaxY = Math.max(gMaxY, s.y + s.height);
                        }
                        appState.diagonalPatternStartPoint = {
                            x: (gMinX + gMaxX) / 2,
                            y: (gMinY + gMaxY) / 2
                        };
                        console.log(`📐 Групповая диагональная раскладка: ${appState.diagonalPatternSources.length} деталей, центр группы (${appState.diagonalPatternStartPoint.x.toFixed(0)}, ${appState.diagonalPatternStartPoint.y.toFixed(0)})`);
                    } else {
                        // Одиночная диагональная раскладка (как раньше)
                        appState.diagonalPatternSource = nested;
                        appState.diagonalPatternSources = null;
                        appState.diagonalPatternStartPoint = {
                            x: nested.x + nested.width / 2,
                            y: nested.y + nested.height / 2
                        };
                    }
                    appState.diagonalPatternDragging = true;
                    appState.diagonalPatternEndPoint = { ...appState.diagonalPatternStartPoint };
                    appState.diagonalPatternCount = 2;
                    appState.diagonalPatternCountManuallySet = false;
                    appState.diagonalPatternMouseLastX = null; 
                    appState.diagonalPatternMouseLastY = null;
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
                
                if (isShiftPressed) {
                    if (!selectedNestedParts.includes(foundIndex)) {
                        selectedNestedParts.push(foundIndex);
                        appState.selectedNestedParts = selectedNestedParts;
                    }
                } else {
                    if (!selectedNestedParts.includes(foundIndex)) {
                        selectedNestedParts = [foundIndex];
                        appState.selectedNestedParts = selectedNestedParts;
                    }
                }

                document.getElementById('nestedPartTools').style.display = 'block';
                document.getElementById('markupRectTools').style.display = 'none';
                document.getElementById('cutRemnantTools').style.display = 'none';
                const _rt = document.getElementById('rulerTools'); if (_rt) _rt.style.display = 'none';
                document.getElementById('overlapTools').style.display = 'block';

                const draggedNested = nestedParts[foundIndex];
                const mouseOffsetX = clickSheetX - draggedNested.x;
                const mouseOffsetY = clickSheetY - draggedNested.y;

                nestedDragOffsets = selectedNestedParts.map(idx => ({
                    index: idx,
                    startX: nestedParts[idx].x,
                    startY: nestedParts[idx].y,
                    // v4.70: mouseOffset только для детали под курсором (foundIndex).
                    // Остальные детали двигаются на ту же delta (разницу start→new),
                    // а не на свой mouseOffset. Раньше mouseOffset для остальных
                    // вычислялся как разница позиций → детали "отскакивали".
                    mouseOffsetX: idx === foundIndex ? mouseOffsetX : 0,
                    mouseOffsetY: idx === foundIndex ? mouseOffsetY : 0
                }));
                
                isDraggingNested = true;
                if (typeof saveState === 'function') saveState();
                render();
                return;
            } else {
                if (e.button === 0 && !(e.altKey || e.button === 1)) {
                    selectedNestedParts = [];
                    isDraggingNested = false;
                    nestedDragOffsets = [];

                    if (!showSheetView) {
                        document.getElementById('nestedPartTools').style.display = 'none';
                    }

                    let markupFound = -1;
                    for (let i = markupRects.length - 1; i >= 0; i--) {
                        const m = markupRects[i];
                        let hit = false;
                        if (m.type === 'circle') {
                            hit = Math.sqrt(Math.pow(clickSheetX - m.cx, 2) + Math.pow(clickSheetY - m.cy, 2)) <= m.radius;
                        } else if (m.type === 'polygon') {
                            hit = pointInPolygon(clickSheetX, clickSheetY, m.points);
                        } else {
                            hit = clickSheetX >= m.x && clickSheetX <= m.x + m.width &&
                                  clickSheetY >= m.y && clickSheetY <= m.y + m.height;
                        }
                        if (hit) { markupFound = i; break; }
                    }
                    
                    if (markupFound >= 0) {
                        selectedRectIndex = markupFound;
                        isSheetSelecting = false;
                        render();
                        updatePartsList();
                        return;
                    }

                    if (!appState.justFinishedCutLineDrag) {
                        isSheetSelecting = true;
                        sheetSelectStart = { x: clickSheetX, y: clickSheetY };
                        sheetSelectEnd = { x: clickSheetX, y: clickSheetY };
                        selectedRectIndex = -1;
                        
                        document.getElementById('nestedPartTools').style.display = 'none';
                        document.getElementById('markupRectTools').style.display = 'block';
                        document.getElementById('cutRemnantTools').style.display = 'block';
                        const _rt2 = document.getElementById('rulerTools'); if (_rt2) _rt2.style.display = 'block';
                        document.getElementById('overlapTools').style.display = 'block';
                        
                        render();
                    } else {
                        appState.justFinishedCutLineDrag = false;
                        document.getElementById('nestedPartTools').style.display = 'none';
                        document.getElementById('markupRectTools').style.display = 'block';
                        document.getElementById('cutRemnantTools').style.display = 'block';
                        const _rt3 = document.getElementById('rulerTools'); if (_rt3) _rt3.style.display = 'block';
                        document.getElementById('overlapTools').style.display = 'block';
                    }
                    return; 
                }

                selectedNestedParts = [];
                isDraggingNested = false;
                document.getElementById('nestedPartTools').style.display = 'none';
                document.getElementById('markupRectTools').style.display = 'block';
                document.getElementById('cutRemnantTools').style.display = 'block';
                const _rt4 = document.getElementById('rulerTools'); if (_rt4) _rt4.style.display = 'block';
                document.getElementById('overlapTools').style.display = 'block';

                let markupFound = -1;
                for (let i = markupRects.length - 1; i >= 0; i--) {
                    const m = markupRects[i];
                    let hit = false;
                    if (m.type === 'circle') hit = Math.sqrt(Math.pow(clickSheetX - m.cx, 2) + Math.pow(clickSheetY - m.cy, 2)) <= m.radius;
                    else if (m.type === 'polygon') hit = pointInPolygon(clickSheetX, clickSheetY, m.points);
                    else hit = clickSheetX >= m.x && clickSheetX <= m.x + m.width && clickSheetY >= m.y && clickSheetY <= m.y + m.height;
                    if (hit) { markupFound = i; break; }
                }
                selectedRectIndex = markupFound;
                render();
                updatePartsList();
                return;
            }
        } else {
            selectedNestedParts = [];
            selectedRectIndex = -1;
            isDraggingNested = false;
            render();
            updatePartsList();
        }
    }

    if (e.button === 1) return;

    if (currentTool === 'select') {
        const dimHit = findDimensionAtPoint(x, y);
        if (dimHit) {
            selectedDimension = dimHit.index;
            selectedEdge = null;
            selectedObjects.length = 0;
            isDraggingDimension = true;
            draggedDimensionIndex = dimHit.index;
            const dim = dimensionLines[draggedDimensionIndex];
            dimensionDragOffset.x = x - (dim.x1 + dim.x2) / 2;
            dimensionDragOffset.y = y - (dim.y1 + dim.y2) / 2;
            showProperties(null);
            render();
            return;
        } else {
            selectedDimension = null;
        }

        const angleHit = findAngleDimensionAtPoint(x, y);
        if (angleHit) {
            selectedAngleDimension = angleHit.index;
            selectedDimension = null;
            selectedEdge = null;
            selectedObjects.length = 0;
            showProperties(null);
            render();
            return;
        } else {
            selectedAngleDimension = null;
        }

        const objPoint = findObjectPoint(x, y);
        if (objPoint && objPoint.pointType !== 'center') {
<<<<<<< HEAD
=======
            // v5.03: Если объект — часть мультивыделения (контур), включаем
            // режим масштабирования вместо перемещения одной точки.
            if (selectedObjects.includes(objPoint.obj) && selectedObjects.length > 1) {
                isScalingContour = true;
                draggedPoint = objPoint;
                selectedEdge = null;
                saveState();
                // Снапшот начальных координат всех выделенных объектов
                scaleContourInitial = selectedObjects.map(o => _snapshotObject(o));
                // Центр масштабирования — центроид bbox всех выделенных объектов
                scaleContourCenter = _getSelectionCentroid(selectedObjects);
                // Начальное расстояние от центра до точки
                scaleContourInitialDist = Math.hypot(
                    objPoint.point.x - scaleContourCenter.x,
                    objPoint.point.y - scaleContourCenter.y
                );
                if (scaleContourInitialDist < 0.001) scaleContourInitialDist = 1; // защита
                render();
                return;
            }
>>>>>>> master
            draggedPoint = objPoint;
            selectedEdge = null;
            saveState();
            render();
            return;
        }

        if (parallelMode && parallelStep === 1) {
            console.log(`[PARALLEL DEBUG] parallelStep=1, parallelMode=${parallelMode}, клик=(${x.toFixed(1)},${y.toFixed(1)})`);
            for (let i = objects.length - 1; i >= 0; i--) {
                const obj = objects[i];
                if (!obj || typeof obj.contains !== 'function' || obj.type !== 'line') continue;
                console.log(`[PARALLEL DEBUG] Проверка линии #${i}: contains=${obj.contains(x, y)}, isRef=${obj === referenceLineForParallel}, x1=(${obj.x1.toFixed(1)},${obj.y1.toFixed(1)}) x2=(${obj.x2.toFixed(1)},${obj.y2.toFixed(1)})`);
                if (obj.contains(x, y) && obj !== referenceLineForParallel) {
                    const targetLine = referenceLineForParallel;
                    const referenceLine = obj;
                    console.log(`[PARALLEL DEBUG] Найдена пара! target=(${targetLine.x1.toFixed(1)},${targetLine.y1.toFixed(1)})→(${targetLine.x2.toFixed(1)},${targetLine.y2.toFixed(1)}), ref=(${referenceLine.x1.toFixed(1)},${referenceLine.y1.toFixed(1)})→(${referenceLine.x2.toFixed(1)},${referenceLine.y2.toFixed(1)})`);
                    saveState();
                    const refAngle = parallelMode === 'parallel' ? referenceLine.getAngle() : referenceLine.getAngle() + Math.PI / 2;
                    const length = targetLine.length;
                    console.log(`[PARALLEL DEBUG] refAngle=${(refAngle * 180 / Math.PI).toFixed(1)}°, length=${length.toFixed(1)}, mode=${parallelMode}`);

                    // v4.60 FIX: Проверяем какие концы линии привязаны к другим объектам.
                    const SNAP_TOL = 1.0;

                    let p1Anchored = false, p2Anchored = false;
                    let p1AnchorObj = null, p2AnchorObj = null;
                    for (const otherObj of objects) {
                        if (otherObj === targetLine || otherObj.type !== 'line') continue;
                        const d1a = Math.hypot(targetLine.x1 - otherObj.x1, targetLine.y1 - otherObj.y1);
                        const d1b = Math.hypot(targetLine.x1 - otherObj.x2, targetLine.y1 - otherObj.y2);
                        const d2a = Math.hypot(targetLine.x2 - otherObj.x1, targetLine.y2 - otherObj.y1);
                        const d2b = Math.hypot(targetLine.x2 - otherObj.x2, targetLine.y2 - otherObj.y2);
                        if (d1a < SNAP_TOL || d1b < SNAP_TOL) { p1Anchored = true; p1AnchorObj = otherObj; }
                        if (d2a < SNAP_TOL || d2b < SNAP_TOL) { p2Anchored = true; p2AnchorObj = otherObj; }
                    }
                    if (Math.hypot(targetLine.x1, targetLine.y1) < SNAP_TOL) p1Anchored = true;
                    if (Math.hypot(targetLine.x2, targetLine.y2) < SNAP_TOL) p2Anchored = true;

                    console.log(`[PARALLEL DEBUG] p1Anchored=${p1Anchored} p2Anchored=${p2Anchored}`);

                    if (p1Anchored && p2Anchored) {
                        // v4.60 FIX: Оба конца привязаны (часть контура).
                        // Вращаем вокруг конца, БЛИЖАЙШЕГО к точке клика.
                        const dist1 = Math.hypot(targetLine.x1 - x, targetLine.y1 - y);
                        const dist2 = Math.hypot(targetLine.x2 - x, targetLine.y2 - y);
                        if (dist1 <= dist2) {
                            console.log(`[PARALLEL DEBUG] Оба привязаны — вращаем вокруг x1 (ближе к клику, dist=${dist1.toFixed(1)})`);
                            targetLine.x2 = targetLine.x1 + Math.cos(refAngle) * length;
                            targetLine.y2 = targetLine.y1 + Math.sin(refAngle) * length;
                        } else {
                            console.log(`[PARALLEL DEBUG] Оба привязаны — вращаем вокруг x2 (ближе к клику, dist=${dist2.toFixed(1)})`);
                            targetLine.x1 = targetLine.x2 - Math.cos(refAngle) * length;
                            targetLine.y1 = targetLine.y2 - Math.sin(refAngle) * length;
                        }
                    } else if (p1Anchored && !p2Anchored) {
                        console.log(`[PARALLEL DEBUG] Вращаем вокруг x1=(${targetLine.x1.toFixed(1)},${targetLine.y1.toFixed(1)})`);
                        targetLine.x2 = targetLine.x1 + Math.cos(refAngle) * length;
                        targetLine.y2 = targetLine.y1 + Math.sin(refAngle) * length;
                    } else if (p2Anchored && !p1Anchored) {
                        console.log(`[PARALLEL DEBUG] Вращаем вокруг x2=(${targetLine.x2.toFixed(1)},${targetLine.y2.toFixed(1)})`);
                        targetLine.x1 = targetLine.x2 - Math.cos(refAngle) * length;
                        targetLine.y1 = targetLine.y2 - Math.sin(refAngle) * length;
                    } else {
                        console.log(`[PARALLEL DEBUG] Ни один не привязан — вращаем вокруг центра`);
                        const center = targetLine.center;
                        targetLine.x1 = center.x - Math.cos(refAngle) * length / 2;
                        targetLine.y1 = center.y - Math.sin(refAngle) * length / 2;
                        targetLine.x2 = center.x + Math.cos(refAngle) * length / 2;
                        targetLine.y2 = center.y + Math.sin(refAngle) * length / 2;
                    }

                    console.log(`[PARALLEL DEBUG] Результат: target=(${targetLine.x1.toFixed(1)},${targetLine.y1.toFixed(1)})→(${targetLine.x2.toFixed(1)},${targetLine.y2.toFixed(1)})`);
                    parallelMode = null;
                    parallelStep = 0;
                    referenceLineForParallel = null;
                    selectedObjects.length = 0; selectedObjects.push(targetLine);
                    render();
                    return;
                }
            }
            console.log(`[PARALLEL DEBUG] Линия под кликом не найдена!`);
        }
   
        let clickedObject = null;
        for (let i = objects.length - 1; i >= 0; i--) {
            if (objects[i] && typeof objects[i].contains === 'function' && objects[i].contains(x, y)) {
                clickedObject = objects[i];
                break;
            }
        }

        // v1.0: "Захват за заливку" — если не попали на линию, проверяем
        // клик внутри bbox группы (findGroupAtPoint из group-tool.js)
        if (!clickedObject && typeof window.findGroupAtPoint === 'function') {
            const groupObj = window.findGroupAtPoint(x, y);
            if (groupObj) clickedObject = groupObj;
        }

        if (!clickedObject) {
            for (let i = objects.length - 1; i >= 0; i--) {
                if (objects[i] && objects[i].type === 'text' && typeof objects[i].contains === 'function' && objects[i].contains(x, y)) {
                    clickedObject = objects[i];
                    break;
                }
            }
        }

        const edgeHit = findEdgeAtPoint(x, y);
        if (edgeHit && edgeHit.obj.type !== 'line' && !clickedObject && !parallelMode) {
            selectedEdge = edgeHit;
            selectedObjects.length = 0;
            showProperties(null);
            render();
            return;
        } else if (!parallelMode) {
            selectedEdge = null;
        }

        if (clickedObject) {
            // v1.0: Если объект в группе — выбираем ВСЮ группу
            if (clickedObject._groupId !== undefined && !isCtrlPressed && !isShiftPressed) {
                const groupObjs = (typeof window.getGroupObjects === 'function')
                    ? window.getGroupObjects(clickedObject) : [clickedObject];
                // Проверяем: группа уже выбрана? Если да — начинаем drag
                const allSelected = groupObjs.every(go => selectedObjects.includes(go));
                if (allSelected && selectedObjects.length === groupObjs.length) {
                    // Группа уже выбрана — активируем перетаскивание
                    potentialDragObject = 'multiple';
                    dragStartPos = { x, y };
                    const center = getSelectionCenter();
                    dragOffset = { x: x - center.x, y: y - center.y };
                } else {
                    // Группа не выбрана — выбираем и активируем drag
                    selectedObjects.length = 0;
                    for (const go of groupObjs) selectedObjects.push(go);
                    showProperties(null);
                    potentialDragObject = 'multiple';
                    dragStartPos = { x, y };
                    const center = getSelectionCenter();
                    dragOffset = { x: x - center.x, y: y - center.y };
                }
                window._groupDragActive = true;  // не сбрасывать potentialDragObject в mouseup
                render();
                return;
            }
            // v5.02: Shift+клик — toggle (добавить/убрать), как в Компас-3D
            // Ctrl+клик — тоже toggle (для совместимости)
            if (isCtrlPressed || isShiftPressed) {
                const idx = selectedObjects.indexOf(clickedObject);
                // v4.97: Shift+клик по УЖЕ ВЫДЕЛЕННОМУ объекту → начало ортогонального drag
                // (не toggle). Если нужно убрать из выделения — используйте Ctrl+клик.
                if (isShiftPressed && idx >= 0) {
                    // Объект уже выбран — активируем перетаскивание с Shift
                    potentialDragObject = 'multiple';
                    dragStartPos = { x, y };
                    const center = getSelectionCenter();
                    dragOffset = { x: x - center.x, y: y - center.y };
                    window._groupDragActive = true;
                    render();
                    return;
                }
                if (idx >= 0) selectedObjects.splice(idx, 1); else selectedObjects.push(clickedObject);
                showProperties(selectedObjects.length === 1 ? selectedObjects[0] : null);
            } else {
                if (selectedObjects.includes(clickedObject)) {
                    // Объект уже выбран — активируем перетаскивание
                    potentialDragObject = 'multiple';
                    dragStartPos = { x, y };
                    const center = getSelectionCenter();
                    dragOffset = { x: x - center.x, y: y - center.y };
                    window._groupDragActive = true;
                } else {
                    // v1.0: Объект не выбран — выбираем И СРАЗУ активируем перетаскивание
                    // (как в Компас-3D: клик = выбор + начало drag)
                    selectedObjects.length = 0; selectedObjects.push(clickedObject);
                    showProperties(clickedObject);
                    potentialDragObject = 'multiple';
                    dragStartPos = { x, y };
                    const center = getSelectionCenter();
                    dragOffset = { x: x - center.x, y: y - center.y };
                    window._groupDragActive = true;
                }
            }
        } else {
            potentialDragObject = null;
            isSelecting = true;
            selectStart = { x, y };
            selectEnd = { x, y };
            if (!isCtrlPressed && !isShiftPressed) { selectedObjects.length = 0; selectedDimension = null; selectedEdge = null; showProperties(null); }
        }
        render();

    } else if (currentTool === 'eraser' && e.button === 0) {
        saveState();
        isDrawing = true;
        startPoint = { x, y };
        currentShape = new Line(x, y, x, y);
        window._eraserStartPoint = { x, y };  // v1.0: для отличия клика от drag
        render();
        return;
    }

    if (currentTool === 'dimension' && e.button === 0) {
        if (isDrawing && !dimensionStartPoint) isDrawing = false;
        if (dimensionStartPoint && dimensionStartPoint.secondPoint) { isDrawing = false; dimensionStartPoint = null; }

        if (!isDrawing) {
            isDrawing = true;
            if (snapEnabled && objects.length > 0) {
                const snap = findSnapPoint(x, y);
                if (snap) { x = snap.x; y = snap.y; }
                else {
                    const edgeHit = findEdgeAtPoint(x, y);
                    if (edgeHit) {
                        const e = edgeHit.edge;
                        // Особая обработка для окружности круга
                        if (e.isCircle) {
                            x = e.p1.x;
                            y = e.p1.y;
                        } else {
                            const dx = e.p2.x - e.p1.x, dy = e.p2.y - e.p1.y;
                            const lenSq = dx * dx + dy * dy;
                            if (lenSq > 0) {
                                let t = ((x - e.p1.x) * dx + (y - e.p1.y) * dy) / lenSq;
                                t = Math.max(0, Math.min(1, t));
                                x = e.p1.x + t * dx; y = e.p1.y + t * dy;
                            }
                        }
                    }
                }
            }
            dimensionStartPoint = { x, y };
            dimensionLabel.style.display = 'block';
            dimensionLabel.textContent = 'Выберите вторую точку';
        } else {
            if (snapEnabled && objects.length > 0) {
                const snap = findSnapPoint(x, y);
                if (snap) { x = snap.x; y = snap.y; }
                else {
                    const edgeHit = findEdgeAtPoint(x, y);
                    if (edgeHit) {
                        const e = edgeHit.edge;
                        // Особая обработка для окружности круга
                        if (e.isCircle) {
                            x = e.p1.x;
                            y = e.p1.y;
                        } else {
                            const dx = e.p2.x - e.p1.x, dy = e.p2.y - e.p1.y;
                            const lenSq = dx * dx + dy * dy;
                            if (lenSq > 0) {
                                let t = ((x - e.p1.x) * dx + (y - e.p1.y) * dy) / lenSq;
                                t = Math.max(0, Math.min(1, t));
                                x = e.p1.x + t * dx; y = e.p1.y + t * dy;
                            } else { x = e.midX; y = e.midY; }
                        }
                    }
                }
            }
            if (Math.sqrt(Math.pow(x - dimensionStartPoint.x, 2) + Math.pow(y - dimensionStartPoint.y, 2)) > 5) {
                dimensionLines.push({ x1: dimensionStartPoint.x, y1: dimensionStartPoint.y, x2: x, y2: y, value: Math.round(Math.sqrt(Math.pow(x - dimensionStartPoint.x, 2) + Math.pow(y - dimensionStartPoint.y, 2))), type: 'custom' });
            }
            isDrawing = false; dimensionStartPoint = null;
            dimensionLabel.style.display = 'none';
            render();
        }
        return;
    }

    if (currentTool === 'angle') {
        if (!isDrawing || !dimensionStartPoint) {
            isDrawing = true;
            // v4.88: Убрано objects.length > 0 — findSnapPoint включает origin snap
            if (snapEnabled) {
                const snap = findSnapPoint(x, y);
                if (snap) { x = snap.x; y = snap.y; snapPoint = snap; }
            }
            dimensionStartPoint = { x, y };
            dimensionLabel.style.display = 'block';
        } else if (!dimensionStartPoint.secondPoint) {
            if (snapEnabled) {
                const snap = findSnapPoint(x, y);
                if (snap) { x = snap.x; y = snap.y; snapPoint = snap; }
            }
            dimensionStartPoint.secondPoint = { x, y };
            dimensionLabel.textContent = '📐 Кликните на третью точку';
        } else {
            if (snapEnabled) {
                const snap = findSnapPoint(x, y);
                if (snap) { x = snap.x; y = snap.y; snapPoint = snap; }
            }
            createAngleDimension(dimensionStartPoint.x, dimensionStartPoint.y, dimensionStartPoint.secondPoint.x, dimensionStartPoint.secondPoint.y, x, y);
            isDrawing = false; dimensionStartPoint = null;
            dimensionLabel.style.display = 'none';
            render();
        }
        return;
    }

    else if (currentTool !== 'select' && currentTool !== 'eraser' && currentTool !== 'dimension' && e.button === 0) {
        // РЕЖИМ МИКРОСТЫКА — начало рисования линии
        if (currentTool === 'microjoint' && appState.microjointEnabled && !appState.microjointIsDrawing) {
            appState.microjointIsDrawing = true;
            appState.microjointLineStart = { x, y };
            appState.microjointLineEnd = null;
            if (typeof saveState === 'function') saveState();
            console.log('[MICROJOINT] Начало линии:', x.toFixed(1), y.toFixed(1));
            render();
            return;
        }

if (currentTool === 'line' && isDrawing && currentShape) {
            if (currentShape.length >= 0.1) {
                saveState();
                objects.push(currentShape);
                selectedObjects.length = 0; selectedObjects.push(currentShape);
                if (isEditingPart && editingPartId !== null) {
                    const part = parts.find(p => samePartId(p.id, editingPartId));
                    if (part) { part.objects.push(currentShape); updatePartBounds(part); }
                }
                // v4.60 FIX: Сохраняем ПРИВЯЗАННУЮ точку как старт следующей линии.
                // Раньше брали currentShape.x2/y2 — но это могла быть точка,
                // смещённая constraint-ом параллельности, а не реальная привязка.
                // Если есть snapPoint — используем его, иначе x2/y2.
                let sx, sy;
                if (snapPoint) {
                    sx = snapPoint.x;
                    sy = snapPoint.y;
                    // Корректируем x2/y2 текущей линии на точную привязку
                    currentShape.x2 = sx;
                    currentShape.y2 = sy;
                } else {
                    sx = currentShape.x2;
                    sy = currentShape.y2;
                }
                startPoint = { x: sx, y: sy };
                currentShape = new Line(sx, sy, sx, sy);
                snapPoint = null; lineSnapConstraint = null;
                e.stopImmediatePropagation();
                if (lineDimensionInput) {
                    lineDimensionInput.value = '';
                    lineDimensionInput.style.left = (e.clientX + 5) + 'px';
                    lineDimensionInput.style.top = (e.clientY - 10) + 'px';
                    lineDimensionInput.focus();
                }
                render(); return;
            } else {
                isDrawing = false; currentShape = null; snapPoint = null; lineSnapConstraint = null;
                if (lineDimensionInput) lineDimensionInput.style.display = 'none';
                dimensionLabel.style.display = 'none';
                render(); return;
            }
        }
        
        // === КРУГ: второй клик фиксирует ===
        if (currentTool === 'circle' && isDrawing && currentShape) {
            if (currentShape.radius >= 0.5) {
                saveState();
                objects.push(currentShape);
                selectedObjects.length = 0; selectedObjects.push(currentShape);
                if (isEditingPart && editingPartId !== null) {
                    const part = parts.find(p => samePartId(p.id, editingPartId));
                    if (part) { part.objects.push(currentShape); updatePartBounds(part); }
                }
                showProperties(currentShape);
            }
            isDrawing = false;
            currentShape = null;
            snapPoint = null;
            if (lineDimensionInput) { lineDimensionInput.style.display = 'none'; lineDimensionInput.value = ''; }
            if (typeof shapeInputStage !== 'undefined') shapeInputStage = 0;
            render();
            return;
        }

        // === ПРЯМОУГОЛЬНИК: второй клик фиксирует ===
        if (currentTool === 'rect' && isDrawing && currentShape) {
            if (currentShape.absWidth >= 1 && currentShape.absHeight >= 1) {
                saveState();
                objects.push(currentShape);
                selectedObjects.length = 0; selectedObjects.push(currentShape);
                if (isEditingPart && editingPartId !== null) {
                    const part = parts.find(p => samePartId(p.id, editingPartId));
                    if (part) { part.objects.push(currentShape); updatePartBounds(part); }
                }
                showProperties(currentShape);
            }
            isDrawing = false;
            currentShape = null;
            snapPoint = null;
            if (lineDimensionInput) { lineDimensionInput.style.display = 'none'; lineDimensionInput.value = ''; }
            if (typeof shapeInputStage !== 'undefined') shapeInputStage = 0;
            render();
            return;
        }

        // === МНОГОУГОЛЬНИК: второй клик фиксирует ===
        if (currentTool === 'polygon' && isDrawing && currentShape) {
            if (currentShape.radius >= 0.5) {
                saveState();
                objects.push(currentShape);
                selectedObjects.length = 0; selectedObjects.push(currentShape);
                if (isEditingPart && editingPartId !== null) {
                    const part = parts.find(p => samePartId(p.id, editingPartId));
                    if (part) { part.objects.push(currentShape); updatePartBounds(part); }
                }
                showProperties(currentShape);
            }
            isDrawing = false;
            currentShape = null;
            snapPoint = null;
            if (lineDimensionInput) { lineDimensionInput.style.display = 'none'; lineDimensionInput.value = ''; }
            if (typeof shapeInputStage !== 'undefined') shapeInputStage = 0;
            render();
            return;
        }
        
        if (isDrawing || dimensionStartPoint) {
            isDrawing = false; dimensionStartPoint = null;
            dimensionLabel.style.display = 'none'; lineSnapConstraint = null;
            if (typeof lineDimensionInput !== 'undefined' && lineDimensionInput) {
                lineDimensionInput.style.display = 'none';
                lineDimensionInput.value = '';
            }
            if (typeof shapeInputStage !== 'undefined') shapeInputStage = 0;
        }

        isDrawing = true;
        // v4.88: Убрано условие objects.length > 0 — findSnapPoint работает на пустом холсте
        // (включает snap к origin (0,0) через слой 6). Раньше на пустом холсте snap к (0,0)
        // не работал через findSnapPoint, только через дублирующий код ниже с константой SNAP_DISTANCE.
        if (snapEnabled) {
            const snap = findSnapPoint(x, y);
            if (snap) { x = snap.x; y = snap.y; snapPoint = snap; }
        }
        // v4.88: Дублирующий snap к (0,0) — оставляем как fallback с snapPoint + snapIndicator.
        // Используем getEffectiveSnapDistance() вместо константы SNAP_DISTANCE.
        if (snapEnabled && !snapPoint) {
            const snapDist = (typeof window.getEffectiveSnapDistance === 'function') ? window.getEffectiveSnapDistance() : SNAP_DISTANCE;
            if (Math.sqrt(x * x + y * y) < snapDist) {
                x = 0; y = 0;
                snapPoint = { x: 0, y: 0, type: 'origin' };
                if (typeof snapIndicator !== 'undefined' && snapIndicator) {
                    snapIndicator.style.display = 'block';
                    snapIndicator.style.left = e.clientX + 'px';
                    snapIndicator.style.top = (e.clientY - 10) + 'px';
                }
            }
        }

        startPoint = { x, y };
        if (currentTool === 'line') {
            currentShape = new Line(x, y, x, y);
            // Показываем inline-ввод длины (Fusion 360 style)
            if (lineDimensionInput) {
                lineDimensionInput.style.display = 'block';
                lineDimensionInput.style.left = (e.clientX + 5) + 'px';
                lineDimensionInput.style.top = (e.clientY - 10) + 'px';
                lineDimensionInput.value = '';
                lineDimensionInput.placeholder = 'Длина | Нажмите Enter';
                shapeInputStage = 0;
                lineDimensionInput.focus();
            }
            if (dimensionLabel) dimensionLabel.style.display = 'none';
        }
        else if (currentTool === 'circle') {
            currentShape = new Circle(x, y, 0);
            if (lineDimensionInput) {
                lineDimensionInput.style.display = 'block';
                lineDimensionInput.style.left = (e.clientX + 5) + 'px';
                lineDimensionInput.style.top = (e.clientY - 10) + 'px';
                lineDimensionInput.value = '';
                lineDimensionInput.placeholder = 'Диаметр | Enter';
                shapeInputStage = 0;
                lineDimensionInput.focus();
            }
        }
        else if (currentTool === 'rect') {
            // v4.60: Если rectDrawMode='center' — клик = центр прямоугольника
            if (typeof rectDrawMode !== 'undefined' && rectDrawMode === 'center') {
                currentShape = new Rect(x, y, 0, 0);
                // При режиме "из центра" startPoint = центр, а x/y = top-left
                // Вычисляем top-left при mousemove (ниже)
            } else {
                currentShape = new Rect(x, y, 0, 0);
            }
            if (lineDimensionInput) {
                lineDimensionInput.style.display = 'block';
                lineDimensionInput.style.left = (e.clientX + 5) + 'px';
                lineDimensionInput.style.top = (e.clientY - 10) + 'px';
                lineDimensionInput.value = '';
                lineDimensionInput.placeholder = 'Ширина | Enter';
                shapeInputStage = 0;
                lineDimensionInput.focus();
            }
        }
        else if (currentTool === 'polygon') {
            currentShape = new Polygon(x, y, 0, polygonSides);
            if (lineDimensionInput) {
                lineDimensionInput.style.display = 'block';
                lineDimensionInput.style.left = (e.clientX + 5) + 'px';
                lineDimensionInput.style.top = (e.clientY - 10) + 'px';
                lineDimensionInput.value = '';
                lineDimensionInput.placeholder = 'Радиус | Enter';
                shapeInputStage = 0;
                lineDimensionInput.focus();
            }
        }
        else if (currentTool === 'text') {
            const text = prompt('Введите текст:', 'Надпись');
            if (text) {
                const fontSize = parseInt(prompt('Размер шрифта (10-50):', '14')) || 14;
                saveState();
                objects.push(new Text(x, y, text, fontSize));
                render();
            }
            isDrawing = false;
        }
        else if (currentTool === 'chamfer') {
            // v4.78: Инструмент Фаска — вызываем обработчик из chamfer-tool.js
            if (typeof window.handleChamferClick === 'function') {
                window.handleChamferClick(x, y);
            } else {
                console.error('chamfer-tool.js не загружен — window.handleChamferClick не определена');
            }
        }
        else if (currentTool === 'fillet') {
            // v4.61: Скругление угла — клик на пересечение двух линий или угол прямоугольника
            // Подход: прямоугольник → 4 линии → существующий код скругления для линий.
            // saveState вызывается ОДИН раз перед любой модификацией (захватывает исходный rect).
            const FILLET_TOL = 8; // мм — допуск поиска

            // v4.61 Phase 1: detect rect corner (БЕЗ модификации) — break из обоих циклов
            let rectToBreak = null;
            for (const obj of objects) {
                if (obj.type !== 'rect') continue;
                const corners = [
                    { x: obj.x, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y },
                    { x: obj.x + obj.width, y: obj.y + obj.height },
                    { x: obj.x, y: obj.y + obj.height }
                ];
                for (const c of corners) {
                    if (Math.hypot(c.x - x, c.y - y) < FILLET_TOL) {
                        rectToBreak = obj;
                        break;
                    }
                }
                if (rectToBreak) break;
            }

            // v4.61 Phase 1b: если нашли rect — saveState + разбиваем на 4 линии
            let savedStateForRect = false;
            if (rectToBreak) {
                saveState();             // ОДИН saveState — захватывает ИСХОДНЫЙ rect
                savedStateForRect = true;
                const obj = rectToBreak;
                const rectIdx = objects.indexOf(obj);
                if (rectIdx >= 0) objects.splice(rectIdx, 1);

                const lines = [
                    new Line(obj.x, obj.y, obj.x + obj.width, obj.y),                     // верх
                    new Line(obj.x + obj.width, obj.y, obj.x + obj.width, obj.y + obj.height), // право
                    new Line(obj.x + obj.width, obj.y + obj.height, obj.x, obj.y + obj.height), // низ
                    new Line(obj.x, obj.y + obj.height, obj.x, obj.y)                      // лево
                ];
                for (const l of lines) {
                    l.color = obj.color || '#00aadd';
                    objects.push(l);
                }

                // Если редактируем деталь — заменяем rect на линии в part.objects
                if (isEditingPart && editingPartId !== null) {
                    const part = parts.find(p => samePartId(p.id, editingPartId));
                    if (part) {
                        const pIdx = part.objects.indexOf(obj);
                        if (pIdx >= 0) part.objects.splice(pIdx, 1);
                        part.objects.push(...lines);
                        updatePartBounds(part);
                    }
                }
            }

            // Phase 2: находим все линии рядом с кликом
            const nearbyLines = [];
            for (const obj of objects) {
                if (obj.type !== 'line') continue;
                const d1 = Math.hypot(obj.x1 - x, obj.y1 - y);
                const d2 = Math.hypot(obj.x2 - x, obj.y2 - y);
                if (d1 < FILLET_TOL || d2 < FILLET_TOL) {
                    nearbyLines.push({ line: obj, d1, d2 });
                }
            }

            if (nearbyLines.length < 2) {
                alert('⚠️ Кликните на угол — точку пересечения двух линий или угол прямоугольника');
                return;  // если rect был разбит — undo вернёт его (saveState уже был)
            }

            // Находим пару линий с ближайшими концами к точке клика
            // v4.61: среди пар с совпадающими эндпоинтами (общий угол) выбираем
            // тот угол, который ближайший к клику (fix для маленьких rect <16мм,
            // где все 4 угла имеют d=0 и без tiebreaker'а выбирался бы первый).
            let bestPair = null;
            let bestScore = Infinity; // composite: endpoint_dist * 10000 + click_dist
            for (let i = 0; i < nearbyLines.length; i++) {
                for (let j = i + 1; j < nearbyLines.length; j++) {
                    const a = nearbyLines[i], b = nearbyLines[j];
                    const tests = [
                        { p1: 'x1', p2: 'x1', d: Math.hypot(a.line.x1 - b.line.x1, a.line.y1 - b.line.y1), sx: a.line.x1, sy: a.line.y1 },
                        { p1: 'x1', p2: 'x2', d: Math.hypot(a.line.x1 - b.line.x2, a.line.y1 - b.line.y2), sx: a.line.x1, sy: a.line.y1 },
                        { p1: 'x2', p2: 'x1', d: Math.hypot(a.line.x2 - b.line.x1, a.line.y2 - b.line.y1), sx: a.line.x2, sy: a.line.y2 },
                        { p1: 'x2', p2: 'x2', d: Math.hypot(a.line.x2 - b.line.x2, a.line.y2 - b.line.y2), sx: a.line.x2, sy: a.line.y2 },
                    ];
                    for (const t of tests) {
                        if (t.d > FILLET_TOL * 2) continue; // эндпоинты слишком далеко — не общий угол
                        const clickDist = Math.hypot(t.sx - x, t.sy - y);
                        const score = t.d * 10000 + clickDist; // t.d доминирует, clickDist ломает ничью
                        if (score < bestScore) {
                            bestScore = score;
                            bestPair = { lineA: a.line, lineB: b.line, endA: t.p1, endB: t.p2 };
                        }
                    }
                }
            }

            if (!bestPair) {
                alert('⚠️ Не найден угол рядом с кликом');
                return;
            }

            const cornerX = bestPair.endA === 'x1' ? bestPair.lineA.x1 : bestPair.lineA.x2;
            const cornerY = bestPair.endA === 'x1' ? bestPair.lineA.y1 : bestPair.lineA.y2;

            const aOtherX = bestPair.endA === 'x1' ? bestPair.lineA.x2 : bestPair.lineA.x1;
            const aOtherY = bestPair.endA === 'x1' ? bestPair.lineA.y2 : bestPair.lineA.y1;
            const bOtherX = bestPair.endB === 'x1' ? bestPair.lineB.x2 : bestPair.lineB.x1;
            const bOtherY = bestPair.endB === 'x1' ? bestPair.lineB.y2 : bestPair.lineB.y1;

            const dirAX = aOtherX - cornerX, dirAY = aOtherY - cornerY;
            const dirBX = bOtherX - cornerX, dirBY = bOtherY - cornerY;
            const lenA = Math.hypot(dirAX, dirAY);
            const lenB = Math.hypot(dirBX, dirBY);
            if (lenA < 0.001 || lenB < 0.001) return;
            const uaX = dirAX / lenA, uaY = dirAY / lenA;
            const ubX = dirBX / lenB, ubY = dirBY / lenB;

            // v4.61: Проверку параллельности делаем ДО prompt и ДО saveState
            const dot = uaX * ubX + uaY * ubY;
            const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
            if (angle < 0.01 || Math.abs(angle - Math.PI) < 0.01) {
                alert('⚠️ Линии параллельны — скругление невозможно');
                return;
            }

            const lastFilletRadius = localStorage.getItem('lastFilletRadius') || '5';
            const radiusStr = prompt('Радиус скругления (мм):', lastFilletRadius);
            if (!radiusStr) return;  // если rect был разбит — undo вернёт его
            const radius = parseFloat(radiusStr);
            if (!radius || radius <= 0) { alert('⚠️ Радиус должен быть положительным'); return; }
            // v4.61: проверяем, что радиус не превышает половину длины каждой стороны
            if (radius > lenA / 2 || radius > lenB / 2) {
                const maxR = Math.min(lenA, lenB) / 2;
                alert(`⚠️ Радиус слишком большой (макс ${maxR.toFixed(1)}мм)`);
                return;
            }
            localStorage.setItem('lastFilletRadius', String(radius));

            // v4.61: saveState только если ещё не сохраняли (rect-вариант уже сохранил)
            if (!savedStateForRect) saveState();

            const tanLen = radius / Math.tan(angle / 2);
            const tanAX = cornerX + uaX * tanLen;
            const tanAY = cornerY + uaY * tanLen;
            const tanBX = cornerX + ubX * tanLen;
            const tanBY = cornerY + ubY * tanLen;

            const bisX = uaX + ubX, bisY = uaY + ubY;
            const bisLen = Math.hypot(bisX, bisY);
            if (bisLen < 0.001) return;
            const distToCenter = radius / Math.sin(angle / 2);
            const cx = cornerX + (bisX / bisLen) * distToCenter;
            const cy = cornerY + (bisY / bisLen) * distToCenter;

            let startAngle = Math.atan2(tanAY - cy, tanAX - cx);
            let endAngle = Math.atan2(tanBY - cy, tanBX - cx);
            const cross = uaX * ubY - uaY * ubX;
            const direction = cross > 0 ? 'CW' : 'CCW';

            if (bestPair.endA === 'x1') { bestPair.lineA.x1 = tanAX; bestPair.lineA.y1 = tanAY; }
            else { bestPair.lineA.x2 = tanAX; bestPair.lineA.y2 = tanAY; }
            if (bestPair.endB === 'x1') { bestPair.lineB.x1 = tanBX; bestPair.lineB.y1 = tanBY; }
            else { bestPair.lineB.x2 = tanBX; bestPair.lineB.y2 = tanBY; }

            const arc = new Arc(cx, cy, radius, startAngle, endAngle, direction);
            arc.id = Date.now() + Math.random();
            // v4.61: сохраняем цвет линий (для rect-варианта — цвет rect'а)
            arc.color = bestPair.lineA.color || '#00aadd';
            objects.push(arc);

            if (isEditingPart && editingPartId !== null) {
                const part = parts.find(p => samePartId(p.id, editingPartId));
                if (part) { part.objects.push(arc); updatePartBounds(part); }
            }
            render();
        }
    }
});

// ═══════════════════════════════════════════════════════════════
// 5. WINDOW.MOUSEMOVE — панорамирование листа + диагональный паттерн
// ═══════════════════════════════════════════════════════════════
window.addEventListener('mousemove', (e) => {
    if (isSheetPanning) {
        const dx = e.clientX - sheetPanStart.x;
        const dy = e.clientY - sheetPanStart.y;
        sheetPanX += dx;
        sheetPanY += dy;
        sheetPanStart = { x: e.clientX, y: e.clientY };
        render();
    }

    if (appState.diagonalPatternDragging && appState.diagonalLayoutEnabled && appState.diagonalPatternStartPoint && showSheetView) {
        const rect = canvas.getBoundingClientRect();
        const { x: sheetX, y: sheetY, w: sheetW, h: sheetH, scaleX, scaleY } = getSheetGeometry();

        appState.diagonalPatternEndPoint = {
            x: (e.clientX - rect.left - sheetX) / scaleX,
            y: (e.clientY - rect.top - sheetY) / scaleY
        };
        render();
    }

    // v4.80: Pattern drag-режим — обновление endPoint и авто-count
    if (appState.rectPatternDragging && appState.rectPatternStartPoint) {
        const rect = canvas.getBoundingClientRect();
        let mx, my;
        if (appState.rectPatternIsSheetMode && typeof showSheetView !== 'undefined' && showSheetView) {
            const { x: sheetX, y: sheetY, scaleX, scaleY } = getSheetGeometry();
            mx = (e.clientX - rect.left - sheetX) / scaleX;
            my = (e.clientY - rect.top - sheetY) / scaleY;
        } else {
            mx = (e.clientX - rect.left - canvas.width / 2 - panX) / zoom;
            my = (e.clientY - rect.top - canvas.height / 2 - panY) / zoom;
        }
        appState.rectPatternEndPoint = { x: mx, y: my };
        // v2.9: stepX/stepY вычисляются из (endPoint - startPoint) / (cols-1, rows-1)
        // → крайние объекты на углах пунктирного прямоугольника
        const count = appState.rectPatternCount || 4;
        let cols = Math.ceil(Math.sqrt(count));
        let rows = Math.ceil(count / cols);
        while (cols * (rows - 1) >= count && rows > 1) rows--;
        const dx = mx - appState.rectPatternStartPoint.x;
        const dy = my - appState.rectPatternStartPoint.y;
        appState.rectPatternStepX = cols > 1 ? dx / (cols - 1) : 0;
        appState.rectPatternStepY = rows > 1 ? dy / (rows - 1) : 0;
        render();
    }

    if (appState.circPatternDragging && appState.circPatternCenter) {
        const rect = canvas.getBoundingClientRect();
        let mx, my;
        if (appState.circPatternIsSheetMode && typeof showSheetView !== 'undefined' && showSheetView) {
            const { x: sheetX, y: sheetY, scaleX, scaleY } = getSheetGeometry();
            mx = (e.clientX - rect.left - sheetX) / scaleX;
            my = (e.clientY - rect.top - sheetY) / scaleY;
        } else {
            mx = (e.clientX - rect.left - canvas.width / 2 - panX) / zoom;
            my = (e.clientY - rect.top - canvas.height / 2 - panY) / zoom;
        }
        appState.circPatternEndPoint = { x: mx, y: my };
        // v2.6: radius = расстояние от центра до курсора (растягивание круга)
        // startAngle = направление от центра к курсору (где начнётся копирование)
        const dx = mx - appState.circPatternCenter.x;
        const dy = my - appState.circPatternCenter.y;
        appState.circPatternRadius = Math.hypot(dx, dy);
        if (appState.circPatternRadius > 1) {
            appState.circPatternStartAngle = Math.atan2(dy, dx);
        }
        render();
    }
});

// ═══════════════════════════════════════════════════════════════
// 6. CANVAS.MOUSEMOVE — ИСПРАВЛЕННАЯ ЛОГИКА КУРСОРА
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ДЛЯ ПРОВЕРКИ ВЫХОДА КУРСОРА ИЗ CANVAS
// ═══════════════════════════════════════════════════════════════
let lastMouseWasOnCanvas = false;
let lineToolFrozen = false; // Флаг: линия заморожена при выходе в сайдбар

window.addEventListener('mousemove', (e) => {
    // Проверяем выход курсора из canvas в сайдбары при рисовании линии
    if (currentTool === 'line' && isDrawing && startPoint) {
        const canvasRect = canvas.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        // Проверяем, внутри ли canvas
        const onCanvas = (mouseX >= canvasRect.left && mouseX <= canvasRect.right &&
                         mouseY >= canvasRect.top && mouseY <= canvasRect.bottom);
        
        // Получаем размеры панелей
        const toolbar = document.getElementById('toolbar');
        const propertiesPanel = document.getElementById('propertiesPanel');
        
        let inToolbar = false;
        let inPropertiesPanel = false;
        
        if (toolbar) {
            const toolbarRect = toolbar.getBoundingClientRect();
            inToolbar = (mouseX >= toolbarRect.left && mouseX <= toolbarRect.right &&
                        mouseY >= toolbarRect.top && mouseY <= toolbarRect.bottom);
        }
        
        if (propertiesPanel) {
            const panelRect = propertiesPanel.getBoundingClientRect();
            inPropertiesPanel = (mouseX >= panelRect.left && mouseX <= panelRect.right &&
                                mouseY >= panelRect.top && mouseY <= panelRect.bottom);
        }
        
        // Если курсор ушел с canvas в сайдбары — замораживаем линию
        if (!onCanvas && (inToolbar || inPropertiesPanel)) {
            // Проверяем, что мы только что вышли из canvas
            if (lastMouseWasOnCanvas && !lineToolFrozen) {
                lineToolFrozen = true;
                console.log('[LINE TOOL] Курсор вышел в сайдбар, линия обрывается');
                
                // Полностью сбрасываем состояние рисования
                currentShape = null;
                startPoint = null;
                snapPoint = null;
                lineSnapConstraint = null;
                isDrawing = false;
                if (typeof shapeInputStage !== 'undefined') shapeInputStage = 0;
                
                // Скрываем UI элементы
                if (lineDimensionInput) {
                    lineDimensionInput.style.display = 'none';
                    lineDimensionInput.value = '';
                }
                if (dimensionLabel) dimensionLabel.style.display = 'none';
                render();
            }
        } else {
            // Возврат на canvas — сбрасываем флаг заморозки
            if (onCanvas) {
                if (lineToolFrozen) {
                    lineToolFrozen = false;
                    console.log('[LINE TOOL] Курсор вернулся на canvas, нужно новый клик для начала линии');
                }
            }
        }
        
        lastMouseWasOnCanvas = onCanvas;
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isSheetPanning) return;
    const rect = canvas.getBoundingClientRect();

    // ПЕРЕТАСКИВАНИЕ ЛИНИИ ОБРЕЗКИ
    if (appState.isDraggingCutLine) {
        const currentSheetForDrag = appState.allSheets && appState.allSheets.length > 0
            ? appState.allSheets[appState.currentSheetIndex || 0] : null;
        const dragCutLine = currentSheetForDrag ? currentSheetForDrag.cutRemnantLine : appState.cutRemnantLine;

        if (dragCutLine !== null) {
            const { x: sheetX, y: sheetY, w: sheetW, h: sheetH, scaleY } = getSheetGeometry();

            dragCutLine.y = Math.max(0, Math.min(sheetSize.height, (e.clientY - rect.top - sheetY) / scaleY));
            render();
            e.stopImmediatePropagation();
            return;
        }
    }

    let x = (e.clientX - rect.left - canvas.width / 2 - panX) / zoom;
    let y = (e.clientY - rect.top - canvas.height / 2 - panY) / zoom;

    appState.lastMouseX = e.clientX - rect.left;
    appState.lastMouseY = e.clientY - rect.top;

    // v1.0: Mirror — обновляем предпросмотр линии отражения
    if (window.mirrorMode && typeof window.handleMirrorMouseMove === 'function') {
        window.handleMirrorMouseMove(x, y);
    }

    // v4.56: Линейка — обновляем live preview при движении мыши
    if (showSheetView && window.RulerTool && window.RulerTool.isActive()) {
        window.RulerTool.handleMove(0, 0, e);
    }

    // ВЫДЕЛЕНИЕ РАМКОЙ НА ЛИСТЕ
    if (showSheetView && isSheetSelecting && nestedParts.length > 0) {
        const { x: sheetX, y: sheetY, w: sheetW, h: sheetH, scaleX, scaleY } = getSheetGeometry();

        const currentMouseX = (e.clientX - rect.left - sheetX) / scaleX;
        const currentMouseY = (e.clientY - rect.top - sheetY) / scaleY;

        sheetSelectEnd = { x: currentMouseX, y: currentMouseY };
        const minX = Math.min(sheetSelectStart.x, sheetSelectEnd.x);
        const maxX = Math.max(sheetSelectStart.x, sheetSelectEnd.x);
        const minY = Math.min(sheetSelectStart.y, sheetSelectEnd.y);
        const maxY = Math.max(sheetSelectStart.y, sheetSelectEnd.y);

        const newSelection = [];
        for (let i = 0; i < nestedParts.length; i++) {
            const part = nestedParts[i];
            if (part.x < maxX && part.x + part.width > minX &&
                part.y < maxY && part.y + part.height > minY) {
                newSelection.push(i);
            }
        }
        selectedNestedParts = newSelection;
        appState.selectedNestedParts = selectedNestedParts;
        document.getElementById('nestedPartTools').style.display = showSheetView ? 'block' : 'none';
        render();
        return;
    }

    // Координаты для отображения: Y инвертирован (CAD-style: вверх = +Y)
    const displayX = Math.round(x);
    const displayY = Math.round(-y);

// v4.60: Если перетаскиваем объект — показываем дельту смещения от старта
    if (isDragging && selectedObjects.length > 0 && !clickedOnSheet && initialObjectPositions.length > 0) {
        const mouseDx = x - dragStartPos.x;
        const mouseDy = y - dragStartPos.y;  // canvas Y, но дисплей Y-up → инвертируем
        // v4.97: При Shift показываем ортогональное смещение
        let dispDx = Math.round(mouseDx);
        let dispDy = Math.round(-mouseDy);
        if (e.shiftKey) {
            if (Math.abs(mouseDx) >= Math.abs(mouseDy)) {
                dispDy = 0;
            } else {
                dispDx = 0;
            }
        }
        document.getElementById('coords').textContent = `ΔX: ${dispDx > 0 ? '+' : ''}${dispDx}, ΔY: ${dispDy > 0 ? '+' : ''}${dispDy} мм`;
    } else {
        document.getElementById('coords').textContent = `X: ${displayX}, Y: ${displayY}`;
    }

    // =================================================================
    // ЕДИНАЯ ЛОГИКА УПРАВЛЕНИЯ КУРСОРОМ (ИСПРАВЛЕНО)
    // =================================================================
    
    const currentSheetForCursor = appState.allSheets && appState.allSheets.length > 0
        ? appState.allSheets[appState.currentSheetIndex || 0] : null;
    const cursorCutLine = currentSheetForCursor ? currentSheetForCursor.cutRemnantLine : appState.cutRemnantLine;
    const cursorShowCutLine = currentSheetForCursor ? currentSheetForCursor.showCutRemnantLine : appState.showCutRemnantLine;

    if (showSheetView && cursorShowCutLine && cursorCutLine !== null && !isDragging && !isDrawing && currentTool === 'select') {
        const { x: sheetX, y: sheetY, w: sheetW, h: sheetH, scaleY } = getSheetGeometry();

        const mouseSheetY = (e.clientY - rect.top - sheetY) / scaleY;
        if (Math.abs(mouseSheetY - cursorCutLine.y) < CUT_LINE_TOLERANCE / scaleY) {
            canvas.style.cursor = 'ns-resize';
        } else {
            canvas.style.cursor = 'default';
        }
    }
    else if (currentTool === 'select') {
        const dimHit = findDimensionAtPoint(x, y);
        if (dimHit) {
            canvas.style.cursor = 'ns-resize';
        } else {
            const objPoint = findObjectPoint(x, y);
            if (objPoint) {
                canvas.style.cursor = 'crosshair';
            } else {
                let hoverObject = null;
                for (let i = objects.length - 1; i >= 0; i--) {
                    if (objects[i] && typeof objects[i].contains === 'function' && objects[i].contains(x, y)) { 
                        hoverObject = objects[i]; 
                        break; 
                    }
                }
                canvas.style.cursor = hoverObject ? 'move' : 'default';
            }
        }
    }
    else if (currentTool === 'eraser') {
        canvas.style.cursor = 'cell';
    }
    else if (['line', 'circle', 'rect', 'polygon', 'dimension', 'angle', 'text', 'microjoint', 'fillet', 'chamfer'].includes(currentTool)) {
        canvas.style.cursor = 'crosshair';
    }
    else if (!isDragging && !isPanning && !isSelecting) {
        canvas.style.cursor = 'default';
    }

    // Подсветка точки при наведении (с троттлингом через requestAnimationFrame)
    if (!draggedPoint && !isDragging) {
        if (currentTool === 'select' && !isDrawing) {
            const newHovered = findObjectPoint(x, y);
            if (newHovered !== hoveredPoint) {
                hoveredPoint = newHovered;
                if (!appState._hoverRafPending) {
                    appState._hoverRafPending = true;
                    requestAnimationFrame(() => {
                        appState._hoverRafPending = false;
                        render();
                    });
                }
            }
        } else if (['dimension', 'line', 'circle', 'rect'].includes(currentTool)) {
            const newHovered = findObjectPoint(x, y);
            if (newHovered !== hoveredPoint) {
                hoveredPoint = newHovered;
                if (!appState._hoverRafPending) {
                    appState._hoverRafPending = true;
                    requestAnimationFrame(() => {
                        appState._hoverRafPending = false;
                        render();
                    });
                }
            }
        }
    }

    if (currentTool === 'angle') {
        const newAngleHovered = findObjectPoint(x, y);
        if (newAngleHovered !== angleHoveredPoint) {
            angleHoveredPoint = newAngleHovered;
            if (!appState._hoverRafPending) {
                appState._hoverRafPending = true;
                requestAnimationFrame(() => {
                    appState._hoverRafPending = false;
                    render();
                });
            }
        }
    }

    // Перетаскивание деталей на листе
    if (showSheetView && isDraggingNested && selectedNestedParts.length > 0) {
        const { x: sheetX, y: sheetY, w: sheetW, h: sheetH, scaleX, scaleY } = getSheetGeometry();

        const mouseSheetX = (e.clientX - rect.left - sheetX) / scaleX;
        const mouseSheetY = (e.clientY - rect.top - sheetY) / scaleY;

        // v4.70: Находим dragOffset для детали под курсором (mouseOffsetX/Y != 0).
        // Раньше брался последний элемент selectedNestedParts — мог быть не та деталь.
        // Все детали двигаются на одинаковую delta, вычисленную по детали под курсором.
        const dragOffset = nestedDragOffsets.find(o => o.mouseOffsetX !== 0 || o.mouseOffsetY !== 0)
                        || nestedDragOffsets[0];

        if (dragOffset) {
            // Вычисляем новую позицию только для детали под курсором
            const newDraggedX = mouseSheetX - dragOffset.mouseOffsetX;
            const newDraggedY = mouseSheetY - dragOffset.mouseOffsetY;
            // Delta = смещение от начальной позиции — применяется ко ВСЕМ деталям одинаково
            const deltaX = newDraggedX - dragOffset.startX;
            const deltaY = newDraggedY - dragOffset.startY;
            const overlapAllowed = (appState.allowOverlap === true);
            let canMove = true;
            const movingDetails = [];

            nestedDragOffsets.forEach((offset) => {
                const nested = nestedParts[offset.index];
                if (nested) {
                    const newX = offset.startX + deltaX;
                    const newY = offset.startY + deltaY;
                    if (!overlapAllowed && (newX < 0 || newY < 0 || newX + nested.width > sheetSize.width || newY + nested.height > sheetSize.height)) {
                        canMove = false; return;
                    }
                    movingDetails.push({ nested, newX, newY, oldX: nested.x, oldY: nested.y });
                }
            });
 
            if (canMove && !overlapAllowed) {
                const selectedIndices = new Set(selectedNestedParts);
                for (const moving of movingDetails) {
                    const nested = moving.nested;
                    const movingIdx = nestedParts.indexOf(nested);
                    for (let i = 0; i < nestedParts.length; i++) {
                        const other = nestedParts[i];
                        if (i === movingIdx || selectedIndices.has(i)) continue;
                        const part = parts.find(p => samePartId(p.id, nested.partId));
                        const gap = (part && typeof part.spacing === 'number') ? part.spacing : 3;
                        if (!(moving.newX + nested.width + gap < other.x ||
                              other.x + other.width + gap < moving.newX ||
                              moving.newY + nested.height + gap < other.y ||
                              other.y + other.height + gap < moving.newY)) {
                            canMove = false; break;
                        }
                    }
                    if (!canMove) break;
                }
            }

            if (canMove) {
                movingDetails.forEach(moving => {
                    const nested = moving.nested;
                    const dx = moving.newX - nested.x;
                    const dy = moving.newY - nested.y;
                    nested.x = moving.newX;
                    nested.y = moving.newY;
                    // v4.37 FIX M1: обновляем ВСЕ геометрические поля, не только polygon.
                    // Раньше outline и objects оставались в старой позиции → коллизионная
                    // геометрия (через computePositionedPolygons) и отрисовка контуров
                    // рассинхронизировались с polygon. Эталон — createDiagonalPattern
                    // (строка 1607-1609) правильно обновляет outline.
                    if (nested.polygon && nested.polygon.length > 0) {
                        nested.polygon = nested.polygon.map(p => ({ x: p.x + dx, y: p.y + dy }));
                    }
                    if (nested.outline && nested.outline.length > 0) {
                        nested.outline = nested.outline.map(poly =>
                            poly.map(p => ({ x: p.x + dx, y: p.y + dy }))
                        );
                    }
                    // objects — это исходная геометрия детали (в part-local координатах),
                    // она НЕ привязана к позиции на листе, поэтому не сдвигается.
                    // Но если objects хранят sheet-координаты (microjoint/lead-in маркеры),
                    // их нужно сдвинуть. Проверяем по флагу _sheetCoords.
                    if (nested.objects && nested.objects._sheetCoords) {
                        nested.objects = nested.objects.map(o => {
                            const copy = { ...o };
                            if (typeof copy.x === 'number') copy.x += dx;
                            if (typeof copy.y === 'number') copy.y += dy;
                            if (typeof copy.x1 === 'number') copy.x1 += dx;
                            if (typeof copy.y1 === 'number') copy.y1 += dy;
                            if (typeof copy.x2 === 'number') copy.x2 += dx;
                            if (typeof copy.y2 === 'number') copy.y2 += dy;
                            if (typeof copy.cx === 'number') copy.cx += dx;
                            if (typeof copy.cy === 'number') copy.cy += dy;
                            return copy;
                        });
                    }
                });
                render();
            }
        }
        return;
    }

    // Рисование разметки
    if (showSheetView && isDrawingRect) {
        const { x: sheetX, y: sheetY, w: sheetW, h: sheetH, scaleX, scaleY } = getSheetGeometry();

        const mouseSheetX = (e.clientX - rect.left - sheetX) / scaleX;
        const mouseSheetY = (e.clientY - rect.top - sheetY) / scaleY;

        if (currentMarkupMode === 'rect' && currentRect) {
            currentRect.width = mouseSheetX - currentRect.startX;
            currentRect.height = mouseSheetY - currentRect.startY;
        } else if (currentMarkupMode === 'circle' && currentCircle) {
            currentCircle.radius = Math.sqrt(Math.pow(mouseSheetX - currentCircle.cx, 2) + Math.pow(mouseSheetY - currentCircle.cy, 2));
        } else if (currentMarkupMode === 'polygon' && isDrawingMarkupPolygon) {
            appState.lastMarkupMouseX = mouseSheetX;
            appState.lastMarkupMouseY = mouseSheetY;
        }
        render();
        return;
    }

    // Панорамирование
    if (isPanning) {
        panX = e.clientX - panStart.x;
        panY = e.clientY - panStart.y;
        render();
        return;
    }

    // Перетаскивание размерной линии
    if (isDraggingDimension && draggedDimensionIndex >= 0) {
        const dim = dimensionLines[draggedDimensionIndex];
        let targetX = x - dimensionDragOffset.x;
        let targetY = y - dimensionDragOffset.y;
        if (snapEnabled && objects.length > 0) {
            const snap = findSnapPoint(targetX, targetY);
            if (snap) { targetX = snap.x; targetY = snap.y; }
        }
        const dx = dim.x2 - dim.x1, dy = dim.y2 - dim.y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            const ux = dx / len, uy = dy / len;
            dim.x1 = targetX - ux * len / 2; dim.y1 = targetY - uy * len / 2;
            dim.x2 = targetX + ux * len / 2; dim.y2 = targetY + uy * len / 2;
        }
        if (snapEnabled && objects.length > 0) {
            const snap = findSnapPoint(targetX, targetY);
            snapIndicator.style.display = snap ? 'block' : 'none';
            if (snap) { snapIndicator.style.left = e.clientX + 'px'; snapIndicator.style.top = (e.clientY - 10) + 'px'; }
        } else { snapIndicator.style.display = 'none'; }
        render();
        return;
    }

    // Обновление рамки выделения
    if (isSelecting) {
        selectEnd = { x, y };
        render();
    }

    // Режим размерной линии
    if (currentTool === 'dimension' && isDrawing && dimensionStartPoint) {
        let snappedX = x, snappedY = y;
        if (snapEnabled && objects.length > 0) {
            const snap = findSnapPoint(x, y);
            if (snap) { snappedX = snap.x; snappedY = snap.y; }
            else {
                const edgeHit = findEdgeAtPoint(x, y);
                if (edgeHit) {
                    const e = edgeHit.edge;
                    // Особая обработка для окружности круга
                    if (e.isCircle) {
                        snappedX = e.p1.x;
                        snappedY = e.p1.y;
                    } else {
                        const dx = e.p2.x - e.p1.x, dy = e.p2.y - e.p1.y;
                        const lenSq = dx * dx + dy * dy;
                        if (lenSq > 0) {
                            let t = ((x - e.p1.x) * dx + (y - e.p1.y) * dy) / lenSq;
                            t = Math.max(0, Math.min(1, t));
                            snappedX = e.p1.x + t * dx; snappedY = e.p1.y + t * dy;
                        } else { snappedX = e.midX; snappedY = e.midY; }
                    }
                }
            }
        }
        dimensionLabel.style.display = 'block';
        dimensionLabel.textContent = `Размер: ${Math.round(Math.sqrt(Math.pow(snappedX - dimensionStartPoint.x, 2) + Math.pow(snappedY - dimensionStartPoint.y, 2)))}`;
        dimensionLabel.style.left = e.clientX + 'px';
        dimensionLabel.style.top = (e.clientY - 10) + 'px';

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(dimensionStartPoint.x * zoom + canvas.width / 2 + panX, dimensionStartPoint.y * zoom + canvas.height / 2 + panY);
        ctx.lineTo(snappedX * zoom + canvas.width / 2 + panX, snappedY * zoom + canvas.height / 2 + panY);
        ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════════
    // РЕЖИМ МИКРОСТЫКА — обновление конца линии и запрос перерисовки
    // ═══════════════════════════════════════════════════════════════
    if (currentTool === 'microjoint' && appState.microjointEnabled) {
        if (appState.microjointIsDrawing && appState.microjointLineStart) {
            let endX = x, endY = y;

            // v1.0: Shift — ортогональность (горизонталь/вертикаль)
            if ((typeof orthoEnabled !== 'undefined' && orthoEnabled) || e.shiftKey) {
                const dx = Math.abs(x - appState.microjointLineStart.x);
                const dy = Math.abs(y - appState.microjointLineStart.y);
                if (dx > dy) {
                    endY = appState.microjointLineStart.y; // горизонталь
                } else {
                    endX = appState.microjointLineStart.x; // вертикаль
                }
            }

            appState.microjointLineEnd = { x: endX, y: endY };
            render();

        } else if (!appState.microjointIsDrawing) {
            canvas.style.cursor = 'crosshair';
        }
    }

    // Рисование линии с ортогональностью
    if (currentTool === 'line' && isDrawing && (orthoEnabled || e.shiftKey) && startPoint) {
        let snappedX = x, snappedY = y;
        if (snapEnabled && objects.length > 0) {
            const snap = findSnapPoint(x, y);
            if (snap) { snappedX = snap.x; snappedY = snap.y; }
        }
        const ortho = applyOrtho(startPoint.x, startPoint.y, snappedX, snappedY, e.shiftKey);
        ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(startPoint.x, startPoint.y); ctx.lineTo(ortho.x, ortho.y); ctx.stroke(); ctx.setLineDash([]);
        
        const angle = Math.atan2(ortho.y - startPoint.y, ortho.x - startPoint.x) * (180 / Math.PI);
        const canvasAngle = Math.round(angle >= 0 ? angle : angle + 360);
        const cadAngle = (360 - canvasAngle) % 360; // CAD-style: Y-up
        dimensionLabel.style.display = 'block';
        dimensionLabel.textContent = `Угол: ${cadAngle}° | Длина: ${Math.round(Math.sqrt(Math.pow(ortho.x - startPoint.x, 2) + Math.pow(ortho.y - startPoint.y, 2)))}`;
        dimensionLabel.style.left = (e.clientX + 5) + 'px'; dimensionLabel.style.top = (e.clientY - 10) + 'px'; 
    }

<<<<<<< HEAD
=======
    // v5.03: Масштабирование контура — тянем за точку, весь контур масштабируется
    if (isScalingContour && draggedPoint && scaleContourInitial && scaleContourCenter) {
        let mx = x, my = y;
        // Snapping для точки
        if (snapEnabled && objects.length > 0) {
            const closest = findSnapPoint(x, y, draggedPoint.obj);
            if (closest) { mx = closest.x; my = closest.y; }
        }
        const cx = scaleContourCenter.x, cy = scaleContourCenter.y;
        const curDist = Math.hypot(mx - cx, my - cy);
        let scale = curDist / scaleContourInitialDist;
        // Ограничение: не меньше 0.01
        if (scale < 0.01) scale = 0.01;
        // Применяем масштаб ко всем выделенным объектам
        for (const snap of scaleContourInitial) {
            _scaleObjectFromSnapshot(snap, cx, cy, scale);
        }
        // Обновляем draggedPoint.point на новую позицию
        const obj = draggedPoint.obj;
        if (obj.type === 'line') {
            if (draggedPoint.pointType === 'start') draggedPoint.point = { x: obj.x1, y: obj.y1 };
            else if (draggedPoint.pointType === 'end') draggedPoint.point = { x: obj.x2, y: obj.y2 };
        } else if (obj.type === 'circle' || obj.type === 'arc') {
            if (draggedPoint.pointType === 'edge') {
                // Точка на окружности — пересчитываем
                const pts = obj.getPoints();
                if (pts && pts.length > 1) draggedPoint.point = { x: pts[1].x, y: pts[1].y };
            }
        } else if (typeof obj.getPoints === 'function') {
            const pts = obj.getPoints();
            // Находим ближайшую точку к мыши
            let bestPt = pts[0], bestD = Infinity;
            for (const pt of pts) {
                const d = Math.hypot(pt.x - mx, pt.y - my);
                if (d < bestD) { bestD = d; bestPt = pt; }
            }
            if (bestPt) draggedPoint.point = { x: bestPt.x, y: bestPt.y };
        }
        // Показываем масштаб
        if (dimensionLabel) {
            dimensionLabel.style.display = 'block';
            const pct = Math.round(scale * 100);
            dimensionLabel.textContent = `Масштаб: ${pct}%`;
            dimensionLabel.style.left = (e.clientX + 15) + 'px';
            dimensionLabel.style.top = (e.clientY - 25) + 'px';
        }
        if (isEditingPart && editingPartId !== null) {
            const part = parts.find(p => samePartId(p.id, editingPartId));
            if (part) updatePartBounds(part);
        }
        render();
        return;
    }

>>>>>>> master
    // Перетаскивание конечной точки
    if (draggedPoint) {
        let snappedX = x, snappedY = y;
        if (snapEnabled && objects.length > 0) {
            const closest = findSnapPoint(x, y, draggedPoint.obj);
            if (closest) {
                snappedX = closest.x; snappedY = closest.y;
                snapIndicator.style.display = 'block';
                snapIndicator.style.left = e.clientX + 'px'; snapIndicator.style.top = (e.clientY - 10) + 'px';
            } else { snapIndicator.style.display = 'none'; }
        } else { snapIndicator.style.display = 'none'; }

        const obj = draggedPoint.obj;
        let draggedPointCoord = null;
        if (obj.type === 'line') {
            if (draggedPoint.pointType === 'start') draggedPointCoord = { x: obj.x1, y: obj.y1 };
            else if (draggedPoint.pointType === 'end') draggedPointCoord = { x: obj.x2, y: obj.y2 };
        }
        
        const connectedLines = [];
        if (draggedPointCoord && obj.type === 'line') {
            objects.forEach(line => {
                if (line.type === 'line') {
                    if (Math.abs(line.x1 - draggedPointCoord.x) < POINT_SNAP_TOLERANCE && Math.abs(line.y1 - draggedPointCoord.y) < POINT_SNAP_TOLERANCE) connectedLines.push({ line, pointType: 'start' });
                    else if (Math.abs(line.x2 - draggedPointCoord.x) < POINT_SNAP_TOLERANCE && Math.abs(line.y2 - draggedPointCoord.y) < POINT_SNAP_TOLERANCE) connectedLines.push({ line, pointType: 'end' });
                }
            });
        }
        
        if (obj.type === 'line') {
            if (draggedPoint.pointType === 'start') { obj.x1 = snappedX; obj.y1 = snappedY; }
            else if (draggedPoint.pointType === 'end') { obj.x2 = snappedX; obj.y2 = snappedY; }
            else if (draggedPoint.pointType === 'center') { const dx = snappedX - obj.center.x, dy = snappedY - obj.center.y; obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy; }
            connectedLines.forEach(item => {
                if (item.line !== obj) {
                    if (item.pointType === 'start') { item.line.x1 = snappedX; item.line.y1 = snappedY; }
                    else { item.line.x2 = snappedX; item.line.y2 = snappedY; }
                }
            });
        } else if (obj.type === 'circle') {
            if (draggedPoint.pointType === 'center') { obj.cx = snappedX; obj.cy = snappedY; }
            else if (draggedPoint.pointType === 'edge') { obj.radius = Math.sqrt(Math.pow(snappedX - obj.cx, 2) + Math.pow(snappedY - obj.cy, 2)); }
        } else if (obj.type === 'rect') {
            if (draggedPoint.pointType === 'center') { const dx = snappedX - obj.center.x, dy = snappedY - obj.center.y; obj.x += dx; obj.y += dy; }
            else if (draggedPoint.pointType === 'vertex') {
                const points = obj.getPoints();
                let cornerIdx = -1;
                for (let i = 0; i < 4; i++) { if (Math.abs(points[i].x - draggedPoint.point.x) < 0.1 && Math.abs(points[i].y - draggedPoint.point.y) < 0.1) { cornerIdx = i; break; } }
                // v4.66: Если угол не найден (координаты устарели) — ищем ближайший угол к мыши
                if (cornerIdx === -1) {
                    let minDist = Infinity;
                    for (let i = 0; i < 4; i++) {
                        const d = Math.hypot(points[i].x - snappedX, points[i].y - snappedY);
                        if (d < minDist) { minDist = d; cornerIdx = i; }
                    }
                }
                if (cornerIdx === 0) { obj.width = (obj.x + obj.width) - snappedX; obj.height = (obj.y + obj.height) - snappedY; obj.x = snappedX; obj.y = snappedY; }
                else if (cornerIdx === 1) { obj.width = snappedX - obj.x; obj.height = (obj.y + obj.height) - snappedY; obj.y = snappedY; }
                else if (cornerIdx === 2) { obj.width = snappedX - obj.x; obj.height = snappedY - obj.y; }
                else if (cornerIdx === 3) { obj.width = (obj.x + obj.width) - snappedX; obj.height = snappedY - obj.y; obj.x = snappedX; }
                if (obj.width < 0) { obj.x = obj.x + obj.width; obj.width = Math.abs(obj.width); }
                if (obj.height < 0) { obj.y = obj.y + obj.height; obj.height = Math.abs(obj.height); }
                // v4.66: Обновляем draggedPoint.point на новый угол — иначе при следующем
                // mousemove угол не найдётся (старые координаты) и resize прервётся.
                const newPoints = obj.getPoints();
                if (cornerIdx >= 0 && cornerIdx < 4) {
                    draggedPoint.point = { x: newPoints[cornerIdx].x, y: newPoints[cornerIdx].y };
                }
            } else if (draggedPoint.pointType === 'edge') {
                const edgeIndex = draggedPoint.edgeIndex || 0;
                if (edgeIndex === 0) { obj.width = (obj.x + obj.width) - snappedX; obj.x = snappedX; }
                else if (edgeIndex === 1) { obj.width = snappedX - obj.x; }
                else if (edgeIndex === 2) { obj.height = (obj.y + obj.height) - snappedY; obj.y = snappedY; }
                else if (edgeIndex === 3) { obj.height = snappedY - obj.y; }
                if (obj.width < 0) { obj.x = obj.x + obj.width; obj.width = Math.abs(obj.width); }
                if (obj.height < 0) { obj.y = obj.y + obj.height; obj.height = Math.abs(obj.height); }
            }
        } else if (obj.type === 'polygon') {
            if (draggedPoint.pointType === 'center') { obj.cx = snappedX; obj.cy = snappedY; }
            else if (draggedPoint.pointType === 'vertex') { obj.radius = Math.sqrt(Math.pow(snappedX - obj.cx, 2) + Math.pow(snappedY - obj.cy, 2)); }
        }
        
        if (isEditingPart && editingPartId !== null) {
            const part = parts.find(p => samePartId(p.id, editingPartId));
            if (part) updatePartBounds(part);
        }
        render();
        return;
    }

    // Проверка начала перетаскивания
    if (potentialDragObject && !isDragging) {
        if (Math.sqrt(Math.pow(x - dragStartPos.x, 2) + Math.pow(y - dragStartPos.y, 2)) >= DRAG_THRESHOLD) {
            isDragging = true; hasDragged = false;
            initialObjectPositions = selectedObjects.map(obj => ({ obj, positions: getInitialObjectPosition(obj) }));
        }
    }

    if (isDragging && selectedObjects.length > 0 && !clickedOnSheet) {
        const mouseDx = x - dragStartPos.x, mouseDy = y - dragStartPos.y;

        // v4.97: Ортогональное перетаскивание при зажатом Shift
        // Если Shift нажат — движение только по горизонтали или вертикали (доминирующая ось)
        let orthoDx = mouseDx, orthoDy = mouseDy;
        if (e.shiftKey) {
            if (Math.abs(mouseDx) >= Math.abs(mouseDy)) {
                orthoDy = 0; // только по X
            } else {
                orthoDx = 0; // только по Y
            }
        }

        let snapOffset = { x: 0, y: 0 };
        if (snapEnabled) {
            let closestSnap = null, minSnapDist = SNAP_DISTANCE;
            for (let initPos of initialObjectPositions) {
                const obj = initPos.obj; const positions = initPos.positions;
                restoreInitialObjectPosition(obj, positions);
                const points = obj.getPoints();
                for (let pt of points) {
                    const movedX = pt.x + orthoDx, movedY = pt.y + orthoDy;
                    if (Math.sqrt(Math.pow(0 - movedX, 2) + Math.pow(0 - movedY, 2)) < minSnapDist) {
                        minSnapDist = Math.sqrt(Math.pow(0 - movedX, 2) + Math.pow(0 - movedY, 2));
                        closestSnap = { dx: -movedX, dy: -movedY, snapPoint: { x: 0, y: 0 } };
                    }
                    for (let other of objects) {
                        if (selectedObjects.includes(other)) continue;
                        if (!other || typeof other.getPoints !== 'function') continue;
                        for (let otherPt of other.getPoints()) {
                            const dist = Math.sqrt(Math.pow(otherPt.x - movedX, 2) + Math.pow(otherPt.y - movedY, 2));
                            if (dist < minSnapDist) { minSnapDist = dist; closestSnap = { dx: otherPt.x - movedX, dy: otherPt.y - movedY, snapPoint: otherPt }; }
                        }
                    }
                }
            }
            if (closestSnap) {
                snapOffset.x = closestSnap.dx; snapOffset.y = closestSnap.dy;
                // v4.97: При ортогональном drag (Shift) снап тоже только по доминирующей оси
                if (e.shiftKey) {
                    if (orthoDy === 0) snapOffset.y = 0;
                    if (orthoDx === 0) snapOffset.x = 0;
                }
                snapIndicator.style.display = 'block'; snapIndicator.style.left = e.clientX + 'px'; snapIndicator.style.top = (e.clientY - 10) + 'px';
            } else { snapIndicator.style.display = 'none'; }
        } else { snapIndicator.style.display = 'none'; }

        for (let initPos of initialObjectPositions) {
            const obj = initPos.obj; restoreInitialObjectPosition(obj, initPos.positions);
            obj.move(orthoDx + snapOffset.x, orthoDy + snapOffset.y);
        }

        // v1.0: Пунктирные линии выравнивания (как в Компас-3D)
        // Если точка перетаскиваемого объекта совпадает по X или Y
        // с точкой другого объекта → показываем пунктирную линию
        window._alignmentGuides = [];  // сброс
        if (snapEnabled) {
            const ALIGN_TOL = 2; // мм — допуск совпадения
            for (const obj of selectedObjects) {
                if (!obj || typeof obj.getPoints !== 'function') continue;
                const pts = obj.getPoints();
                for (const pt of pts) {
                    for (const other of objects) {
                        if (!other || selectedObjects.includes(other)) continue;
                        if (typeof other.getPoints !== 'function') continue;
                        for (const opt of other.getPoints()) {
                            // Совпадение по X → вертикальная пунктирная линия
                            if (Math.abs(pt.x - opt.x) < ALIGN_TOL) {
                                window._alignmentGuides.push({ type: 'vertical', x: opt.x });
                            }
                            // Совпадение по Y → горизонтальная пунктирная линия
                            if (Math.abs(pt.y - opt.y) < ALIGN_TOL) {
                                window._alignmentGuides.push({ type: 'horizontal', y: opt.y });
                            }
                            // Совпадение по X и Y → точка (не нужна линия, snap сработает)
                        }
                    }
                }
            }
        }

        // v4.60: Показываем расстояния от центра окружности до ближайших объектов
        const _draggedCircle = selectedObjects.find(o => o.type === 'circle');
        if (_draggedCircle && typeof window.showCircleDistances === 'function') {
            window.showCircleDistances(_draggedCircle);
        }

        hasDragged = true;
        if (isEditingPart && editingPartId !== null) {
            const part = parts.find(p => samePartId(p.id, editingPartId));
            if (part) updatePartBounds(part);
        }
        render();
        return;
    }

    // Рисуем линию только если есть startPoint (не после выхода в сайдбар)
    if (isDrawing && currentShape && startPoint) {
        let snappedX = x, snappedY = y; snapPoint = null;
        // v4.88: Убрано условие objects.length > 0 — findSnapPoint работает на пустом холсте
        // (включает snap к origin (0,0) через слой 6).
        if (snapEnabled) {
            const closest = findSnapPoint(x, y, currentShape);
            if (closest) {
                snappedX = closest.x; snappedY = closest.y; snapPoint = closest;
                snapIndicator.style.display = 'block'; snapIndicator.style.left = e.clientX + 'px'; snapIndicator.style.top = (e.clientY - 10) + 'px';
            } else { snapIndicator.style.display = 'none'; }
        } else { snapIndicator.style.display = 'none'; }
        // v4.88: Дублирующий snap к (0,0) — fallback если findSnapPoint не нашёл (маловероятно, но оставляем).
        // Используем getEffectiveSnapDistance() и проверяем исходные x/y (не snappedX/Y).
        if (snapEnabled && !snapPoint) {
            const snapDist = (typeof window.getEffectiveSnapDistance === 'function') ? window.getEffectiveSnapDistance() : SNAP_DISTANCE;
            if (Math.sqrt(x * x + y * y) < snapDist) {
                snappedX = 0; snappedY = 0;
                snapPoint = { x: 0, y: 0, type: 'origin' };
                snapIndicator.style.display = 'block'; snapIndicator.style.left = e.clientX + 'px'; snapIndicator.style.top = (e.clientY - 10) + 'px';
            }
        }
        
        if (currentTool === 'line') {
            let finalX = snappedX, finalY = snappedY;
            if (snapEnabled) {
                // v4.48: Приоритет привязки к точке ВЫШЕ параллельности/перпендикулярности.
                // Раньше constraint перезаписывал snap point → нельзя было замкнуть линию.
                // Теперь: если есть snap point (привязка к точке) — constraint не применяется.
                // Constraint работает только когда нет привязки к точке.
                if (!snapPoint) {
                    const constraint = findAngleConstraintSnap(startPoint.x, startPoint.y, snappedX, snappedY, currentShape);
                    if (constraint) { finalX = constraint.x; finalY = constraint.y; lineSnapConstraint = constraint; }
                    else { lineSnapConstraint = null; }
                } else {
                    lineSnapConstraint = null;
                }
            } else { lineSnapConstraint = null; }
            if (orthoEnabled || e.shiftKey) {
                const ortho = applyOrtho(startPoint.x, startPoint.y, finalX, finalY, e.shiftKey);
                currentShape.x2 = ortho.x; currentShape.y2 = ortho.y; lineSnapConstraint = null;
            } else { currentShape.x2 = finalX; currentShape.y2 = finalY; }
            
            // Если уже введена длина (этап 1), сохраняем длину, меняем только угол
            if (shapeInputStage === 1) {
                const length = Math.sqrt(Math.pow(currentShape.x2 - startPoint.x, 2) + Math.pow(currentShape.y2 - startPoint.y, 2));
                if (length > 0) {
                    const angleRad = Math.atan2(currentShape.y2 - startPoint.y, currentShape.x2 - startPoint.x);
                    // Применяем ортогональность если включена
                    let finalAngle = angleRad;
                    if (orthoEnabled) {
                        const angleDeg = angleRad * 180 / Math.PI;
                        const orthoAngle = ORTHO_ANGLES.reduce((prev, curr) =>
                            Math.abs(curr - ((angleDeg % 360) + 360) % 360) < Math.abs(prev - ((angleDeg % 360) + 360) % 360) ? curr : prev
                        );
                        finalAngle = orthoAngle * Math.PI / 180;
                    }
                    currentShape.x2 = startPoint.x + Math.cos(finalAngle) * length;
                    currentShape.y2 = startPoint.y + Math.sin(finalAngle) * length;
                }
            }
                    
            const angleDeg = Math.atan2(currentShape.y2 - startPoint.y, currentShape.x2 - startPoint.x) * (180 / Math.PI);
            const canvasAngle = Math.round(angleDeg >= 0 ? angleDeg : angleDeg + 360);
            const cadAngle = (360 - canvasAngle) % 360; // CAD-style: Y-up = positive
            const lengthVal = parseFloat(currentShape.length.toFixed(2));
            if (lineDimensionInput) {
                lineDimensionInput.style.display = 'block';
                lineDimensionInput.style.left = (e.clientX + 5) + 'px';
                lineDimensionInput.style.top = (e.clientY + 5) + 'px';
                if (shapeInputStage === 0) {
                    lineDimensionInput.placeholder = `${lengthVal} мм | ${cadAngle}°`;
                }
            }
            if (dimensionLabel) dimensionLabel.style.display = 'none';
        } else if (currentTool === 'circle') {
            currentShape.radius = Math.sqrt(Math.pow(snappedX - startPoint.x, 2) + Math.pow(snappedY - startPoint.y, 2));
            if (lineDimensionInput) {
                lineDimensionInput.style.display = 'block';
                lineDimensionInput.style.left = (e.clientX + 5) + 'px';
                lineDimensionInput.style.top = (e.clientY + 5) + 'px';
                if (shapeInputStage === 0) {
                    lineDimensionInput.placeholder = `D: ${parseFloat((currentShape.radius * 2).toFixed(2))} мм | Enter`;
                }
            }
        } else if (currentTool === 'rect') {
            // v4.60: Если rectDrawMode='center' — startPoint = центр
            // Прямоугольник ВСЕГДА центрирован на точке клика (как в КОМПАС)
            if (typeof rectDrawMode !== 'undefined' && rectDrawMode === 'center') {
                const halfW = Math.abs(snappedX - startPoint.x);
                const halfH = Math.abs(snappedY - startPoint.y);
                currentShape.x = startPoint.x - halfW;  // top-left X = центр - половина
                currentShape.y = startPoint.y - halfH;  // top-left Y = центр - половина
                currentShape.width = halfW * 2;
                currentShape.height = halfH * 2;
            } else {
                currentShape.width = snappedX - startPoint.x;
                currentShape.height = snappedY - startPoint.y;
            }
            if (lineDimensionInput) {
                lineDimensionInput.style.display = 'block';
                lineDimensionInput.style.left = (e.clientX + 5) + 'px';
                lineDimensionInput.style.top = (e.clientY + 5) + 'px';
                if (shapeInputStage === 0) {
                    lineDimensionInput.placeholder = `${parseFloat(currentShape.absWidth.toFixed(2))} × ${parseFloat(currentShape.absHeight.toFixed(2))} мм | Enter`;
                }
            }
        } else if (currentTool === 'polygon') {
            currentShape.radius = Math.sqrt(Math.pow(snappedX - startPoint.x, 2) + Math.pow(snappedY - startPoint.y, 2));
            if (lineDimensionInput) {
                lineDimensionInput.style.display = 'block';
                lineDimensionInput.style.left = (e.clientX + 5) + 'px';
                lineDimensionInput.style.top = (e.clientY + 5) + 'px';
                if (shapeInputStage === 0) {
                    lineDimensionInput.placeholder = `R: ${parseFloat(currentShape.radius.toFixed(2))} мм | Enter`;
                }
            }
        } else if (currentTool === 'eraser') {
            currentShape.x2 = x;
            currentShape.y2 = y;
        }
        render();
    }
});

// ═══════════════════════════════════════════════════════════════
// ДИАГОНАЛЬНАЯ РАСКЛАДКА (Fusion 360 style pattern)
// ═══════════════════════════════════════════════════════════════
// v4.42: createDiagonalPattern теперь принимает МАССИВ sourceNested (группа) ИЛИ одиночную деталь.
// Для группы: startPoint = центр bbox группы. Каждая копия сохраняет относительную
// позицию деталей внутри группы. Копируется ВЕСЬ паттерн группы вдоль линии.
// ═══════════════════════════════════════════════════════════════
// v4.80: ПРИМЕНЕНИЕ ПАТТЕРНОВ (вызывается при клике в drag-режиме)
// ═══════════════════════════════════════════════════════════════

function applyRectPattern() {
    const sources = appState.rectPatternSources;
    const center = appState.rectPatternStartPoint;
    const count = appState.rectPatternCount || 4;
    const stepX = appState.rectPatternStepX || 50;
    const stepY = appState.rectPatternStepY || 50;
    const isSheet = appState.rectPatternIsSheetMode === true;
    // v2.9: groupCenter — центр выделения (для расчёта смещений объектов)
    const groupCenter = appState.rectPatternGroupCenter || center;

    if (!sources || sources.length === 0 || !center) {
        window.cancelPatternDragging();
        return;
    }

    let cols = Math.ceil(Math.sqrt(count));
    let rows = Math.ceil(count / cols);
    while (cols * (rows - 1) >= count && rows > 1) rows--;

    if (isSheet) {
        if (typeof window.createRectPatternOnSheet === 'function') {
            window.createRectPatternOnSheet(sources, center, cols, rows, stepX, stepY, groupCenter);
        }
    } else {
        if (typeof window.createRectPatternOnCanvas === 'function') {
            window.createRectPatternOnCanvas(sources, center, cols, rows, stepX, stepY, groupCenter);
        }
    }
    window.cancelPatternDragging();
}

function applyCircPattern() {
    const sources = appState.circPatternSources;
    const center = appState.circPatternCenter;
    const count = appState.circPatternCount || 6;
    const radius = appState.circPatternRadius || 50;
    // v2.3: arcAngle и startAngle из appState (задаются в prompt, не мышью)
    const arcAngleDeg = appState.circPatternArcAngle || 360;
    const startAngle = appState.circPatternStartAngle || 0;
    const isSheet = appState.circPatternIsSheetMode === true;

    if (!sources || sources.length === 0 || !center) {
        window.cancelPatternDragging();
        return;
    }

    if (isSheet) {
        if (typeof window.createCircularPatternOnSheet === 'function') {
            window.createCircularPatternOnSheet(sources, center, count, radius, arcAngleDeg, startAngle);
        }
    } else {
        if (typeof window.createCircularPatternOnCanvas === 'function') {
            window.createCircularPatternOnCanvas(sources, center, count, radius, arcAngleDeg, startAngle);
        }
    }
    window.cancelPatternDragging();
}

function createDiagonalPattern(count, sourceNested, startPoint, endPoint) {
    // Нормализуем: если передали одну деталь (не массив) — оборачиваем в массив
    const sources = Array.isArray(sourceNested) ? sourceNested : [sourceNested];
    if (!sources.length || count < 2) return;

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const newItems = [];
    const partsLookup = new Map();  // кеш parts по partId для производительности

    // v4.41: Размеры листа для проверки границ
    const sheetW = (typeof sheetSize !== 'undefined') ? sheetSize.width : 1250;
    const sheetH = (typeof sheetSize !== 'undefined') ? sheetSize.height : 2500;
    const edgeGap = 3;

    // Предзагружаем parts для всех уникальных partId
    for (const src of sources) {
        if (!partsLookup.has(src.partId)) {
            const part = (typeof parts !== 'undefined') ? parts.find(p => samePartId(p.id, src.partId)) : null;
            partsLookup.set(src.partId, part);
        }
    }

    // v4.42: для группы startPoint = центр группы. Вычисляем относительные
    // смещения каждой детали от центра группы (стабильные для всех копий).
    const relOffsets = sources.map(src => ({
        dx: (src.x + src.width / 2) - startPoint.x,
        dy: (src.y + src.height / 2) - startPoint.y
    }));

    for (let i = 1; i < count; i++) {
        const t = i / (count - 1);
        const groupCenterX = startPoint.x + dx * t;
        const groupCenterY = startPoint.y + dy * t;
        let groupSkipped = false;

        // Проверяем границы для ВСЕЙ группы
        for (let s = 0; s < sources.length; s++) {
            const src = sources[s];
            const centerX = groupCenterX + relOffsets[s].dx;
            const centerY = groupCenterY + relOffsets[s].dy;
            const halfW = src.width / 2;
            const halfH = src.height / 2;
            if (centerX - halfW < edgeGap || centerX + halfW > sheetW - edgeGap ||
                centerY - halfH < edgeGap || centerY + halfH > sheetH - edgeGap) {
                groupSkipped = true;
                break;
            }
        }
        if (groupSkipped) {
            console.warn(`📐 Группа #${i} пропущена — выходит за границы листа`);
            continue;
        }

        // Создаём копии всех деталей группы
        for (let s = 0; s < sources.length; s++) {
            const src = sources[s];
            const part = partsLookup.get(src.partId);

            // Центр копии = групповой центр + относительное смещение
            const centerX = groupCenterX + relOffsets[s].dx;
            const centerY = groupCenterY + relOffsets[s].dy;
            const offsetX = centerX - (src.x + src.width / 2);
            const offsetY = centerY - (src.y + src.height / 2);

            const copy = {
                partId: src.partId,
                name: part?.name,
                x: src.x + offsetX,
                y: src.y + offsetY,
                width: src.width,
                height: src.height,
                baseWidth: src.baseWidth || src.width,
                baseHeight: src.baseHeight || src.height,
                rotation: src.rotation,
                angle: src.angle,
                thickness: part?.thickness,
                material: part?.material,
                oneCutEnabled: part?.oneCutEnabled || false,
                polygon: src.polygon
                    ? src.polygon.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }))
                    : [],
                outline: src.outline
                    ? src.outline.map(poly => poly.map(p => ({ x: p.x + offsetX, y: p.y + offsetY })))
                    : [],
                refPoint: src.refPoint
                    ? { x: src.refPoint.x, y: src.refPoint.y }
                    : { x: 0, y: 0 },
                objects: src.objects && src.objects.length > 0
                    ? src.objects.map(o => ({ ...o }))
                    : undefined
            };
            nestedParts.push(copy);
            newItems.push(copy);
        }
    }

    if (appState.allSheets && appState.allSheets.length > 0 && appState.currentSheetIndex >= 0) {
        appState.allSheets[appState.currentSheetIndex].nestedParts = nestedParts.map(n => ({
            ...n,
            polygon: n.polygon ? n.polygon.map(p => ({ ...p })) : undefined,
            outline: n.outline ? n.outline.map(poly => poly.map(p => ({ ...p }))) : undefined,
            refPoint: n.refPoint ? { ...n.refPoint } : undefined,
            objects: n.objects ? n.objects.map(o => ({ ...o })) : undefined
        }));
    }

    if (typeof saveState === 'function') saveState();
    if (typeof window !== 'undefined' && typeof window.clearNestingCaches === 'function') {
        window.clearNestingCaches();
    }

    const skipped = (count - 1) - Math.ceil(newItems.length / sources.length);
    const skipMsg = skipped > 0 ? ` (${skipped} групп пропущено за границами листа)` : '';
    const groupMsg = sources.length > 1 ? ` группы из ${sources.length} деталей` : '';
    console.log(`📐 Диагональная раскладка: создано ${newItems.length} копий${groupMsg}${skipMsg} от "${startPoint.x.toFixed(0)},${startPoint.y.toFixed(0)}" до "${endPoint.x.toFixed(0)},${endPoint.y.toFixed(0)}"`);
}

// ═══════════════════════════════════════════════════════════════
// 7. CANVAS.MOUSEUP
// ═══════════════════════════════════════════════════════════════
canvas.addEventListener('mouseup', (e) => {
    clickedOnSheet = false;
    hoveredPoint = null;

    if (isDraggingDimension) {
        isDraggingDimension = false; draggedDimensionIndex = -1;
        snapIndicator.style.display = 'none'; render(); return;
    }
    if (isDraggingNested) {
        isDraggingNested = false; if (typeof saveToCache === 'function') saveToCache();
        if (appState.allSheets && appState.allSheets.length > 0 && appState.currentSheetIndex >= 0) {
            // v4.37 FIX M2: глубокое копирование polygon, outline, refPoint, objects.
            // Раньше outline и objects клонировались по ссылке (shallow) → при следующем
            // drag изменялась геометрия в allSheets некорректно. Теперь deep-copy всех
            // геометрических полей, как в createDiagonalPattern.
            appState.allSheets[appState.currentSheetIndex].nestedParts = nestedParts.map(n => ({
                ...n,
                polygon: n.polygon ? n.polygon.map(p => ({ ...p })) : undefined,
                outline: n.outline ? n.outline.map(poly => poly.map(p => ({ ...p }))) : undefined,
                refPoint: n.refPoint ? { ...n.refPoint } : undefined,
                objects: n.objects ? n.objects.map(o => ({ ...o })) : undefined
            }));
        }
        render(); updatePartsList(); return;
    }
    if (appState.isDraggingCutLine) {
        appState.isDraggingCutLine = false;
        const currentSheet = appState.allSheets && appState.allSheets.length > 0 ? appState.allSheets[appState.currentSheetIndex || 0] : null;
        if (currentSheet) {
            currentSheet.cutRemnantLine = appState.cutRemnantLine ? {...appState.cutRemnantLine} : null;
            currentSheet.showCutRemnantLine = appState.showCutRemnantLine;
        }
        appState.justFinishedCutLineDrag = true;
        setTimeout(() => { appState.justFinishedCutLineDrag = false; }, 300);
        render(); e.stopImmediatePropagation(); return;
    }
    if (showSheetView && isDrawingRect) {
        if (currentMarkupMode === 'rect' && currentRect) {
            const rect = {
                type: 'rect',
                x: currentRect.width < 0 ? currentRect.x + currentRect.width : currentRect.x,
                y: currentRect.height < 0 ? currentRect.y + currentRect.height : currentRect.y,
                width: Math.abs(currentRect.width), height: Math.abs(currentRect.height)
            };
            if (rect.width > MIN_MARKUP_SIZE && rect.height > MIN_MARKUP_SIZE) {
                markupRects.push(rect);
                appState.markupRects = markupRects;
                console.log('✅ Прямоугольник разметки создан: (' + rect.x.toFixed(0) + ',' + rect.y.toFixed(0) + ') ' + rect.width.toFixed(0) + '×' + rect.height.toFixed(0) + ' мм');
            }
            currentRect = null; appState.currentRect = null; render(); return;
        } else if (currentMarkupMode === 'circle' && currentCircle) {
            if (currentCircle.radius > MIN_MARKUP_CIRCLE_RADIUS) {
                markupRects.push({ type: 'circle', cx: currentCircle.cx, cy: currentCircle.cy, radius: currentCircle.radius });
                appState.markupRects = markupRects;
            }
            currentCircle = null; appState.currentCircle = null; render(); return;
        }
    }
    if (showSheetView && isSheetSelecting) { isSheetSelecting = false; render(); return; }
    if (isDragging) {
        isDragging = false; potentialDragObject = null; hasDragged = false; initialObjectPositions = [];
        // v4.60: Скрываем расстояния окружности
        if (typeof window.hideCircleDistances === 'function') window.hideCircleDistances();
        // v4.97: Очищаем линии выравнивания после завершения drag
        window._alignmentGuides = [];
    }
    // v1.0: Если НЕ было drag (просто клик) — сбрасываем potentialDragObject
    // Это позволяет: клик+отпуск = выбор, клик+удержание+движение = drag
    if (potentialDragObject && !isDragging) {
        potentialDragObject = null;
    }
    window._groupDragActive = false;
    if (isPanning) { isPanning = false; canvas.style.cursor = 'default'; return; }
    if (isSelecting) {
        const minX = Math.min(selectStart.x, selectEnd.x), maxX = Math.max(selectStart.x, selectEnd.x);
        const minY = Math.min(selectStart.y, selectEnd.y), maxY = Math.max(selectStart.y, selectEnd.y);
        
        // v5.02: Crossing selection — как в Компас-3D.
        // Объект выделяется, если рамка ПЕРЕСЕКАЕТ его (а не только если он полностью внутри).
        // Для линий: проверяем пересечение отрезка со сторонами прямоугольника.
        // Для кругов/дуг: проверяем попадание центра ИЛИ пересечение дуги со сторонами.
        // Для полигонов/полилиний: проверяем каждый сегмент.
        // Если хотя бы одна точка объекта внутри прямоугольника — тоже выбираем.
        
        // Если Shift зажат — убираем пересечённые объекты из выделения (deselect)
        const shiftSelect = isShiftPressed;
        
        objects.forEach(obj => {
            if (!obj) return;
            const intersects = objectIntersectsRect(obj, minX, minY, maxX, maxY);
            if (intersects) {
                if (shiftSelect) {
                    // Shift+рамка — убираем из выделения
                    const idx = selectedObjects.indexOf(obj);
                    if (idx >= 0) selectedObjects.splice(idx, 1);
                } else {
                    if (!selectedObjects.includes(obj)) selectedObjects.push(obj);
                }
            }
        });
        isSelecting = false; showProperties(selectedObjects.length === 1 ? selectedObjects[0] : null); render(); return;
    }
<<<<<<< HEAD
    if (draggedPoint) { draggedPoint = null; snapIndicator.style.display = 'none'; render(); return; }
=======
    if (draggedPoint) {
        // v5.03: Сброс режима масштабирования контура
        if (isScalingContour) {
            isScalingContour = false;
            scaleContourInitial = null;
            scaleContourCenter = null;
            scaleContourInitialDist = 0;
            if (dimensionLabel) dimensionLabel.style.display = 'none';
            if (typeof saveToCache === 'function') saveToCache();
        }
        draggedPoint = null; snapIndicator.style.display = 'none'; render(); return;
    }
>>>>>>> master

    // ЗАВЕРШЕНИЕ МИКРОСТЫКА — клик второй точкой
    if (currentTool === 'microjoint' && appState.microjointIsDrawing && appState.microjointLineStart) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - canvas.width / 2 - panX) / zoom;
        const y = (e.clientY - rect.top - canvas.height / 2 - panY) / zoom;
        
        const start = appState.microjointLineStart;
        const end = appState.microjointLineEnd || { x, y };
        const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
        
        console.log('[MICROJOINT] Завершение линии:', start.x.toFixed(1), start.y.toFixed(1), '→', end.x.toFixed(1), end.y.toFixed(1), 'длина:', length.toFixed(1));
        
        if (length > MIN_MICROJOINT_LENGTH) {
            console.log('[MICROJOINT] Линия завершена, длина:', length.toFixed(1));
            if (typeof appState.completeMicrojointLine === 'function') {
                appState.completeMicrojointLine(start, end);
            }
        } else {
            console.log('[MICROJOINT] Линия слишком короткая, отмена');
            appState.microjointIsDrawing = false;
            appState.microjointLineStart = null;
            appState.microjointLineEnd = null;
        }
        return;
    }

    // ЛАСТИК — умное стирание (v1.0: клик=trim, drag=erase)
    if (currentTool === 'eraser' && isDrawing && currentShape) {
        isDrawing = false;
        const eraserLine = currentShape;
        currentShape = null;
        dimensionLabel.style.display = 'none';

        // v4.97 FIX: x и y не были определены в mouseup — вычисляем заново
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - canvas.width / 2 - panX) / zoom;
        const y = (e.clientY - rect.top - canvas.height / 2 - panY) / zoom;

        // v1.0: Проверяем — был ли это клик (без движения) или drag
        const startPt = window._eraserStartPoint;
        const dragDist = startPt ? Math.hypot(x - startPt.x, y - startPt.y) : 999;
        window._eraserStartPoint = null;

        if (dragDist < 3) {
            // КЛИК (без движения) → Trim: обрезаем объект под курсором
            if (typeof window.trimObjectAtPoint === 'function') {
                let trimmed = false;
                for (const obj of objects) {
                    if (!obj) continue;
                    if (window.trimObjectAtPoint(obj, x, y)) {
                        trimmed = true;
                        console.log('✂️ [TRIM] Объект обрезан');
                        break;  // обрезаем только один объект за клик
                    }
                }
                if (!trimmed) {
                    // v4.97 FIX: Не удаляем объект целиком если trim не удался.
                    // Вместо этого просто ничего не делаем — пользователь может
                    // использовать drag-режим (протягивание) для удаления.
                    console.log('✂️ [TRIM] Нет пересечений для trim — объект не тронут');
                }
            }
            render();
            return;
        }

        // DRAG (протягивание) → Erase: удаляем пересечённые объекты
        const toErase = [];
        for (const obj of objects) {
            if (isObjectHitByEraser(obj, eraserLine, typeof getEffectiveEraserTolerance === 'function' ? getEffectiveEraserTolerance() : ERASER_TOLERANCE)) {
                toErase.push(obj);
            }
        }

        if (toErase.length > 0) {
            for (const obj of toErase) {
                // v4.97: Сначала пробуем smartEraseWithLine — разбивает rect/polygon
                // на отдельные линии, обрезая только пересечённые рёбра.
                // Если не получилось — удаляем объект целиком.
                const smartResult = (typeof smartEraseWithLine === 'function')
                    ? smartEraseWithLine(obj, eraserLine) : false;
                if (!smartResult) {
                    const idx = objects.indexOf(obj);
                    if (idx > -1) objects.splice(idx, 1);
                    if (isEditingPart && editingPartId !== null) {
                        const part = parts.find(p => samePartId(p.id, editingPartId));
                        if (part) {
                            const pidx = part.objects.indexOf(obj);
                            if (pidx > -1) part.objects.splice(pidx, 1);
                        }
                    } else {
                        const part = findPartForObject(obj);
                        if (part) {
                            part.objects = part.objects.filter(o => o !== obj);
                            updatePartBounds(part);
                        }
                    }
                }
            }
            if (isEditingPart && editingPartId !== null) {
                const part = parts.find(p => samePartId(p.id, editingPartId));
                if (part && part.objects.length > 0) updatePartBounds(part);
            }
        }
        render();
        return;
    }

    if (isDrawing && currentShape) {
        if (currentTool === 'line') return;
        // Для circle/rect/polygon фиксация только по второму клику (mousedown)
        if (currentTool === 'circle' || currentTool === 'rect' || currentTool === 'polygon') return;
        let valid = true;
        if (currentTool === 'line' && currentShape.length < 0.1) valid = false;
        if (currentTool === 'circle' && currentShape.radius < POINT_SNAP_TOLERANCE) valid = false;
        if (currentTool === 'rect' && (currentShape.absWidth < 1 || currentShape.absHeight < 1)) valid = false;
        if (currentTool === 'polygon' && currentShape.radius < POINT_SNAP_TOLERANCE) valid = false;
        if (valid) {
            saveState(); objects.push(currentShape); selectedObjects.length = 0; selectedObjects.push(currentShape);
            if (isEditingPart && editingPartId !== null) {
                const part = parts.find(p => samePartId(p.id, editingPartId));
                if (part) { part.objects.push(currentShape); updatePartBounds(part); }
            }
            showProperties(selectedObjects[0]);
        }
        isDrawing = false; currentShape = null; snapPoint = null;
        snapIndicator.style.display = 'none';
        // Скрываем input размеров
        if (typeof lineDimensionInput !== 'undefined' && lineDimensionInput) {
            lineDimensionInput.style.display = 'none';
            lineDimensionInput.value = '';
        }
        if (typeof shapeInputStage !== 'undefined') shapeInputStage = 0;
        render();
    }
    isDragging = false;
});

// ═══════════════════════════════════════════════════════════════
// 7.5. ДВОЙНОЙ КЛИК НА ЛИСТЕ — ПОВОРОТ ДЕТАЛИ НА 90°
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// v4.97: Двойной клик в режиме холста — выделить весь связанный контур
// ═══════════════════════════════════════════════════════════════
canvas.addEventListener('dblclick', (e) => {
    if (showSheetView) return; // sheet view обрабатывается ниже
    if (typeof currentTool !== 'undefined' && currentTool !== 'select') return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - canvas.width / 2 - panX) / zoom;
    const y = (e.clientY - rect.top - canvas.height / 2 - panY) / zoom;

    // Находим объект под курсором
    let clickedObject = null;
    for (let i = objects.length - 1; i >= 0; i--) {
        if (objects[i] && typeof objects[i].contains === 'function' && objects[i].contains(x, y)) {
            clickedObject = objects[i];
            break;
        }
    }
    if (!clickedObject) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    // Если объект не линия/арка — просто выделяем его
    if (clickedObject.type !== 'line' && clickedObject.type !== 'arc') {
        selectedObjects.length = 0;
        selectedObjects.push(clickedObject);
        if (typeof showProperties === 'function') showProperties(clickedObject);
        render();
        return;
    }

    // v4.97: Находим весь связанный контур (линии и арки с общими концами)
    const TOL = 0.5; // допуск сопоставления вершин (мм)
    const contour = findConnectedContour(clickedObject, TOL);

    selectedObjects.length = 0;
    for (const obj of contour) selectedObjects.push(obj);
    if (typeof showProperties === 'function') {
        showProperties(selectedObjects.length === 1 ? selectedObjects[0] : null);
    }
    render();
});

/**
 * v4.97: Находит все линии и арки, связанные с obj через общие концы.
 * BFS: начиная от obj, ищем все объекты, у которых концы совпадают.
 * @param {Object} startObj — начальный объект (line или arc)
 * @param {number} tol — допуск сопоставления (мм)
 * @returns {Array} массив связанных объектов
 */
function findConnectedContour(startObj, tol) {
    const result = [startObj];
    const visited = new Set([startObj]);
    const queue = [startObj];

    // Получаем концы объекта
    function getEnds(obj) {
        if (obj.type === 'line') {
            return [{x: obj.x1, y: obj.y1}, {x: obj.x2, y: obj.y2}];
        }
        if (obj.type === 'arc' && typeof obj.getStartPoint === 'function') {
            return [obj.getStartPoint(), obj.getEndPoint()];
        }
        return [];
    }

    function ptsMatch(p1, p2) {
        return Math.hypot(p1.x - p2.x, p1.y - p2.y) < tol;
    }

    while (queue.length > 0) {
        const current = queue.shift();
        const currentEnds = getEnds(current);

        for (const other of objects) {
            if (visited.has(other)) continue;
            if (other.type !== 'line' && other.type !== 'arc') continue;

            const otherEnds = getEnds(other);
            // Проверяем совпадение любых концов
            let connected = false;
            for (const ce of currentEnds) {
                for (const oe of otherEnds) {
                    if (ptsMatch(ce, oe)) { connected = true; break; }
                }
                if (connected) break;
            }

            if (connected) {
                visited.add(other);
                result.push(other);
                queue.push(other);
            }
        }
    }

    return result;
}

canvas.addEventListener('dblclick', (e) => {
    if (!showSheetView) return;
    const rect = canvas.getBoundingClientRect();
    const { x: sheetX, y: sheetY, w: sheetW, h: sheetH, scaleX, scaleY } = getSheetGeometry();
    const clickSheetX = (e.clientX - rect.left - sheetX) / scaleX;
    const clickSheetY = (e.clientY - rect.top - sheetY) / scaleY;

    let foundIndex = -1;
    // v4.73: Тот же поиск с учётом полигона (отверстий)
    // v4.75: Fallback на bbox для деталей без отверстий (L-shape, вырезы)
    for (let i = nestedParts.length - 1; i >= 0; i--) {
        const nested = nestedParts[i];
        if (clickSheetX < nested.x || clickSheetX > nested.x + nested.width ||
            clickSheetY < nested.y || clickSheetY > nested.y + nested.height) {
            continue;
        }
        if (nested.polygon && nested.polygon.length >= 3) {
            if (!pointInPolygonNested(clickSheetX, clickSheetY, nested.polygon)) {
                // v4.75: Fallback — если нет отверстий, клик в пустоте L-shape
                const hasHoles = Array.isArray(nested.outline) && nested.outline.length > 1;
                if (hasHoles) {
                    continue;
                }
                // Иначе — выделяем по bbox (клик в пустоте выреза)
            }
        }
        foundIndex = i;
        break;
    }

    if (foundIndex >= 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        // Выделяем только эту деталь
        selectedNestedParts = [foundIndex];
        appState.selectedNestedParts = selectedNestedParts;
        // Поворачиваем на 90° по часовой стрелке
        if (typeof rotateNestedPart === 'function') {
            const nested = nestedParts[foundIndex];
            if (typeof saveState === 'function') saveState();
            rotateNestedPart(nested, 90, sheetSize.width, sheetSize.height, parts);
            if (appState.allSheets && appState.allSheets.length > 0 && appState.currentSheetIndex >= 0) {
                // v4.37 FIX M2: глубокое копирование polygon, outline, refPoint, objects.
            appState.allSheets[appState.currentSheetIndex].nestedParts = nestedParts.map(n => ({
                ...n,
                polygon: n.polygon ? n.polygon.map(p => ({ ...p })) : undefined,
                outline: n.outline ? n.outline.map(poly => poly.map(p => ({ ...p }))) : undefined,
                refPoint: n.refPoint ? { ...n.refPoint } : undefined,
                objects: n.objects ? n.objects.map(o => ({ ...o })) : undefined
            }));
            }
            render();
            console.log(`🔄 [dblclick] Деталь #${foundIndex + 1} повёрнута на 90°`);
        }
    }
});

// ═══════════════════════════════════════════════════════════════
// 8. WINDOW.MOUSEUP
// ═══════════════════════════════════════════════════════════════
window.addEventListener('mouseup', (e) => {
    if (e.button === 1 && isSheetPanning) { isSheetPanning = false; canvas.style.cursor = ''; }
    if (appState.diagonalPatternDragging && appState.diagonalLayoutEnabled && appState.diagonalPatternStartPoint && appState.diagonalPatternEndPoint) {
        appState.diagonalPatternDragging = false;
        const lineLength = Math.sqrt(Math.pow(appState.diagonalPatternEndPoint.x - appState.diagonalPatternStartPoint.x, 2) + Math.pow(appState.diagonalPatternEndPoint.y - appState.diagonalPatternStartPoint.y, 2));
        if (lineLength >= 10) {
            // v4.42: передаём массив sources (группа) или одиночный source
            const sources = appState.diagonalPatternSources || (appState.diagonalPatternSource ? [appState.diagonalPatternSource] : []);
            createDiagonalPattern(appState.diagonalPatternCount || 2, sources, appState.diagonalPatternStartPoint, appState.diagonalPatternEndPoint);
        }
        appState.diagonalPatternSource = null; appState.diagonalPatternSources = null;
        appState.diagonalPatternStartPoint = null; appState.diagonalPatternEndPoint = null;
        appState.diagonalPatternCount = 2; appState.diagonalPatternCountManuallySet = false;
        appState.diagonalPatternMouseLastX = null; appState.diagonalPatternMouseLastY = null;
        appState.diagonalLayoutEnabled = false;
        const btn = document.getElementById('diagonalLayoutBtn');
        if (btn) { btn.classList.remove('active'); btn.textContent = '📐 Диагональная раскладка: ВЫКЛ'; }
        render();
    }
    if (isDragging) { isDragging = false; potentialDragObject = null; hasDragged = false; initialObjectPositions = []; render(); }
    if (isPanning) { isPanning = false; canvas.style.cursor = 'default'; }
    if (isDraggingDimension) { isDraggingDimension = false; draggedDimensionIndex = -1; snapIndicator.style.display = 'none'; render(); }
    if (isSelecting) { isSelecting = false; render(); }
<<<<<<< HEAD
    if (draggedPoint) { draggedPoint = null; snapIndicator.style.display = 'none'; render(); }
=======
    if (draggedPoint) {
        if (isScalingContour) {
            isScalingContour = false;
            scaleContourInitial = null;
            scaleContourCenter = null;
            scaleContourInitialDist = 0;
            if (dimensionLabel) dimensionLabel.style.display = 'none';
        }
        draggedPoint = null; snapIndicator.style.display = 'none'; render();
    }
>>>>>>> master
    hoveredPoint = null;
});

// ═══════════════════════════════════════════════════════════════
// INLINE-ВВОД РАЗМЕРОВ ДЛЯ ВСЕХ ФИГУР (Fusion 360 style)
// ═══════════════════════════════════════════════════════════════
let shapeInputStage = 0; // 0 = первый параметр, 1 = второй параметр (для линии - угол)

// Глобальный перехват клавиш при рисовании — ввод цифр без фокуса на input
document.addEventListener('keydown', (e) => {
    // v4.41: Обработка ↑↓ для диагональной раскладки (изменение количества копий)
    // Работает ТОЛЬКО в режиме diagonalPatternDragging, не мешает остальному UI.
    if (appState.diagonalPatternDragging && appState.diagonalLayoutEnabled) {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            appState.diagonalPatternCount = Math.min(50, (appState.diagonalPatternCount || 2) + 1);
            appState.diagonalPatternCountManuallySet = true;
            render();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            appState.diagonalPatternCount = Math.max(2, (appState.diagonalPatternCount || 2) - 1);
            appState.diagonalPatternCountManuallySet = true;
            render();
            return;
        }
    }

    if (!isDrawing || !currentShape) return;
    // Игнорируем если фокус уже в input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    // Игнорируем специальные клавиши
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Delete') return;
    
    // Перехватываем цифры, точку, запятую, минус
    if (/^[0-9.\-,]$/.test(e.key)) {
        e.preventDefault();
        if (!lineDimensionInput) return;
        
        lineDimensionInput.style.display = 'block';
        lineDimensionInput.focus();
        
        // Добавляем символ в конец
        lineDimensionInput.value += e.key;
        
        // Обновляем позицию input рядом с курсором
        // (координаты берём из последнего known mouse position)
        if (appState.lastMouseX && appState.lastMouseY) {
            lineDimensionInput.style.left = (appState.lastMouseX + 5) + 'px';
            lineDimensionInput.style.top = (appState.lastMouseY + 5) + 'px';
        }
    }
});

if (lineDimensionInput) {
    lineDimensionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!isDrawing || !currentShape || !startPoint) return;
            
            const raw = lineDimensionInput.value.trim();
            
            // === ЛИНия ===
            if (currentTool === 'line') {
                // Этап 0: ввод длины
                if (shapeInputStage === 0) {
                    let targetLength = parseFloat(raw);
                    if (isNaN(targetLength) || targetLength <= 0) {
                        lineDimensionInput.value = '';
                        return;
                    }
                    
                    // Вычисляем угол
                    let angleRad = Math.atan2(currentShape.y2 - startPoint.y, currentShape.x2 - startPoint.x);
                    
                    // Применяем ортогональность если включена
                    if (orthoEnabled) {
                        const angleDeg = angleRad * 180 / Math.PI;
                        const orthoAngle = ORTHO_ANGLES.reduce((prev, curr) =>
                            Math.abs(curr - ((angleDeg % 360) + 360) % 360) < Math.abs(prev - ((angleDeg % 360) + 360) % 360) ? curr : prev
                        );
                        angleRad = orthoAngle * Math.PI / 180;
                    }
                    
                    // Применяем длину к текущей линии
                    currentShape.x2 = startPoint.x + Math.cos(angleRad) * targetLength;
                    currentShape.y2 = startPoint.y + Math.sin(angleRad) * targetLength;
                    
                    // Переходим к вводу угла
                    shapeInputStage = 1;
                    lineDimensionInput.value = '';
                    const canvasAngle = Math.round(angleRad * 180 / Math.PI);
                    const cadAngle = (360 - ((canvasAngle % 360) + 360) % 360) % 360;
                    lineDimensionInput.placeholder = `Угол: ${cadAngle}° | Нажмите Enter для продолжения`;
                    lineDimensionInput.focus();
                    
                } else {
                    // Этап 1: ввод угла
                    let targetAngle = parseFloat(raw);
                    let angleRad;
                    
                    if (!isNaN(targetAngle)) {
                        // Инвертируем угол: CAD Y-up → canvas Y-down
                        angleRad = -targetAngle * Math.PI / 180;
                    } else {
                        // Если пусто или не число — используем текущий угол
                        angleRad = Math.atan2(currentShape.y2 - startPoint.y, currentShape.x2 - startPoint.x);
                    }
                    
                    // Применяем ортогональность если включена
                    if (orthoEnabled) {
                        const angleDeg = angleRad * 180 / Math.PI;
                        const orthoAngle = ORTHO_ANGLES.reduce((prev, curr) =>
                            Math.abs(curr - ((angleDeg % 360) + 360) % 360) < Math.abs(prev - ((angleDeg % 360) + 360) % 360) ? curr : prev
                        );
                        angleRad = orthoAngle * Math.PI / 180;
                    }
                    
                    // Применяем угол к линии
                    const length = Math.sqrt(Math.pow(currentShape.x2 - startPoint.x, 2) + Math.pow(currentShape.y2 - startPoint.y, 2));
                    currentShape.x2 = startPoint.x + Math.cos(angleRad) * length;
                    currentShape.y2 = startPoint.y + Math.sin(angleRad) * length;
                    
                    // Фиксируем линию
                    saveState();
                    objects.push(currentShape);
                    selectedObjects.length = 0; selectedObjects.push(currentShape);
                    if (isEditingPart && editingPartId !== null) {
                        const part = parts.find(p => samePartId(p.id, editingPartId));
                        if (part) { part.objects.push(currentShape); updatePartBounds(part); }
                    }
                    
                    // Начинаем следующую линию от конца предыдущей
                    const sx = currentShape.x2, sy = currentShape.y2;
                    startPoint = { x: sx, y: sy };
                    currentShape = new Line(sx, sy, sx, sy);
                    snapPoint = null;
                    lineSnapConstraint = null;
                    
                    shapeInputStage = 0;
                    lineDimensionInput.value = '';
                    lineDimensionInput.placeholder = 'Длина | Нажмите Enter';
                    lineDimensionInput.focus();
                    
                    render();
                }
            }
            // === КРУГ ===
            else if (currentTool === 'circle') {
                const diameter = parseFloat(raw);
                if (!isNaN(diameter) && diameter > 0) {
                    currentShape.radius = diameter / 2;
                    
                    saveState();
                    objects.push(currentShape);
                    selectedObjects.length = 0; selectedObjects.push(currentShape);
                    if (isEditingPart && editingPartId !== null) {
                        const part = parts.find(p => samePartId(p.id, editingPartId));
                        if (part) { part.objects.push(currentShape); updatePartBounds(part); }
                    }
                    
                    isDrawing = false;
                    currentShape = null;
                    shapeInputStage = 0;
                    lineDimensionInput.style.display = 'none';
                    lineDimensionInput.value = '';
                    
                    render();
                }
            }
            // === ПРЯМОУГОЛЬНИК ===
            else if (currentTool === 'rect') {
                if (shapeInputStage === 0) {
                    // Ввод ширины
                    const width = parseFloat(raw);
                    if (!isNaN(width) && width > 0) {
                        const sign = currentShape.width < 0 ? -1 : 1;
                        currentShape.width = width * sign;
                        shapeInputStage = 1;
                        lineDimensionInput.value = '';
                        lineDimensionInput.placeholder = `Высота (ширина: ${width.toFixed(2)}) | Enter`;
                        lineDimensionInput.focus();
                    }
                } else {
                    // Ввод высоты
                    const height = parseFloat(raw);
                    if (!isNaN(height) && height > 0) {
                        const sign = currentShape.height < 0 ? -1 : 1;
                        currentShape.height = height * sign;
                        
                        saveState();
                        objects.push(currentShape);
                        selectedObjects.length = 0; selectedObjects.push(currentShape);
                        if (isEditingPart && editingPartId !== null) {
                            const part = parts.find(p => samePartId(p.id, editingPartId));
                            if (part) { part.objects.push(currentShape); updatePartBounds(part); }
                        }
                        
                        isDrawing = false;
                        currentShape = null;
                        shapeInputStage = 0;
                        lineDimensionInput.style.display = 'none';
                        lineDimensionInput.value = '';
                        
                        render();
                    }
                }
            }
            // === МНОГОУГОЛЬНИК ===
            else if (currentTool === 'polygon') {
                const radius = parseFloat(raw);
                if (!isNaN(radius) && radius > 0) {
                    currentShape.radius = radius;
                    
                    saveState();
                    objects.push(currentShape);
                    selectedObjects.length = 0; selectedObjects.push(currentShape);
                    if (isEditingPart && editingPartId !== null) {
                        const part = parts.find(p => samePartId(p.id, editingPartId));
                        if (part) { part.objects.push(currentShape); updatePartBounds(part); }
                    }
                    
                    isDrawing = false;
                    currentShape = null;
                    shapeInputStage = 0;
                    lineDimensionInput.style.display = 'none';
                    lineDimensionInput.value = '';
                    
                    render();
                }
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            isDrawing = false;
            currentShape = null;
            snapPoint = null;
            shapeInputStage = 0;
            lineDimensionInput.style.display = 'none';
            lineDimensionInput.value = '';
            lineDimensionInput.placeholder = '';
            // v4.38 FIX M5: сброс drawing-состояния микростыка при ESC.
            // Раньше ESC не сбрасывал эти флаги → курсор "залипал" в режиме
            // рисования линии микростыка, следующий клик продолжал старую линию.
            if (typeof currentTool !== 'undefined' && currentTool === 'microjoint') {
                appState.microjointIsDrawing = false;
                appState.microjointLineStart = null;
                appState.microjointLineEnd = null;
                // microjointToolBtn exists in DOM — снимаем active если нужно
                if (typeof microjointBtn !== 'undefined' && microjointBtn) {
                    // Не снимаем active — пользователь может хотеть продолжить
                    // микростыки. Только сбрасываем текущую незавершённую линию.
                }
            }
            render();
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// СОЗДАНИЕ УГЛОВОГО РАЗМЕРА
// ═══════════════════════════════════════════════════════════════
function createAngleDimension(vertexX, vertexY, point1X, point1Y, point2X, point2Y) {
    const vertex = { x: vertexX, y: vertexY };
    const point1 = { x: point1X, y: point1Y };
    const point2 = { x: point2X, y: point2Y };

    const angle1 = Math.atan2(point1.y - vertex.y, point1.x - vertex.x);
    const angle2 = Math.atan2(point2.y - vertex.y, point2.x - vertex.x);
    let angleDiff = (angle2 - angle1) * 180 / Math.PI;
    if (angleDiff < 0) angleDiff += 360;

    let isClockwise = true;
    if (angleDiff > 180) {
        angleDiff = 360 - angleDiff;
        isClockwise = false;
    }

    const dist1 = Math.sqrt(Math.pow(point1.x - vertex.x, 2) + Math.pow(point1.y - vertex.y, 2));
    const dist2 = Math.sqrt(Math.pow(point2.x - vertex.x, 2) + Math.pow(point2.y - vertex.y, 2));

    let sceneMaxDim = 500;
    if (objects.length > 0) {
        let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
        objects.forEach(obj => {
            const pts = obj.getPoints();
            pts.forEach(pt => {
                sMinX = Math.min(sMinX, pt.x);
                sMinY = Math.min(sMinY, pt.y);
                sMaxX = Math.max(sMaxX, pt.x);
                sMaxY = Math.max(sMaxY, pt.y);
            });
        });
        sceneMaxDim = Math.max(sMaxX - sMinX, sMaxY - sMinY);
    }

    const baseRadius = Math.max(30, Math.min(300, sceneMaxDim * 0.12));
    const maxDist = Math.max(dist1, dist2);
    const radius = Math.min(baseRadius, maxDist * 0.8);

    if (dist1 > 5 && dist2 > 5) {
        const angleDim = {
            x: vertex.x, y: vertex.y,
            x1: point1.x, y1: point1.y,
            x2: point2.x, y2: point2.y,
            radius: radius,
            startAngle: isClockwise ? angle1 : angle2,
            endAngle: isClockwise ? angle2 : angle1,
            value: Math.round(angleDiff * 10) / 10
        };
        angleDimensions.push(angleDim);
    } else {
        alert('⚠️ Угол слишком маленький! Кликните дальше от вершины.');
    }
}

// ═══════════════════════════════════════════════════════════════
// ПЕРЕТАСКИВАНИЕ УГЛОВЫХ РАЗМЕРОВ
// ═══════════════════════════════════════════════════════════════
let isDraggingAngleDimension = false;
let draggedAngleDimensionIndex = -1;
let angleDimensionDragOffsetX = 0;
let angleDimensionDragOffsetY = 0;

document.addEventListener('mousedown', (e) => {
    if (currentTool === 'select' && angleDimensions.length > 0 && !e.shiftKey && !e.altKey && e.button === 0) {
        const rect = canvas.getBoundingClientRect();
        const sheetX = canvas.width / 2 + panX;
        const sheetY = canvas.height / 2 + panY;
        const scaleX = zoom;
        const scaleY = zoom;
        const clickSheetX = (e.clientX - rect.left - sheetX) / scaleX;
        const clickSheetY = (e.clientY - rect.top - sheetY) / scaleY;

        for (let i = 0; i < angleDimensions.length; i++) {
            const ad = angleDimensions[i];
            const distToVertex = Math.sqrt(Math.pow(clickSheetX - ad.x, 2) + Math.pow(clickSheetY - ad.y, 2));
            if (distToVertex < 10) {
                isDraggingAngleDimension = true;
                draggedAngleDimensionIndex = i;
                angleDimensionDragOffsetX = clickSheetX - ad.x;
                angleDimensionDragOffsetY = clickSheetY - ad.y;
                selectedAngleDimension = i;
                e.preventDefault();
                e.stopPropagation();
                break;
            }
        }
    }
});

document.addEventListener('mousemove', (e) => {
    if (isDraggingAngleDimension && draggedAngleDimensionIndex >= 0) {
        const rect = canvas.getBoundingClientRect();
        const sheetX = canvas.width / 2 + panX;
        const sheetY = canvas.height / 2 + panY;
        const scaleX = zoom;
        const scaleY = zoom;
        const clickSheetX = (e.clientX - rect.left - sheetX) / scaleX;
        const clickSheetY = (e.clientY - rect.top - sheetY) / scaleY;

        const ad = angleDimensions[draggedAngleDimensionIndex];
        ad.x = clickSheetX - angleDimensionDragOffsetX;
        ad.y = clickSheetY - angleDimensionDragOffsetY;

        const angle1 = Math.atan2(ad.y1 - ad.y, ad.x1 - ad.x);
        const angle2 = Math.atan2(ad.y2 - ad.y, ad.x2 - ad.x);
        let angleDiff = (angle2 - angle1) * 180 / Math.PI;
        if (angleDiff < 0) angleDiff += 360;
        if (angleDiff > 180) angleDiff = 360 - angleDiff;
        ad.value = Math.round(angleDiff * 10) / 10;

        render();
    }
});

document.addEventListener('mouseup', () => {
    if (isDraggingAngleDimension) {
        isDraggingAngleDimension = false;
        draggedAngleDimensionIndex = -1;
    }
});

// ═══════════════════════════════════════════════════════════════
// v4.44 U2: KEYBOARD SHORTCUTS — Ctrl+Z, Ctrl+Y, Delete, Esc
// Работает независимо от режима рисования. Не мешает вводу в input/textarea.
// ═══════════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
    // Игнорируем если фокус в input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Ctrl+Z — undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (typeof undo === 'function') { undo(); }
        else if (typeof window.undo === 'function') { window.undo(); }
        else { console.warn('[SHORTCUT] undo() не найден'); }
        return;
    }

    // Ctrl+Y или Ctrl+Shift+Z — redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || e.key === 'Z')) {
        e.preventDefault();
        if (typeof redo === 'function') { redo(); }
        else if (typeof window.redo === 'function') { window.redo(); }
        else { console.warn('[SHORTCUT] redo() не найден'); }
        return;
    }

    // Delete — удалить выделенные объекты или nested parts
    if (e.key === 'Delete') {
        // Не мешаем рисованию (там Delete может использоваться иначе)
        if (isDrawing || currentShape) return;

        e.preventDefault();

        // Если на листе и есть выделенные nested parts — удаляем их
        if (typeof showSheetView !== 'undefined' && showSheetView &&
            typeof selectedNestedParts !== 'undefined' && selectedNestedParts.length > 0) {
            if (typeof saveState === 'function') saveState();
            // Сортируем индексы по убыванию для корректного splice
            const sorted = [...selectedNestedParts].sort((a, b) => b - a);
            for (const idx of sorted) {
                if (idx >= 0 && idx < nestedParts.length) {
                    nestedParts.splice(idx, 1);
                }
            }
            selectedNestedParts = [];
            // Синхронизируем с allSheets
            if (typeof syncAllSheetsNestedParts === 'function') syncAllSheetsNestedParts();
            if (typeof render === 'function') render();
            if (typeof updatePartsList === 'function') updatePartsList();
            console.log('[SHORTCUT] Удалено nested parts: ' + sorted.length);
            return;
        }

        // Если есть выделенные объекты на холсте — кликаем кнопку deleteObj
        if (typeof selectedObjects !== 'undefined' && selectedObjects.length > 0) {
            const delBtn = document.getElementById('deleteObj');
            if (delBtn) { delBtn.click(); }
            else {
                // Fallback: удаляем напрямую
                if (typeof saveState === 'function') saveState();
                for (const obj of selectedObjects) {
                    const idx = objects.indexOf(obj);
                    if (idx >= 0) objects.splice(idx, 1);
                }
                selectedObjects.length = 0;
                if (typeof render === 'function') render();
            }
            console.log('[SHORTCUT] Удалено объектов: ' + selectedObjects.length);
            return;
        }
    }

    // Escape (когда не рисуем) — снять выделение
    if (e.key === 'Escape' && !isDrawing && !currentShape) {
        if (typeof selectedObjects !== 'undefined' && selectedObjects.length > 0) {
            selectedObjects.length = 0;
            if (typeof showProperties === 'function') showProperties(null);
            if (typeof render === 'function') render();
        }
        if (typeof selectedNestedParts !== 'undefined' && selectedNestedParts.length > 0) {
            selectedNestedParts = [];
            const info = document.getElementById('nestedSelectInfo');
            if (info) info.style.display = 'none';
            if (typeof render === 'function') render();
        }
    }
});

// ═══════════════════════════════════════════════════════════════
// v4.44 U3: AUTOSAVE — автоматическое сохранение в localStorage
// • Каждые 30 секунд (если есть изменения)
// • При закрытии/обновлении вкладки (beforeunload)
// • Восстановление при загрузке (autosaveRestore)
// Использует существующий saveToCache() если доступен.
// ═══════════════════════════════════════════════════════════════
let _autosaveTimer = null;
let _autosaveDirty = false;  // флаг: есть несохранённые изменения

// Отметить что данные изменились (вызывать после модификаций)
function _markAutosaveDirty() {
    _autosaveDirty = true;
}

// Сохранение
function _autosaveSave() {
    if (!_autosaveDirty) return;
    try {
        // Используем существующий saveToCache если доступен
        if (typeof saveToCache === 'function') {
            saveToCache();
        }
        // Также сохраняем ключевые данные напрямую
        if (typeof localStorage !== 'undefined') {
            const data = {
                timestamp: Date.now(),
                parts: (typeof parts !== 'undefined') ? parts : null,
                objects: (typeof objects !== 'undefined') ? objects : null,
                allSheets: (typeof appState !== 'undefined' && appState.allSheets) ? appState.allSheets : null,
                currentSheetIndex: (typeof appState !== 'undefined') ? appState.currentSheetIndex : 0
            };
            localStorage.setItem('cutsy_autosave', JSON.stringify(data));
        }
        _autosaveDirty = false;
    } catch (e) {
        console.warn('[AUTOSAVE] Ошибка:', e.message);
    }
}

// Запуск таймера autosave (каждые 30 секунд)
function _startAutosaveTimer() {
    if (_autosaveTimer) clearInterval(_autosaveTimer);
    _autosaveTimer = setInterval(_autosaveSave, 30000);
    console.log('[AUTOSAVE] Таймер запущен (30 сек)');
}

// v4.68: Восстанавливает методы для объектов после JSON-десериализации.
// JSON.stringify теряет функции (draw/contains/move/clone/getVertices/getPoints).
// Эта функция добавляет их обратно для polygon/polyline (CustomPolygon-подобных).
window.restoreObjectMethods = function(obj) {
    if (!obj || !obj.type) return;

    // Для polygon с points (CustomPolygon из rotate/mirror/offset)
    if (obj.type === 'polygon' && obj.points && obj.points.length >= 2) {
        if (typeof obj.getVertices !== 'function') obj.getVertices = function() { return this.points; };
        if (typeof obj.getPoints !== 'function') obj.getPoints = function() { return this.points; };
        if (typeof obj.draw !== 'function') {
            obj.draw = function(ctx) {
                if (!this.points || this.points.length < 2) return;
                ctx.strokeStyle = this.color || '#00aadd';
                ctx.beginPath();
                ctx.moveTo(this.points[0].x, this.points[0].y);
                for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
                ctx.closePath();
                ctx.stroke();
            };
        }
        if (typeof obj.contains !== 'function') {
            obj.contains = function(x, y) {
                if (!this.points || this.points.length < 3) return false;
                let inside = false;
                for (let i = 0, j = this.points.length - 1; i < this.points.length; j = i++) {
                    if (((this.points[i].y > y) !== (this.points[j].y > y)) &&
                        (x < (this.points[j].x - this.points[i].x) * (y - this.points[i].y) / (this.points[j].y - this.points[i].y) + this.points[i].x)) inside = !inside;
                }
                return inside;
            };
        }
        if (typeof obj.move !== 'function') obj.move = function(dx, dy) { this.points.forEach(p => { p.x += dx; p.y += dy; }); };
        if (typeof obj.clone !== 'function') obj.clone = function() { const c = {...this}; c.points = this.points.map(p => ({x:p.x,y:p.y})); c.id = Date.now()+Math.random(); return c; };
        // Вычисляем cx/cy/radius/sides для properties-panel
        if (obj.cx === undefined) {
            let sx = 0, sy = 0;
            for (const p of obj.points) { sx += p.x; sy += p.y; }
            obj.cx = sx / obj.points.length;
            obj.cy = sy / obj.points.length;
            let maxR = 0;
            for (const p of obj.points) { const d = Math.hypot(p.x - obj.cx, p.y - obj.cy); if (d > maxR) maxR = d; }
            obj.radius = maxR;
            obj.sides = obj.points.length;
        }
    }

    // Для polyline/lwpolyline с points
    if ((obj.type === 'polyline' || obj.type === 'lwpolyline') && obj.points) {
        if (typeof obj.getVertices !== 'function') obj.getVertices = function() { return this.points; };
        if (typeof obj.getPoints !== 'function') obj.getPoints = function() { return this.points; };
        if (typeof obj.draw !== 'function') {
            obj.draw = function(ctx) {
                if (!this.points || this.points.length < 2) return;
                ctx.strokeStyle = this.color || '#00aadd';
                ctx.beginPath();
                ctx.moveTo(this.points[0].x, this.points[0].y);
                for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
                if (this.closed) ctx.closePath();
                ctx.stroke();
            };
        }
        if (typeof obj.move !== 'function') obj.move = function(dx, dy) { this.points.forEach(p => { p.x += dx; p.y += dy; }); };
    }

    // Для text с rotation
    if (obj.type === 'text' && obj.rotation !== undefined) {
        // draw уже поддерживает rotation через shapes.js, но после JSON
        // нужно убедиться что это объект Text (с методами)
        if (typeof obj.draw !== 'function' && typeof Text !== 'undefined') {
            // Нельзя создать new Text (потеряем rotation), добавляем методы вручную
            obj.draw = Text.prototype.draw.bind(obj);
            obj.contains = Text.prototype.contains.bind(obj);
            obj.move = Text.prototype.move.bind(obj);
            obj.clone = function() { const c = {...this}; c.id = Date.now()+Math.random(); return c; };
        }
    }
}

// Восстановление из autosave
function autosaveRestore() {
    try {
        if (typeof localStorage === 'undefined') return false;
        const raw = localStorage.getItem('cutsy_autosave');
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!data || !data.timestamp) return false;

        // Проверяем возраст (старше 24 часов — не восстанавливаем)
        const age = Date.now() - data.timestamp;
        if (age > 24 * 60 * 60 * 1000) {
            localStorage.removeItem('cutsy_autosave');
            return false;
        }

        const ageMin = Math.round(age / 60000);
        console.log(`[AUTOSAVE] Найдено сохранение (${ageMin} мин назад)`);

        // Восстанавливаем данные
        if (data.parts && typeof parts !== 'undefined') {
            parts.length = 0;
            parts.push(...data.parts);
            // v4.68: Восстанавливаем методы для объектов внутри деталей
            // (JSON.stringify теряет draw/contains/move/clone)
            for (const part of parts) {
                if (part && part.objects) {
                    for (const obj of part.objects) {
                        window.restoreObjectMethods(obj);
                    }
                }
            }
        }
        if (data.objects && typeof objects !== 'undefined') {
            objects.length = 0;
            objects.push(...data.objects);
            // v4.68: Восстанавливаем методы для объектов на холсте
            for (const obj of objects) {
                window.restoreObjectMethods(obj);
            }
        }
        if (data.allSheets && typeof appState !== 'undefined') {
            appState.allSheets = data.allSheets;
            appState.currentSheetIndex = data.currentSheetIndex || 0;
            if (typeof allSheets !== 'undefined') allSheets = appState.allSheets;
            if (typeof currentSheetIndex !== 'undefined') currentSheetIndex = appState.currentSheetIndex;
        }

        if (typeof render === 'function') render();
        if (typeof updatePartsList === 'function') updatePartsList();
        return true;
    } catch (e) {
        console.warn('[AUTOSAVE] Ошибка восстановления:', e.message);
        return false;
    }
}

// Запуск autosave при загрузке
if (typeof window !== 'undefined') {
    _startAutosaveTimer();
    // Сохранение при закрытии вкладки
    window.addEventListener('beforeunload', _autosaveSave);
    // Пометка dirty при saveState (перехватываем все модификации)
    if (typeof saveState === 'function') {
        const _origSaveState = saveState;
        window.saveState = function() {
            _origSaveState.apply(this, arguments);
            _markAutosaveDirty();
        };
    }
    // Делаем restore доступным глобально
    window.autosaveRestore = autosaveRestore;
    console.log('[AUTOSAVE] Модуль загружен');
}
