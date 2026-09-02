// ═══════════════════════════════════════════════════════════════
// offset-tool.js — v1.0 — Инструмент Offset (Эквидистанта / Подобие)
// ═══════════════════════════════════════════════════════════════
// Создаёт копию выделенного объекта, смещённую на заданное расстояние
// (как "Подобие" / "Эквидистанта" в КОМПАС-3D).
//
// Поддерживаемые типы объектов:
//   - line      → параллельная линия на расстоянии
//   - circle    → концентрический круг (radius ± distance)
//   - arc       → концентрическая дуга (radius ± distance)
//   - rect      → прямоугольник, расширенный/суженный на distance
//   - polygon   → полигон, смещённый по нормали каждой стороны (упрощённо)
//   - polyline  → полилиния, смещённая по нормали каждого сегмента
//
// Рабочий процесс:
//   1. Пользователь выделяет объект
//   2. Нажимает кнопку Offset (или клавишу O)
//   3. Вводит расстояние (prompt, по умолчанию 5мм)
//   4. Клик на холсте — определяет направление смещения (внутрь/наружу)
//   5. Создаётся новый объект, выделяется, старый снимается с выделения
// ═══════════════════════════════════════════════════════════════

(function() {
'use strict';

// Состояние инструмента offset
let offsetMode = false;       // активен ли режим offset
let offsetDistance = 5;       // расстояние смещения (мм)
let offsetSourceObj = null;   // исходный объект для offset

window.offsetMode = offsetMode;
window.offsetDistance = offsetDistance;
window.offsetSourceObj = offsetSourceObj;

/**
 * Активировать инструмент Offset.
 * v1.5: Offset применяется СРАЗУ после prompt — без дополнительного клика.
 * Для замкнутых контуров: плюс = наружу, минус = внутрь.
 * Для линий: плюс = вправо от направления линии, минус = влево.
 */
window.activateOffsetTool = function() {
    let selObjs = [];
    if (typeof selectedObjects !== 'undefined' && selectedObjects && selectedObjects.length > 0) {
        selObjs = selectedObjects;
    } else if (typeof window.selectedObjects !== 'undefined' && window.selectedObjects && window.selectedObjects.length > 0) {
        selObjs = window.selectedObjects;
    }

    if (selObjs.length === 0) {
        const msg = '⚠️ Выделите объект для создания эквидистанты';
        if (typeof showError === 'function') {
            showError(msg);
        } else {
            alert(msg);
        }
        return;
    }

    const supportedTypes = ['line', 'circle', 'arc', 'rect', 'polygon', 'polyline', 'lwpolyline'];
    const validObjs = selObjs.filter(o => o && supportedTypes.includes(o.type));
    if (validObjs.length === 0) {
        alert(`⚠️ Нет поддерживаемых объектов.\nПоддерживаются: ${supportedTypes.join(', ')}`);
        return;
    }

    // Запрашиваем расстояние
    const lastDist = localStorage.getItem('lastOffsetDistance') || '5';
    const distStr = prompt('Расстояние эквидистанты (мм):\n  плюс — наружу (увеличение)\n  минус — внутрь (уменьшение)', lastDist);
    if (!distStr) return;
    const dist = parseFloat(distStr);
    if (isNaN(dist) || dist === 0) {
        alert('⚠️ Расстояние должно быть числом (не ноль).\nПримеры: 5, -3, 10');
        return;
    }
    offsetDistance = dist;
    localStorage.setItem('lastOffsetDistance', String(dist));

    // v1.5: СРАЗУ создаём offset для всех выделенных объектов.
    if (typeof window.saveState === 'function') {
        window.saveState();
    }

    // v4.97: Группируем выделенные линии и арки в связанные контуры.
    // Если несколько линий/дуг образуют замкнутый/незамкнутый контур (общие концы),
    // offset применяется к контуру целиком — сегменты соединяются на углах.
    // Арки сохраняются как арки (не аппроксимируются ломаной).
    const TOL = 0.5; // допуск сопоставления вершин (мм)
    const contourObjs = validObjs.filter(o => o.type === 'line' || o.type === 'arc');
    const standaloneObjs = validObjs.filter(o => o.type !== 'line' && o.type !== 'arc');
    const newObjs = [];

    // Offset одиночных объектов (circle, rect, polygon, polyline) — по одному
    for (const obj of standaloneObjs) {
        const newObj = createOffsetObject(obj, Math.abs(dist), dist > 0 ? 1 : -1);
        if (newObj) {
            if (typeof objects !== 'undefined') objects.push(newObj);
            newObjs.push(newObj);
        }
    }

    // Группировка линий и арок в контуры по общим концам
    const contours = groupSegmentsIntoContours(contourObjs, TOL);

    for (const contour of contours) {
        if (contour.length === 1) {
            // Одиночный сегмент — простой offset
            const newObj = createOffsetObject(contour[0], Math.abs(dist), dist > 0 ? 1 : -1);
            if (newObj) {
                if (typeof objects !== 'undefined') objects.push(newObj);
                newObjs.push(newObj);
            }
        } else {
            // Контур из нескольких сегментов — offset с соединением на стыках
            const offsetSegs = offsetContourWithArcs(contour, Math.abs(dist), dist > 0 ? 1 : -1, TOL);
            for (const seg of offsetSegs) {
                if (typeof objects !== 'undefined') objects.push(seg);
                newObjs.push(seg);
            }
        }
    }

    // Снимаем выделение со старых, выделяем новые
    if (typeof selectedObjects !== 'undefined') {
        selectedObjects.length = 0;
        for (const no of newObjs) selectedObjects.push(no);
    }
    if (typeof window !== 'undefined') {
        window.selectedObjects = selectedObjects;
    }

    // Если редактируем деталь — обновляем bounds
    if (typeof isEditingPart !== 'undefined' && isEditingPart &&
        typeof editingPartId !== 'undefined' && editingPartId !== null &&
        typeof parts !== 'undefined' && typeof updatePartBounds === 'function') {
        const part = parts.find(p => samePartId(p.id, editingPartId));
        if (part) updatePartBounds(part);
    }

    if (typeof window.render === 'function') {
        window.render();
    }
    if (typeof updateObjectsList === 'function') {
        updateObjectsList();
    }
};

/**
 * Создаёт смещённый объект.
 * @param {Object} obj — исходный объект
 * @param {number} dist — расстояние смещения
 * @param {number} direction — 1 (наружу) или -1 (внутрь)
 * @returns {Object|null} новый объект
 */
function createOffsetObject(obj, dist, direction) {
    const sign = direction; // 1 или -1

    if (obj.type === 'line') {
        // Параллельная линия: смещаем по нормали
        const dx = obj.x2 - obj.x1;
        const dy = obj.y2 - obj.y1;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) return null;
        // Нормаль (повёрнута на 90°): (-dy, dx) / len
        const nx = -dy / len;
        const ny = dx / len;
        const offset = dist * sign;
        const newLine = new Line(
            obj.x1 + nx * offset,
            obj.y1 + ny * offset,
            obj.x2 + nx * offset,
            obj.y2 + ny * offset
        );
        newLine.color = obj.color || '#00aadd';
        return newLine;
    }

    if (obj.type === 'circle') {
        const newR = obj.radius + dist * sign;
        if (newR <= 0.1) return null; // вырожденный
        const newCircle = new Circle(obj.cx, obj.cy, newR);
        newCircle.color = obj.color || '#00aadd';
        return newCircle;
    }

    if (obj.type === 'arc') {
        const newR = obj.radius + dist * sign;
        if (newR <= 0.1) return null;
        // Arc — function-конструктор из dxf-import.js
        const newArc = new Arc(obj.cx, obj.cy, newR, obj.startAngle, obj.endAngle, obj.direction);
        newArc.id = Date.now() + Math.random();
        newArc.color = obj.color || '#00aadd';
        return newArc;
    }

    if (obj.type === 'rect') {
        // v1.2: Прямоугольник — расширяем/сужаем на dist с каждой стороны.
        // Нормализуем width/height (могут быть отрицательными если рисовался справа-налево).
        const w = Math.abs(obj.width);
        const h = Math.abs(obj.height);
        const minX = Math.min(obj.x, obj.x + obj.width);
        const minY = Math.min(obj.y, obj.y + obj.height);
        const offset = dist * sign; // sign: 1 = наружу, -1 = внутрь
        const newW = w + 2 * offset;
        const newH = h + 2 * offset;
        if (newW <= 0.1 || newH <= 0.1) return null;
        const newX = minX - offset;
        const newY = minY - offset;
        const newRect = new Rect(newX, newY, newW, newH);
        newRect.color = obj.color || '#00aadd';
        return newRect;
    }

    if (obj.type === 'polygon') {
        // Полигон: смещаем каждую вершину по нормали ближайшего ребра
        // (упрощённая реализация — для выпуклых полигонов работает корректно)
        const vertices = (typeof obj.getVertices === 'function') ? obj.getVertices() : (obj.points || []);
        if (vertices.length < 3) return null;
        const newPts = offsetPolygonVertices(vertices, dist * sign, obj.closed !== false);
        if (!newPts) return null;
        const newObj = new CustomPolygon(newPts, obj.closed !== false);
        newObj.color = obj.color || '#00aadd';
        return newObj;
    }

    if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        // v1.6: Сохраняем bulge при offset — дуги не теряются!
        // Раньше создавали CustomPolygon → теряли все закругления.
        // Теперь: смещаем каждую вершину + сохраняем (не инвертируем) bulge.
        // Bulge НЕ меняется при offset — дуга просто становится больше/меньше
        // (радиус меняется за счёт смещения центра, но направление дуги то же).
        const pts = obj.points || obj.vertices || [];
        if (pts.length < 2) return null;
        const closed = obj.closed === true;
        const newPts = offsetPolygonVertices(pts, dist * sign, closed);
        if (!newPts) return null;
        // Сохраняем bulge из исходных точек
        for (let i = 0; i < newPts.length && i < pts.length; i++) {
            if (typeof pts[i].bulge === 'number') {
                newPts[i].bulge = pts[i].bulge;  // bulge сохраняется (дуга та же, только смещена)
            }
        }
        // Создаём полилинию (не CustomPolygon) для сохранения bulge
        const newObj = {
            type: obj.type,
            points: newPts,
            closed: closed,
            id: Date.now() + Math.random(),
            color: obj.color || '#00aadd'
        };
        // Добавляем draw-методы через addPolylineDrawMethods если доступно
        if (typeof addPolylineDrawMethods === 'function') {
            addPolylineDrawMethods(newObj);
        } else {
            newObj.draw = function(ctx) {
                if (!this.points || this.points.length < 2) return;
                ctx.strokeStyle = this.color || '#00aadd';
                ctx.beginPath();
                ctx.moveTo(this.points[0].x, this.points[0].y);
                for (let i = 1; i < this.points.length; i++) {
                    ctx.lineTo(this.points[i].x, this.points[i].y);
                }
                if (this.closed) ctx.closePath();
                ctx.stroke();
            };
        }
        return newObj;
    }

    return null;
}

