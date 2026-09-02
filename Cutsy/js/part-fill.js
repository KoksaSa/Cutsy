// ═══════════════════════════════════════════════════════════
// part-fill.js — v4.60 — Полупрозрачная заливка деталей
// ═══════════════════════════════════════════════════════════
// Визуализация материала детали через градиентную заливку
// внутреннего контура. Отверстия НЕ закрашиваются (evenodd rule).
//
// Градиент имитирует нержавеющую сталь:
//   - Диагональный (45°)
//   - Полупрозрачный (alpha 0.25-0.35)
//   - Металлический отблеск (3 стопа)
//
// Контуры вычисляются через mergeObjectsToContours (если доступна)
// или через упрощённую экстракцию замкнутых объектов.
// Результат кэшируется для производительности.
// ═══════════════════════════════════════════════════════════

(function() {
'use strict';

// Кэш контуров: key = partId_objectsHash → { external, holes }
const _fillCache = new Map();

// Включена ли заливка (можно toggling через UI)
let _fillEnabled = true;

// ═══════════════════════════════════════════════════════════════
// УПРАВЛЕНИЕ
// ═══════════════════════════════════════════════════════════════

window.isPartFillEnabled = function() { return _fillEnabled; };
window.setPartFillEnabled = function(enabled) {
    _fillEnabled = enabled;
    if (typeof render === 'function') render();
};

// Очистка кэша (при изменении детали)
window.clearPartFillCache = function(partId) {
    if (partId !== undefined && partId !== null) {
        const prefix = String(partId) + '_';
        for (const key of _fillCache.keys()) {
            if (key.startsWith(prefix)) _fillCache.delete(key);
        }
    } else {
        _fillCache.clear();
    }
};

// ═══════════════════════════════════════════════════════════════
// ВЫЧИСЛЕНИЕ КОНТУРОВ
// ═══════════════════════════════════════════════════════════════

/**
 * Получить контуры для заливки детали.
 * Возвращает { external: [{x,y}], holes: [[{x,y}]] } или null.
 * Результат кэшируется.
 * @param {Object} part — объект детали
 * @param {Array} [overrideObjects] — если переданы, используются вместо part.objects
 *        (нужно для отражённых деталей, где nested.objects отличается от part.objects)
 */
function getPartFillContours(part, overrideObjects) {
    const objects = overrideObjects || (part ? part.objects : null);
    if (!objects || objects.length === 0) return null;

    // Кэш-ключ: partId + количество объектов + хэш позиций первых точек
    // (чтобы кэш сбрасывался при отражении/перемещении)
    let posHash = '';
    for (let i = 0; i < Math.min(3, objects.length); i++) {
        const o = objects[i];
        if (!o) continue;
        if (o.x1 !== undefined) posHash += `${o.x1.toFixed(1)},${o.y1.toFixed(1)};`;
        else if (o.cx !== undefined) posHash += `${o.cx.toFixed(1)},${o.cy.toFixed(1)};`;
        else if (o.x !== undefined) posHash += `${o.x.toFixed(1)},${o.y.toFixed(1)};`;
        else if (o.points && o.points[0]) posHash += `${o.points[0].x.toFixed(1)},${o.points[0].y.toFixed(1)};`;
    }
    const cacheKey = String(part ? part.id : 'canvas') + '_' + objects.length + '_' + posHash;
    if (_fillCache.has(cacheKey)) return _fillCache.get(cacheKey);

    // Получаем контуры через mergeObjectsToContours если доступна
    // v4.60: Это сшивает линии+дуги в замкнутые контуры
    let contours = [];
    if (typeof mergeObjectsToContours === 'function') {
        try {
            contours = mergeObjectsToContours(objects, () => 0, 1);
        } catch (e) {
            console.warn('[part-fill] mergeObjectsToContours error:', e);
        }
    }

    // Fallback: если mergeObjectsToContours не дал результат — простая экстракция
    if (!contours || contours.length === 0) {
        contours = extractClosedContours(objects);
    }

    // Фильтруем: только замкнутые контуры с ≥3 вершинами
    const closedContours = contours.filter(c => c.closed && c.vertices && c.vertices.length >= 3);
    if (closedContours.length === 0) {
        _fillCache.set(cacheKey, null);
        return null;
    }

    // Вычисляем площадь каждого контура (Shoelace formula)
    const withArea = closedContours.map(c => {
        let area = 0;
        const v = c.vertices;
        for (let i = 0; i < v.length; i++) {
            const j = (i + 1) % v.length;
            area += v[i].x * v[j].y - v[j].x * v[i].y;
        }
        return { vertices: v, area: Math.abs(area / 2) };
    });

    // Сортируем по убыванию площади
    withArea.sort((a, b) => b.area - a.area);

    // Самый большой = внешний контур
    const external = withArea[0];

    // Остальные, чей ЦЕНТР строго внутри внешнего контура = отверстия
    // v4.60 FIX: Раньше использовали только bbox-проверку, что приводило к
    // тому что декоративные многоугольники (нарисованные внутри контура)
    // заливались сами. Теперь проверяем point-in-polygon центра контура.
    const extBBox = getVerticesBBox(external.vertices);

    // Локальная функция point-in-polygon (ray casting)
    const isPointInPolygon = (px, py, polygon) => {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            if (((polygon[i].y > py) !== (polygon[j].y > py)) &&
                (px < (polygon[j].x - polygon[i].x) * (py - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
                inside = !inside;
            }
        }
        return inside;
    };

    const holes = withArea.slice(1).filter(c => {
        const bbox = getVerticesBBox(c.vertices);
        // Быстрая проверка: bbox должен быть внутри bbox внешнего контура
        if (bbox.minX < extBBox.minX - 0.5 || bbox.maxX > extBBox.maxX + 0.5 ||
            bbox.minY < extBBox.minY - 0.5 || bbox.maxY > extBBox.maxY + 0.5) {
            return false;
        }
        // Точная проверка: центр контура внутри внешнего контура
        const cx = (bbox.minX + bbox.maxX) / 2;
        const cy = (bbox.minY + bbox.maxY) / 2;
        return isPointInPolygon(cx, cy, external.vertices);
    });

    const result = {
        external: external.vertices,
        holes: holes.map(h => h.vertices)
    };

    _fillCache.set(cacheKey, result);
    return result;
}

/**
 * Вычислить bbox массива вершин
 */
function getVerticesBBox(vertices) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of vertices) {
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Упрощённая экстракция замкнутых контуров из объектов
 * (fallback если mergeObjectsToContours недоступна/не сработала)
 */
function extractClosedContours(objects) {
    const contours = [];
    for (const obj of objects) {
        if (!obj) continue;
        let pts = [];
        let closed = false;

        if (obj.type === 'circle') {
            const r = Math.abs(obj.radius || 0);
            if (r > 0) {
                for (let i = 0; i < 36; i++) {
                    const a = (2 * Math.PI * i) / 36;
                    pts.push({ x: obj.cx + Math.cos(a) * r, y: obj.cy + Math.sin(a) * r });
                }
                closed = true;
            }
        } else if (obj.type === 'rect') {
            pts = [
                { x: obj.x, y: obj.y },
                { x: obj.x + obj.width, y: obj.y },
                { x: obj.x + obj.width, y: obj.y + obj.height },
                { x: obj.x, y: obj.y + obj.height }
            ];
            closed = true;
        } else if (obj.type === 'polygon') {
            pts = (typeof obj.getVertices === 'function') ? obj.getVertices() : (obj.points || []);
            closed = true;
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            pts = (obj.points || obj.vertices || []).filter(p => p && typeof p.x === 'number');
            closed = obj.closed === true;
        } else if (obj.type === 'spline') {
            pts = (obj.fitPoints || obj.controlPoints || obj.points || []).filter(p => p && typeof p.x === 'number');
            closed = obj.closed === true || obj.isClosed === true;
        } else if (obj.type === 'ellipse') {
            const rx = Math.abs(obj.rx || 0), ry = Math.abs(obj.ry || 0);
            if (rx > 0 && ry > 0) {
                for (let i = 0; i < 36; i++) {
                    const a = (2 * Math.PI * i) / 36;
                    pts.push({ x: obj.cx + Math.cos(a) * rx, y: obj.cy + Math.sin(a) * ry });
                }
                closed = true;
            }
        } else if (obj.type === 'arc') {
            // Только если почти полная окружность
            const r = Math.abs(obj.radius || 0);
            if (r > 0 && typeof obj.startAngle === 'number' && typeof obj.endAngle === 'number') {
                let sweep;
                if (obj.direction === 'CW') {
                    sweep = obj.startAngle - obj.endAngle;
                    if (sweep < 0) sweep += Math.PI * 2;
                } else {
                    sweep = obj.endAngle - obj.startAngle;
                    if (sweep < 0) sweep += Math.PI * 2;
                }
                if (sweep > Math.PI * 1.95) {
                    const dir = obj.direction === 'CW' ? -1 : 1;
                    for (let i = 0; i < 36; i++) {
                        const a = obj.startAngle + dir * (sweep / 36) * i;
                        pts.push({ x: obj.cx + Math.cos(a) * r, y: obj.cy + Math.sin(a) * r });
                    }
                    closed = true;
                }
            }
        }

        if (closed && pts.length >= 3) {
            contours.push({ vertices: pts, closed: true });
        }
    }
    return contours;
}

// ═══════════════════════════════════════════════════════════════
// ГРАДИЕНТ "НЕРЖАВЕЮЩАЯ СТАЛЬ"
// ═══════════════════════════════════════════════════════════════

/**
 * Создать градиент, имитирующий нержавеющую сталь
 * Диагональный, с металлическим отблеском
 */
function createSteelGradient(ctx, x0, y0, x1, y1) {
    // v4.65: Защита от NaN/Infinity (createLinearGradient падает с non-finite)
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
        return 'rgba(192, 192, 200, 0.25)';
    }
    // Если размеры слишком малы — fallback на сплошной цвет
    if (Math.abs(x1 - x0) < 1 && Math.abs(y1 - y0) < 1) {
        return 'rgba(192, 192, 200, 0.25)';
    }

    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    // Нержавейка: светлый → средний → светлый (отблеск)
    grad.addColorStop(0,    'rgba(210, 210, 218, 0.25)');
    grad.addColorStop(0.25, 'rgba(160, 160, 170, 0.30)');
    grad.addColorStop(0.5,  'rgba(195, 195, 205, 0.35)');
    grad.addColorStop(0.75, 'rgba(160, 160, 170, 0.30)');
    grad.addColorStop(1,    'rgba(210, 210, 218, 0.25)');
    return grad;
}

// ═══════════════════════════════════════════════════════════════
// ОТРИСОВКА — ХОЛСТ РЕДАКТИРОВАНИЯ (мировые координаты)
// ═══════════════════════════════════════════════════════════════

/**
 * Отрисовать заливку деталей на холсте редактирования.
 * Использует объекты напрямую (мировые координаты).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} objects — массив объектов (глобальный `objects`)
 */
window.drawPartsFillOnCanvas = function(ctx, objects) {
    if (!_fillEnabled || !objects || objects.length === 0) return;

    // v4.60: Сначала пробуем mergeObjectsToContours — сшивает линии+дуги
    // в замкнутые контуры. Это позволяет заливать контуры, нарисованные
    // из отдельных линий (а не только из circle/rect/polygon).
    let contours = [];
    if (typeof mergeObjectsToContours === 'function') {
        try {
            contours = mergeObjectsToContours(objects, () => 0, 1);
        } catch (e) {
            console.warn('[part-fill] mergeObjectsToContours error:', e);
        }
    }

    // Fallback: если mergeObjectsToContours не дал результат — простая экстракция
    if (!contours || contours.length === 0) {
        contours = extractClosedContours(objects);
    }

    const closedContours = contours.filter(c => c.closed && c.vertices && c.vertices.length >= 3);
    if (closedContours.length === 0) return;

    // Вычисляем площади
    const withArea = closedContours.map(c => {
        let area = 0;
        const v = c.vertices;
        for (let i = 0; i < v.length; i++) {
            const j = (i + 1) % v.length;
            area += v[i].x * v[j].y - v[j].x * v[i].y;
        }
        return { vertices: v, area: Math.abs(area / 2) };
    });

    // Сортируем по убыванию
    withArea.sort((a, b) => b.area - a.area);

    // Группируем: для каждого самого большого контура ищем отверстия внутри
    // v4.60 FIX: Используем point-in-polygon вместо только bbox-проверки
    const isPointInPolygon = (px, py, polygon) => {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            if (((polygon[i].y > py) !== (polygon[j].y > py)) &&
                (px < (polygon[j].x - polygon[i].x) * (py - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
                inside = !inside;
            }
        }
        return inside;
    };

    const used = new Set();
    for (let i = 0; i < withArea.length; i++) {
        if (used.has(i)) continue;
        const external = withArea[i];
        const extBBox = getVerticesBBox(external.vertices);

        // Ищем отверстия внутри (bbox + point-in-polygon центра)
        const holes = [];
        for (let j = i + 1; j < withArea.length; j++) {
            if (used.has(j)) continue;
            const bbox = getVerticesBBox(withArea[j].vertices);
            // Быстрая проверка bbox
            if (bbox.minX < extBBox.minX - 0.5 || bbox.maxX > extBBox.maxX + 0.5 ||
                bbox.minY < extBBox.minY - 0.5 || bbox.maxY > extBBox.maxY + 0.5) {
                continue;
            }
            // Точная проверка: центр контура внутри внешнего
            const cx = (bbox.minX + bbox.maxX) / 2;
            const cy = (bbox.minY + bbox.maxY) / 2;
            if (isPointInPolygon(cx, cy, external.vertices)) {
                holes.push(withArea[j].vertices);
                used.add(j);
            }
        }

        // Рисуем
        const grad = createSteelGradient(ctx, extBBox.minX, extBBox.minY, extBBox.maxX, extBBox.maxY);
        ctx.fillStyle = grad;

        ctx.beginPath();
        // Внешний контур
        ctx.moveTo(external.vertices[0].x, external.vertices[0].y);
        for (let k = 1; k < external.vertices.length; k++) {
            ctx.lineTo(external.vertices[k].x, external.vertices[k].y);
        }
        ctx.closePath();
        // Отверстия
        for (const hole of holes) {
            ctx.moveTo(hole[0].x, hole[0].y);
            for (let k = 1; k < hole.length; k++) {
                ctx.lineTo(hole[k].x, hole[k].y);
            }
            ctx.closePath();
        }
        ctx.fill('evenodd');
    }
};

// ═══════════════════════════════════════════════════════════════
// ОТРИСОВКА — ЛИСТ РАСКЛАДКИ (с поворотом и масштабом)
// ═══════════════════════════════════════════════════════════════

/**
 * Отрисовать заливку детали на листе раскладки.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} part — объект детали
 * @param {Object} transform — параметры трансформации
 * @param {Array} [overrideObjects] — отражённые/кастомные объекты (nested.objects)
 */
window.drawPartFillOnSheet = function(ctx, part, transform, overrideObjects) {
    if (!_fillEnabled) return;

    // v4.60: Используем overrideObjects (nested.objects) если переданы —
    // это исправляет баг с заливкой при отражении детали
    const fillData = getPartFillContours(part, overrideObjects);
    if (!fillData) return;

    const {
        drawX, drawY, scaleX, scaleY,
        rotation, centerX, centerY,
        normOffsetX, normOffsetY, refPoint
    } = transform;

    // Функция поворота точки
    const rotatePoint = (px, py, angle, cx, cy) => {
        if (!angle || angle === 0) return { x: px, y: py };
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            x: cx + (px - cx) * cos - (py - cy) * sin,
            y: cy + (px - cx) * sin + (py - cy) * cos
        };
    };

    // Трансформирует локальную точку в экранные координаты листа
    const toScreen = (lx, ly) => {
        const dx = lx - normOffsetX;
        const dy = ly - normOffsetY;
        const rotated = rotatePoint(dx, dy, rotation, centerX, centerY);
        return {
            x: drawX + (rotated.x - refPoint.x) * scaleX,
            y: drawY + (rotated.y - refPoint.y) * scaleY
        };
    };

    // Вычисляем bbox внешнего контура в экранных координатах для градиента
    let scrMinX = Infinity, scrMinY = Infinity, scrMaxX = -Infinity, scrMaxY = -Infinity;
    const extScreen = fillData.external.map(v => {
        const s = toScreen(v.x, v.y);
        if (s.x < scrMinX) scrMinX = s.x;
        if (s.y < scrMinY) scrMinY = s.y;
        if (s.x > scrMaxX) scrMaxX = s.x;
        if (s.y > scrMaxY) scrMaxY = s.y;
        return s;
    });

    const grad = createSteelGradient(ctx, scrMinX, scrMinY, scrMaxX, scrMaxY);
    ctx.fillStyle = grad;

    ctx.beginPath();
    // Внешний контур
    if (extScreen.length > 0) {
        ctx.moveTo(extScreen[0].x, extScreen[0].y);
        for (let i = 1; i < extScreen.length; i++) {
            ctx.lineTo(extScreen[i].x, extScreen[i].y);
        }
        ctx.closePath();
    }

    // Отверстия
    for (const hole of fillData.holes) {
        if (hole.length < 3) continue;
        const holeScreen = hole.map(v => toScreen(v.x, v.y));
        ctx.moveTo(holeScreen[0].x, holeScreen[0].y);
        for (let i = 1; i < holeScreen.length; i++) {
            ctx.lineTo(holeScreen[i].x, holeScreen[i].y);
        }
        ctx.closePath();
    }

    ctx.fill('evenodd');
};

console.log('✅ part-fill.js загружен (v4.60)');

})();
