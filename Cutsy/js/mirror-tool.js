// ═══════════════════════════════════════════════════════════════
// mirror-tool.js — v1.0 — Инструмент Отражение (Симметрия по линии)
// ═══════════════════════════════════════════════════════════════
// Создаёт зеркальную копию выделенных объектов относительно линии,
// заданной двумя кликами (как "Симметрия" в КОМПАС-3D).
//
// Рабочий процесс:
//   1. Пользователь выделяет объект(ы)
//   2. Нажимает кнопку Mirror (или клавишу M)
//   3. Первый клик — первая точка линии отражения
//   4. Второй клик — вторая точка линии отражения
//   5. Создаются зеркальные копии, выделяются, старые снимаются
//
// Поддерживаемые типы: line, circle, arc, rect, polygon, polyline.
// Для дуг углы инвертируются (start↔end), direction меняется.
// ═══════════════════════════════════════════════════════════════

(function() {
'use strict';

let mirrorMode = false;        // активен ли режим mirror
let mirrorSourceObjs = [];     // исходные объекты для отражения
let mirrorPoint1 = null;       // первая точка линии отражения
let mirrorPoint2 = null;       // вторая точка линии отражения
let mousePos = null;           // текущая позиция мыши (для предпросмотра)

window.mirrorMode = mirrorMode;
window.mirrorSourceObjs = mirrorSourceObjs;

/**
 * Активировать режим Mirror (Симметрия).
 * Требует выделенных объектов.
 */
window.activateMirrorTool = function() {
    // v1.3: используем selectedObjects (локальный) ПЕРВЫМ — он актуальный.
    // window.selectedObjects может быть рассинхронизирован (keyboard-events
    // делает selectedObjects = [] — reassign, ломает ссылку window→local).
    let selObjs = [];
    if (typeof selectedObjects !== 'undefined' && selectedObjects && selectedObjects.length > 0) {
        selObjs = selectedObjects;
    } else if (typeof window.selectedObjects !== 'undefined' && window.selectedObjects && window.selectedObjects.length > 0) {
        selObjs = window.selectedObjects;
    }

    if (selObjs.length === 0) {
        const msg = '⚠️ Выделите объекты для отражения';
        if (typeof showError === 'function') {
            showError(msg);
        } else {
            alert(msg);
        }
        return;
    }

    // Проверяем поддерживаемые типы
    const supportedTypes = ['line', 'circle', 'arc', 'rect', 'polygon', 'polyline', 'lwpolyline', 'text'];

    mirrorSourceObjs = selObjs.filter(o => o && supportedTypes.includes(o.type));
    if (mirrorSourceObjs.length === 0) {
        alert('⚠️ Нет поддерживаемых объектов для отражения.\nПоддерживаются: ' + supportedTypes.join(', '));
        return;
    }

    mirrorMode = true;
    window.mirrorMode = true;
    window.mirrorSourceObjs = mirrorSourceObjs;
    mirrorPoint1 = null;
    mirrorPoint2 = null;
    mousePos = null;

    if (typeof canvas !== 'undefined' && canvas) {
        canvas.style.cursor = 'crosshair';
    }
};

/**
 * Деактивировать режим Mirror.
 */
window.deactivateMirrorTool = function() {
    mirrorMode = false;
    window.mirrorMode = false;
    window.mirrorSourceObjs = [];
    mirrorSourceObjs = [];
    mirrorPoint1 = null;
    mirrorPoint2 = null;
    mousePos = null;

    // v4.97: Снимаем подсветку кнопки
    const mirrorBtn = document.getElementById('mirrorToolBtn');
    if (mirrorBtn) mirrorBtn.classList.remove('active');

    if (typeof canvas !== 'undefined' && canvas) {
        canvas.style.cursor = '';
    }
    if (typeof window.render === 'function') {
        window.render();
    }
};

/**
 * Применяет ортогональную привязку (Shift) к точке относительно p1.
 * Если Shift нажат — snaps к ближайшей оси (горизонталь/вертикаль).
 * @param {{x,y}} p1 — опорная точка
 * @param {number} x — X мыши
 * @param {number} y — Y мыши
 * @returns {{x,y}} — скорректированная точка
 */
function applyOrthoSnap(p1, x, y) {
    if (typeof isShiftPressed !== 'undefined' && isShiftPressed) {
        const dx = Math.abs(x - p1.x);
        const dy = Math.abs(y - p1.y);
        // Snap к ближайшей оси
        if (dx > dy) {
            return { x: x, y: p1.y }; // горизонталь
        } else {
            return { x: p1.x, y: y }; // вертикаль
        }
    }
    return { x: x, y: y };
}

/**
 * Обработка клика в режиме Mirror.
 * @param {number} clickX — X клика в мировых координатах
 * @param {number} clickY — Y клика в мировых координатах
 * @returns {boolean} true если обработано
 */
window.handleMirrorClick = function(clickX, clickY) {
    if (!mirrorMode || mirrorSourceObjs.length === 0) return false;

    if (!mirrorPoint1) {
        // Первый клик — первая точка линии
        mirrorPoint1 = { x: clickX, y: clickY };
        return true;
    }

    // Второй клик — применяем ortho snap если Shift нажат
    const snapped = applyOrthoSnap(mirrorPoint1, clickX, clickY);
    mirrorPoint2 = { x: snapped.x, y: snapped.y };

    // Проверяем что линия не вырождена
    const dx = mirrorPoint2.x - mirrorPoint1.x;
    const dy = mirrorPoint2.y - mirrorPoint1.y;
    const lineLen = Math.hypot(dx, dy);
    if (lineLen < 0.5) {
        mirrorPoint1 = null;
        mirrorPoint2 = null;
        return true;
    }

    // Создаём зеркальные копии
    if (typeof window.saveState === 'function') {
        window.saveState();
    }

    const newObjs = [];
    for (const obj of mirrorSourceObjs) {
        const newObj = createMirroredObject(obj, mirrorPoint1, mirrorPoint2);
        if (newObj) {
            if (typeof objects !== 'undefined') {
                objects.push(newObj);
            }
            newObjs.push(newObj);
        }
    }

    // Снимаем выделение со старых, выделяем новые.
    // v1.3: обновляем BOTH selectedObjects и window.selectedObjects in-place.
    // НЕ делаем reassign (selectedObjects = ...) — это ломает ссылку.
    if (typeof selectedObjects !== 'undefined') {
        selectedObjects.length = 0;
        for (const no of newObjs) selectedObjects.push(no);
    }
    // Синхронизируем window.selectedObjects (на случай если ссылка сломана)
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

    window.deactivateMirrorTool();

    if (typeof window.render === 'function') {
        window.render();
    }
    if (typeof updateObjectsList === 'function') {
        updateObjectsList();
    }

    console.log(`✅ [MIRROR] Создано отражений: ${newObjs.length}`);
    return true;
};

/**
 * Обработка движения мыши в режиме Mirror (для предпросмотра линии).
 * @param {number} mx — X мыши в мировых координатах
 * @param {number} my — Y мыши в мировых координатах
 * @returns {boolean} true если обработано
 */
window.handleMirrorMouseMove = function(mx, my) {
    if (!mirrorMode) return false;
    // v1.1: применяем ortho snap если Shift нажат и есть p1
    if (mirrorPoint1) {
        const snapped = applyOrthoSnap(mirrorPoint1, mx, my);
        mousePos = { x: snapped.x, y: snapped.y };
    } else {
        mousePos = { x: mx, y: my };
    }
    if (typeof window.render === 'function') {
        window.render();
    }
    return true;
};

/**
 * Рисует линию отражения и предпросмотр (вызывается из render.js).
 * @param {CanvasRenderingContext2D} ctx
 */
window.drawMirrorOverlay = function(ctx) {
    if (!mirrorMode) return;
    if (!mirrorPoint1) return;

    ctx.save();
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2 / (typeof zoom !== 'undefined' ? zoom : 1);
    ctx.setLineDash([8 / (typeof zoom !== 'undefined' ? zoom : 1), 4 / (typeof zoom !== 'undefined' ? zoom : 1)]);

    // Линия от p1 к мыши (или к p2 если уже есть)
    const endPt = mirrorPoint2 || mousePos;
    if (endPt) {
        ctx.beginPath();
        ctx.moveTo(mirrorPoint1.x, mirrorPoint1.y);
        ctx.lineTo(endPt.x, endPt.y);
        ctx.stroke();
    }

    // Точка p1
    ctx.fillStyle = '#ff9800';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(mirrorPoint1.x, mirrorPoint1.y, 4 / (typeof zoom !== 'undefined' ? zoom : 1), 0, Math.PI * 2);
    ctx.fill();

    // Точка p2 (если есть)
    if (mirrorPoint2) {
        ctx.beginPath();
        ctx.arc(mirrorPoint2.x, mirrorPoint2.y, 4 / (typeof zoom !== 'undefined' ? zoom : 1), 0, Math.PI * 2);
        ctx.fill();
    }

    // Предпросмотр отражённых объектов (полупрозрачные)
    if (mousePos && !mirrorPoint2) {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#ff9800';
        for (const obj of mirrorSourceObjs) {
            const preview = createMirroredObject(obj, mirrorPoint1, mousePos);
            if (preview && typeof preview.draw === 'function') {
                preview.draw(ctx);
            }
        }
        ctx.globalAlpha = 1;
    }

    ctx.restore();
};

/**
 * Создаёт зеркальную копию объекта относительно линии (p1, p2).
 * @param {Object} obj — исходный объект
 * @param {{x,y}} p1 — первая точка линии отражения
 * @param {{x,y}} p2 — вторая точка линии отражения
 * @returns {Object|null} новый объект
 */
function createMirroredObject(obj, p1, p2) {
    if (!obj) return null;

    // Функция отражения точки относительно линии p1→p2
    const reflectPoint = (px, py) => {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 0.001) return { x: px, y: py };
        // Вектор от p1 к точке
        const vx = px - p1.x;
        const vy = py - p1.y;
        // Проекция на линию
        const t = (vx * dx + vy * dy) / lenSq;
        // Проекция точки на линию
        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;
        // Отражение: точка = проекция + (проекция - точка) = 2*проекция - точка
        return { x: 2 * projX - px, y: 2 * projY - py };
    };

    if (obj.type === 'line') {
        const p1n = reflectPoint(obj.x1, obj.y1);
        const p2n = reflectPoint(obj.x2, obj.y2);
        const newLine = new Line(p1n.x, p1n.y, p2n.x, p2n.y);
        newLine.color = obj.color || '#00aadd';
        return newLine;
    }

    if (obj.type === 'circle') {
        const c = reflectPoint(obj.cx, obj.cy);
        const newCircle = new Circle(c.x, c.y, obj.radius);
        newCircle.color = obj.color || '#00aadd';
        return newCircle;
    }

    if (obj.type === 'arc') {
        // v1.6: Корректное отражение дуги для ПРОИЗВОЛЬНОЙ линии отражения.
        // Раньше просто меняли start↔end + direction — это работало только
        // для осевого зеркала. Теперь: отражаем start/end точки, вычисляем
        // новые углы от зеркального центра.
        const c = reflectPoint(obj.cx, obj.cy);
        const r = Math.abs(obj.radius || 0);
        if (r < 0.001) return null;

        // Получаем start/end точки оригинальной дуги
        const origStartX = obj.cx + Math.cos(obj.startAngle) * r;
        const origStartY = obj.cy + Math.sin(obj.startAngle) * r;
        const origEndX = obj.cx + Math.cos(obj.endAngle) * r;
        const origEndY = obj.cy + Math.sin(obj.endAngle) * r;

        // Отражаем точки
        const mirStart = reflectPoint(origStartX, origStartY);
        const mirEnd = reflectPoint(origEndX, origEndY);

        // Новые углы от зеркального центра к зеркальным точкам
        let newStartAngle = Math.atan2(mirStart.y - c.y, mirStart.x - c.x);
        let newEndAngle = Math.atan2(mirEnd.y - c.y, mirEnd.x - c.x);

        // Отражение всегда меняет направление: CCW ↔ CW
        const newDirection = obj.direction === 'CW' ? 'CCW' : 'CW';

        // Проверяем: sweep должен сохраниться
        // Оригинальный sweep
        let origSweep;
        if (obj.direction === 'CW') {
            origSweep = obj.startAngle - obj.endAngle;
        } else {
            origSweep = obj.endAngle - obj.startAngle;
        }
        if (origSweep < 0) origSweep += 2 * Math.PI;

        // Новый sweep
        let newSweep;
        if (newDirection === 'CW') {
            newSweep = newStartAngle - newEndAngle;
        } else {
            newSweep = newEndAngle - newStartAngle;
        }
        if (newSweep < 0) newSweep += 2 * Math.PI;

        // Если sweep не совпадает — меняем start/end местами
        if (Math.abs(newSweep - origSweep) > 0.1) {
            const tmp = newStartAngle;
            newStartAngle = newEndAngle;
            newEndAngle = tmp;
        }

        const newArc = new Arc(c.x, c.y, r, newStartAngle, newEndAngle, newDirection);
        newArc.id = Date.now() + Math.random();
        newArc.color = obj.color || '#00aadd';
        return newArc;
    }

    if (obj.type === 'rect') {
        // v1.1: ВСЕГДА создаём CustomPolygon (4 угла), а не Rect.
        // При отражении по диагонали прямоугольник поворачивается —
        // axis-aligned Rect не может это представить, размеры искажаются.
        // CustomPolygon сохраняет точную геометрию (включая поворот).
        const corners = [
            { x: obj.x, y: obj.y },
            { x: obj.x + obj.width, y: obj.y },
            { x: obj.x + obj.width, y: obj.y + obj.height },
            { x: obj.x, y: obj.y + obj.height }
        ];
        const reflected = corners.map(c => reflectPoint(c.x, c.y));
        // Проверяем что все координаты finite
        if (!reflected.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) {
            return null;
        }
        if (typeof CustomPolygon === 'undefined') {
            return null;
        }
        const newObj = new CustomPolygon(reflected, true);
        newObj.color = obj.color || '#00aadd';
        return newObj;
    }

    if (obj.type === 'polygon') {
        // Правильный многоугольник: отражаем центр, стороны сохраняются
        if (typeof obj.getVertices === 'function') {
            const verts = obj.getVertices();
            const reflectedVerts = verts.map(v => reflectPoint(v.x, v.y));
            const newPoly = new CustomPolygon(reflectedVerts, true);
            newPoly.color = obj.color || '#00aadd';
            return newPoly;
        }
        // Fallback для правильного Polygon (cx/cy/radius/sides)
        const c = reflectPoint(obj.cx, obj.cy);
        const newPoly = new Polygon(c.x, c.y, obj.radius, obj.sides);
        newPoly.color = obj.color || '#00aadd';
        return newPoly;
    }

    if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        // v1.6: Сохраняем bulge (инвертируем знак) — отражение меняет
        // направление дуги. Раньше создавали CustomPolygon → теряли дуги!
        const pts = obj.points || obj.vertices || [];
        if (pts.length < 2) return null;
        const reflectedPts = pts.map(p => {
            const newPt = reflectPoint(p.x, p.y);
            if (typeof p.bulge === 'number') {
                newPt.bulge = -p.bulge;  // Инверсия: отражение меняет направление дуги
            }
            return newPt;
        });
        // Создаём полилинию (не CustomPolygon) для сохранения bulge
        const newObj = {
            type: obj.type,
            points: reflectedPts,
            closed: obj.closed === true,
            id: Date.now() + Math.random(),
            color: obj.color || '#00aadd'
        };
        // Добавляем draw-методы (через addPolylineDrawMethods если доступно)
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

    // v1.2: Текст — отражаем позицию + инвертируем rotation
    if (obj.type === 'text') {
        const c = reflectPoint(obj.x, obj.y);
        if (typeof Text !== 'undefined') {
            const newObj = new Text(c.x, c.y, obj.text, obj.fontSize);
            newObj.color = obj.color;
            // Отражение = инверсия rotation
            newObj.rotation = -(obj.rotation || 0);
            return newObj;
        }
        return null;
    }

    return null;
}

// Escape — отмена mirror
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mirrorMode) {
        window.deactivateMirrorTool();
    }
});

console.log('✅ mirror-tool.js загружен (v1.0) — Отражение: выделите объекты → M → 2 клика для линии');

})();