/**
 * Получает начальную точку сегмента (линия или арка).
 */
function getSegStart(seg) {
    if (seg.type === 'line') return { x: seg.x1, y: seg.y1 };
    if (seg.type === 'arc') return seg.getStartPoint();
    return null;
}

/**
 * Получает конечную точку сегмента (линия или арка).
 */
function getSegEnd(seg) {
    if (seg.type === 'line') return { x: seg.x2, y: seg.y2 };
    if (seg.type === 'arc') return seg.getEndPoint();
    return null;
}

/**
 * Группирует линии и арки в связанные контуры по общим концам.
 * @param {Array} segments — массив объектов Line/Arc
 * @param {number} tol — допуск сопоставления (мм)
 * @returns {Array} массив контуров (каждый контур — массив сегментов)
 */
function groupSegmentsIntoContours(segments, tol) {
    if (segments.length === 0) return [];
    const used = new Array(segments.length).fill(false);
    const contours = [];

    function ptKey(x, y) {
        return Math.round(x / tol) + ',' + Math.round(y / tol);
    }

    // Индекс: ключ точки → массив индексов сегментов
    const ptIndex = new Map();
    for (let i = 0; i < segments.length; i++) {
        const sp = getSegStart(segments[i]);
        const ep = getSegEnd(segments[i]);
        const k1 = ptKey(sp.x, sp.y);
        const k2 = ptKey(ep.x, ep.y);
        if (!ptIndex.has(k1)) ptIndex.set(k1, []);
        if (!ptIndex.has(k2)) ptIndex.set(k2, []);
        ptIndex.get(k1).push(i);
        ptIndex.get(k2).push(i);
    }

    for (let start = 0; start < segments.length; start++) {
        if (used[start]) continue;
        const contour = [];
        const queue = [start];
        used[start] = true;

        while (queue.length > 0) {
            const idx = queue.shift();
            contour.push(segments[idx]);
            for (const endPt of [getSegStart(segments[idx]), getSegEnd(segments[idx])]) {
                const key = ptKey(endPt.x, endPt.y);
                const neighbors = ptIndex.get(key) || [];
                for (const ni of neighbors) {
                    if (!used[ni]) {
                        used[ni] = true;
                        queue.push(ni);
                    }
                }
            }
        }
        contours.push(contour);
    }
    return contours;
}

/**
 * Упорядочивает сегменты (линии и арки) в цепочку.
 * Переставляет и реверсирует сегменты так, чтобы конец одного
 * совпадал с началом следующего.
 * @param {Array} segments — массив Line/Arc
 * @param {number} tol — допуск
 * @returns {Array} упорядоченный массив сегментов (реверсированные арки помечены)
 */
function orderSegments(segments, tol) {
    if (segments.length <= 1) return segments.slice();

    const used = new Array(segments.length).fill(false);
    const ordered = [];

    // Начинаем с первого сегмента
    used[0] = true;
    ordered.push({ seg: segments[0], reversed: false });

    let changed = true;
    while (changed) {
        changed = false;
        const last = ordered[ordered.length - 1];
        const lastEnd = last.reversed ? getSegStart(last.seg) : getSegEnd(last.seg);

        for (let i = 0; i < segments.length; i++) {
            if (used[i]) continue;
            const seg = segments[i];
            const sp = getSegStart(seg);
            const ep = getSegEnd(seg);

            // start seg совпадает с end last?
            if (Math.hypot(sp.x - lastEnd.x, sp.y - lastEnd.y) < tol) {
                ordered.push({ seg: seg, reversed: false });
                used[i] = true;
                changed = true;
                break;
            }
            // end seg совпадает с end last? → реверс
            if (Math.hypot(ep.x - lastEnd.x, ep.y - lastEnd.y) < tol) {
                ordered.push({ seg: seg, reversed: true });
                used[i] = true;
                changed = true;
                break;
            }
        }
    }

    // Неиспользованные сегменты добавляем как есть
    for (let i = 0; i < segments.length; i++) {
        if (!used[i]) ordered.push({ seg: segments[i], reversed: false });
    }

    return ordered;
}

/**
 * Создаёт смещённую версию одного сегмента (линия или арка).
 * @param {Object} seg — линия или арка
 * @param {number} dist — расстояние смещения (со знаком)
 * @param {boolean} reversed — реверсирован ли сегмент в цепочке
 * @returns {Object} смещённый сегмент
 */
function offsetSingleSegment(seg, dist, reversed) {
    if (seg.type === 'line') {
        const dx = seg.x2 - seg.x1;
        const dy = seg.y2 - seg.y1;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) return null;
        // Правая нормаль (dy, -dx) / len
        const nx = dy / len;
        const ny = -dx / len;
        const ox = nx * dist;
        const oy = ny * dist;
        const newLine = new Line(
            seg.x1 + ox, seg.y1 + oy,
            seg.x2 + ox, seg.y2 + oy
        );
        newLine.color = seg.color || '#00aadd';
        return newLine;
    }

    if (seg.type === 'arc') {
        // Концентрическая дуга: радиус меняется, центр тот же
        // Для CCW дуги: dist > 0 = наружу (радиус +), dist < 0 = внутрь (радиус -)
        // Для CW дуги: наоборот — нужно инвертировать
        let actualDist = dist;
        if (seg.direction === 'CW') actualDist = -dist;
        const newR = seg.radius + actualDist;
        if (newR <= 0.1) return null;
        const newArc = new Arc(seg.cx, seg.cy, newR, seg.startAngle, seg.endAngle, seg.direction);
        newArc.id = Date.now() + Math.random();
        newArc.color = seg.color || '#00aadd';
        return newArc;
    }

    return null;
}

/**
 * Находит точку пересечения двух смещённых сегментов.
 * Возвращает {x, y} или null.
 * @param {Object} seg1 — первый смещённый сегмент
 * @param {Object} seg2 — второй смещённый сегмент
 * @param {{x,y}} hint — примерная точка стыка (для выбора решения)
 */
function intersectOffsetSegments(seg1, seg2, hint) {
    const t1 = seg1.type;
    const t2 = seg2.type;

    // ── Линия-Линия ──
    if (t1 === 'line' && t2 === 'line') {
        return intersectLines(
            seg1.x1, seg1.y1, seg1.x2, seg1.y2,
            seg2.x1, seg2.y1, seg2.x2, seg2.y2
        );
    }

    // ── Линия-Арка ──
    if (t1 === 'line' && t2 === 'arc') {
        const pts = intersectLineCircle(
            seg1.x1, seg1.y1, seg1.x2, seg1.y2,
            seg2.cx, seg2.cy, seg2.radius
        );
        return pickClosest(pts, hint);
    }
    if (t1 === 'arc' && t2 === 'line') {
        const pts = intersectLineCircle(
            seg2.x1, seg2.y1, seg2.x2, seg2.y2,
            seg1.cx, seg1.cy, seg1.radius
        );
        return pickClosest(pts, hint);
    }

    // ── Арка-Арка ──
    if (t1 === 'arc' && t2 === 'arc') {
        const pts = intersectCircles(
            seg1.cx, seg1.cy, seg1.radius,
            seg2.cx, seg2.cy, seg2.radius
        );
        return pickClosest(pts, hint);
    }

    return null;
}

function pickClosest(pts, hint) {
    if (!pts || pts.length === 0) return null;
    if (pts.length === 1) return pts[0];
    let best = pts[0], bestD = Math.hypot(pts[0].x - hint.x, pts[0].y - hint.y);
    for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i].x - hint.x, pts[i].y - hint.y);
        if (d < bestD) { best = pts[i]; bestD = d; }
    }
    return best;
}

function intersectLines(x1, y1, x2, y2, x3, y3, x4, y4) {
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(d) < 0.0001) return null; // параллельны
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

function intersectLineCircle(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const fx = x1 - cx, fy = y1 - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return [];
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a);
    const t2 = (-b + sq) / (2 * a);
    const pts = [];
    if (t1 >= -0.5 && t1 <= 1.5) pts.push({ x: x1 + t1 * dx, y: y1 + t1 * dy });
    if (t2 >= -0.5 && t2 <= 1.5) pts.push({ x: x1 + t2 * dx, y: y1 + t2 * dy });
    return pts;
}

function intersectCircles(cx1, cy1, r1, cx2, cy2, r2) {
    const d = Math.hypot(cx2 - cx1, cy2 - cy1);
    if (d > r1 + r2 + 0.01 || d < Math.abs(r1 - r2) - 0.01 || d < 0.001) return [];
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h2 = r1 * r1 - a * a;
    if (h2 < 0) return [];
    const h = Math.sqrt(h2);
    const px = cx1 + a * (cx2 - cx1) / d;
    const py = cy1 + a * (cy2 - cy1) / d;
    const rx = -(cy2 - cy1) * (h / d);
    const ry = (cx2 - cx1) * (h / d);
    return [{ x: px + rx, y: py + ry }, { x: px - rx, y: py - ry }];
}

/**
 * Offset контура из линий и арок.
 * Сохраняет арки как арки — не аппроксимирует ломаной.
 * Алгоритм:
 *   1. Упорядочить сегменты в цепочку
 *   2. Создать смещённую версию каждого сегмента
 *   3. На стыках найти точку пересечения смещённых сегментов
 *   4. Обрезать/удлинить смещённые сегменты до точек пересечения
 * @param {Array} segments — массив Line/Arc (связанный контур)
 * @param {number} dist — расстояние смещения
 * @param {number} direction — 1 (наружу) или -1 (внутрь)
 * @param {number} tol — допуск
 * @returns {Array} массив новых сегментов
 */
function offsetContourWithArcs(segments, dist, direction, tol) {
    const ordered = orderSegments(segments, tol);
    const n = ordered.length;
    if (n === 0) return [];

    // Определяем замкнутость
    const realFirstStart = ordered[0].reversed ? getSegEnd(ordered[0].seg) : getSegStart(ordered[0].seg);
    const realLastEnd = ordered[n - 1].reversed ? getSegStart(ordered[n - 1].seg) : getSegEnd(ordered[n - 1].seg);
    const closed = n > 1 && Math.hypot(realFirstStart.x - realLastEnd.x, realFirstStart.y - realLastEnd.y) < tol;

    // Определяем направление обхода (signed area) для замкнутых контуров
    let signFlip = 1;
    if (closed) {
        let signedArea = 0;
        for (let i = 0; i < n; i++) {
            const item = ordered[i];
            const sp = item.reversed ? getSegEnd(item.seg) : getSegStart(item.seg);
            const ep = item.reversed ? getSegStart(item.seg) : getSegEnd(item.seg);
            // Для арок аппроксимируем прямой (хватит для определения CCW/CW)
            signedArea += sp.x * ep.y - ep.x * sp.y;
        }
        signedArea /= 2;
        // signedArea > 0 → CCW → правая нормаль = наружу
        // signedArea < 0 → CW → нужно инвертировать
        if (signedArea < 0) signFlip = -1;
    }

    const actualDist = dist * direction * signFlip;

    // Создаём смещённые версии каждого сегмента
    const offsetSegs = [];
    for (let i = 0; i < n; i++) {
        const item = ordered[i];
        const offSeg = offsetSingleSegment(item.seg, actualDist, item.reversed);
        offsetSegs.push(offSeg);
    }

    // Соединяем на стыках: для каждого стыка i → i+1 находим точку пересечения
    // и обрезаем/удлиняем оба сегмента
    const numJoints = closed ? n : n - 1;
    for (let i = 0; i < numJoints; i++) {
        const nextIdx = (i + 1) % n;
        const seg1 = offsetSegs[i];
        const seg2 = offsetSegs[nextIdx];
        if (!seg1 || !seg2) continue;

        // Точка стыка (оригинальная) — для подсказки при выборе решения
        const item1 = ordered[i];
        const jointHint = item1.reversed ? getSegStart(item1.seg) : getSegEnd(item1.seg);

        const ip = intersectOffsetSegments(seg1, seg2, jointHint);
        if (!ip) continue;

        // Обновляем концы сегментов
        // seg1: конец → ip
        if (seg1.type === 'line') {
            seg1.x2 = ip.x;
            seg1.y2 = ip.y;
        } else if (seg1.type === 'arc') {
            // Обновляем угол конца (или начала, если реверсирован)
            const item = ordered[i];
            if (item.reversed) {
                seg1.startAngle = Math.atan2(ip.y - seg1.cy, ip.x - seg1.cx);
            } else {
                seg1.endAngle = Math.atan2(ip.y - seg1.cy, ip.x - seg1.cx);
            }
        }

        // seg2: начало → ip
        if (seg2.type === 'line') {
            seg2.x1 = ip.x;
            seg2.y1 = ip.y;
        } else if (seg2.type === 'arc') {
            const item2 = ordered[nextIdx];
            if (item2.reversed) {
                seg2.endAngle = Math.atan2(ip.y - seg2.cy, ip.x - seg2.cx);
            } else {
                seg2.startAngle = Math.atan2(ip.y - seg2.cy, ip.x - seg2.cx);
            }
        }
    }

    // Для незамкнутого контура — обрезаем свободные концы по ближайшим точкам
    // (начала первого и конца последнего уже установлены при offset)
    // Ничего не делаем — они уже корректны

    return offsetSegs.filter(s => s !== null);
}

/**
 * Смещает вершины полигона/полилинии на заданное расстояние.
 * Для каждой вершины вычисляет нормаль как среднее нормалей двух соседних рёбер.
 * @param {Array} vertices — [{x,y}, ...]
 * @param {number} offset — смещение (может быть отрицательным)
 * @param {boolean} closed — замкнут ли контур
 * @returns {Array|null} новые вершины
 */
function offsetPolygonVertices(vertices, offset, closed) {
    const n = vertices.length;
    if (n < 2) return null;
    const result = [];

    for (let i = 0; i < n; i++) {
        const p = vertices[i];
        const prev = closed ? vertices[(i - 1 + n) % n] : vertices[Math.max(0, i - 1)];
        const next = closed ? vertices[(i + 1) % n] : vertices[Math.min(n - 1, i + 1)];

        // Нормаль предыдущего ребра (prev → p)
        const dx1 = p.x - prev.x;
        const dy1 = p.y - prev.y;
        const len1 = Math.hypot(dx1, dy1);
        if (len1 < 0.001) {
            result.push({ x: p.x, y: p.y });
            continue;
        }
        // Нормаль правая (повёрнута на -90°): (dy, -dx) / len — для CCW контура наружу
        // Нормаль левая: (-dy, dx) / len — для CW контура наружу
        // Используем правую нормаль (стандартная для CCW)
        const n1x = dy1 / len1;
        const n1y = -dx1 / len1;

        // Нормаль следующего ребра (p → next)
        const dx2 = next.x - p.x;
        const dy2 = next.y - p.y;
        const len2 = Math.hypot(dx2, dy2);
        if (len2 < 0.001) {
            result.push({ x: p.x + n1x * offset, y: p.y + n1y * offset });
            continue;
        }
        const n2x = dy2 / len2;
        const n2y = -dx2 / len2;

        // Средняя нормаль (биссектриса)
        let bx = (n1x + n2x) / 2;
        let by = (n1y + n2y) / 2;
        const bLen = Math.hypot(bx, by);
        if (bLen < 0.001) {
            bx = n1x; by = n1y;
        } else {
            bx /= bLen; by /= bLen;
        }

        // Корректируем длину смещения для угловых вершин (miter join)
        // dot = cos(half_angle), scale = 1/dot
        const dot = n1x * bx + n1y * by;
        const scale = Math.abs(dot) > 0.001 ? 1 / dot : 1;
        const finalOffset = offset * (scale > 5 ? 5 : scale); // ограничиваем miter

        result.push({ x: p.x + bx * finalOffset, y: p.y + by * finalOffset });
    }
    return result;
}

/**
 * Point-in-polygon test (ray casting).
 */
function pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, yi = pts[i].y;
        const xj = pts[j].x, yj = pts[j].y;
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Находит ближайший к точке сегмент полилинии.
 */
function findClosestSegment(x, y, pts) {
    let minDist = Infinity;
    let closest = null;
    for (let i = 0; i < pts.length - 1; i++) {
        const d = pointToSegmentDistance(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        if (d < minDist) {
            minDist = d;
            closest = { p1: pts[i], p2: pts[i + 1] };
        }
    }
    return closest;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Горячая клавиша O обрабатывается в keyboard-events.js (v3.38+)
// Escape — отмена offset
window.addEventListener('keydown', (e) => {
    // Escape — отмена offset
    if (e.key === 'Escape' && offsetMode) {
        window.deactivateOffsetTool();
        console.log('📐 [OFFSET] Отменён');
    }
});

console.log('✅ offset-tool.js загружен (v1.0) — Offset/Подобие: выделите объект → O → клик для направления');

})();
