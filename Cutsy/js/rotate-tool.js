// ═══════════════════════════════════════════════════════════════
// rotate-tool.js — v1.0 — Инструмент Вращение объектов
// ═══════════════════════════════════════════════════════════════
// Поворачивает выделенные объекты на заданный угол вокруг центра
// выделения (или указанной точки).
//
// Рабочий процесс:
//   1. Пользователь выделяет объект(ы)
//   2. Нажимает кнопку Поворот (или клавишу Q)
//   3. Вводит угол в градусах (prompt)
//      плюс — против часовой (CCW), минус — по часовой (CW)
//   4. Объекты поворачиваются вокруг центра выделения
//
// Поддерживаемые типы: line, circle, arc, rect, polygon, polyline.
// Для rect создаётся CustomPolygon (4 угла) — т.к. Rect axis-aligned.
// ═══════════════════════════════════════════════════════════════

(function() {
'use strict';

/**
 * Активировать инструмент Вращение.
 * Применяет поворот сразу после ввода угла — без доп. клика.
 */
window.activateRotateTool = function() {
    let selObjs = [];
    if (typeof selectedObjects !== 'undefined' && selectedObjects && selectedObjects.length > 0) {
        selObjs = selectedObjects;
    } else if (typeof window.selectedObjects !== 'undefined' && window.selectedObjects && window.selectedObjects.length > 0) {
        selObjs = window.selectedObjects;
    }

    if (selObjs.length === 0) {
        const msg = '⚠️ Выделите объекты для поворота';
        if (typeof showError === 'function') {
            showError(msg);
        } else {
            alert(msg);
        }
        return;
    }

    const supportedTypes = ['line', 'circle', 'arc', 'rect', 'polygon', 'polyline', 'lwpolyline', 'text'];
    const validObjs = selObjs.filter(o => o && supportedTypes.includes(o.type));
    if (validObjs.length === 0) {
        alert(`⚠️ Нет поддерживаемых объектов.\nПоддерживаются: ${supportedTypes.join(', ')}`);
        return;
    }

    // Запрашиваем угол
    const lastAngle = localStorage.getItem('lastRotateAngle') || '90';
    const angleStr = prompt('Угол поворота (градусы):\n  плюс — против часовой\n  минус — по часовой', lastAngle);
    if (!angleStr) return;
    const angleDeg = parseFloat(angleStr);
    if (isNaN(angleDeg) || angleDeg === 0) {
        alert('⚠️ Угол должен быть числом (не ноль).\nПримеры: 90, -45, 180');
        return;
    }
    localStorage.setItem('lastRotateAngle', String(angleDeg));

    // Вычисляем центр вращения
    let center;
    if (typeof getSelectionCenter === 'function') {
        center = getSelectionCenter();
    } else {
        // Fallback: среднее центров всех объектов
        let sx = 0, sy = 0;
        for (const o of validObjs) {
            const c = o.center || { x: o.cx || o.x || 0, y: o.cy || o.y || 0 };
            sx += c.x; sy += c.y;
        }
        center = { x: sx / validObjs.length, y: sy / validObjs.length };
    }

    // Сохраняем состояние для undo
    if (typeof window.saveState === 'function') {
        window.saveState();
    }

    const angleRad = angleDeg * Math.PI / 180;

    // Поворачиваем каждый объект in-place
    for (const obj of validObjs) {
        rotateObjectInPlace(obj, angleRad, center.x, center.y);
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
 * Поворачивает объект in-place на заданный угол вокруг центра.
 * @param {Object} obj — объект для поворота
 * @param {number} angleRad — угол в радианах
 * @param {number} cx — центр X
 * @param {number} cy — центр Y
 */
function rotateObjectInPlace(obj, angleRad, cx, cy) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    // Функция поворота точки
    const rp = (x, y) => ({
        x: cx + (x - cx) * cos - (y - cy) * sin,
        y: cy + (x - cx) * sin + (y - cy) * cos
    });

    if (obj.type === 'line') {
        const p1 = rp(obj.x1, obj.y1);
        const p2 = rp(obj.x2, obj.y2);
        obj.x1 = p1.x; obj.y1 = p1.y;
        obj.x2 = p2.x; obj.y2 = p2.y;
    }
    else if (obj.type === 'circle') {
        // Круг: поворачиваем только центр, radius не меняется
        const c = rp(obj.cx, obj.cy);
        obj.cx = c.x; obj.cy = c.y;
    }
    else if (obj.type === 'arc') {
        // Дуга: поворачиваем центр + углы
        const c = rp(obj.cx, obj.cy);
        obj.cx = c.x; obj.cy = c.y;
        obj.startAngle += angleRad;
        obj.endAngle += angleRad;
        // Нормализуем углы в [0, 2π)
        const TAU = Math.PI * 2;
        obj.startAngle = ((obj.startAngle % TAU) + TAU) % TAU;
        obj.endAngle = ((obj.endAngle % TAU) + TAU) % TAU;
    }
    else if (obj.type === 'rect') {
        // v1.0: Прямоугольник → CustomPolygon (4 угла), т.к. повёрнутый rect
        // не может быть axis-aligned. Мутируем in-place: меняем type на polygon.
        const corners = [
            { x: obj.x, y: obj.y },
            { x: obj.x + obj.width, y: obj.y },
            { x: obj.x + obj.width, y: obj.y + obj.height },
            { x: obj.x, y: obj.y + obj.height }
        ];
        const rotated = corners.map(c => rp(c.x, c.y));
        // Мутируем объект: превращаем rect в polygon (CustomPolygon-подобный)
        obj.type = 'polygon';
        obj.points = rotated;
        obj.closed = true;
        // Удаляем rect-свойства (больше не нужны)
        delete obj.width;
        delete obj.height;
        // v1.1: ВСЕГДА перезаписываем методы — Rect уже имеет draw() через prototype,
        // который использует this.width/this.height (уже удалены). Если не перезаписать,
        // контур не будет рисоваться.
        obj.getVertices = function() { return this.points; };
        obj.getPoints = function() { return this.points; };
        obj.draw = function(ctx) {
            if (!this.points || this.points.length < 2) return;
            ctx.strokeStyle = this.color || '#00aadd';
            ctx.beginPath();
            ctx.moveTo(this.points[0].x, this.points[0].y);
            for (let i = 1; i < this.points.length; i++) {
                ctx.lineTo(this.points[i].x, this.points[i].y);
            }
            ctx.closePath();
            ctx.stroke();
        };
        obj.contains = function(x, y) {
            if (!this.points || this.points.length < 3) return false;
            let inside = false;
            for (let i = 0, j = this.points.length - 1; i < this.points.length; j = i++) {
                if (((this.points[i].y > y) !== (this.points[j].y > y)) &&
                    (x < (this.points[j].x - this.points[i].x) * (y - this.points[i].y) / (this.points[j].y - this.points[i].y) + this.points[i].x)) {
                    inside = !inside;
                }
            }
            return inside;
        };
        obj.move = function(dx, dy) {
            this.points.forEach(p => { p.x += dx; p.y += dy; });
        };
        obj.clone = function() {
            const copy = { ...this };
            copy.points = this.points.map(p => ({ x: p.x, y: p.y }));
            copy.id = Date.now() + Math.random();
            return copy;
        };
        // Вычисляем центр/radius для properties-panel
        let sx = 0, sy = 0;
        for (const p of obj.points) { sx += p.x; sy += p.y; }
        obj.cx = sx / obj.points.length;
        obj.cy = sy / obj.points.length;
        let maxR = 0;
        for (const p of obj.points) {
            const d = Math.hypot(p.x - obj.cx, p.y - obj.cy);
            if (d > maxR) maxR = d;
        }
        obj.radius = maxR;
        obj.sides = obj.points.length;
    }
    else if (obj.type === 'polygon') {
        // Полигон с cx/cy/radius/sides (правильный) — поворачиваем центр
        if (typeof obj.getVertices === 'function' && obj.points) {
            // CustomPolygon: поворачиваем все точки
            obj.points = obj.points.map(p => rp(p.x, p.y));
            if (typeof obj._updateCenterAndRadius === 'function') {
                obj._updateCenterAndRadius();
            }
        } else {
            // Правильный Polygon: поворачиваем только центр
            const c = rp(obj.cx, obj.cy);
            obj.cx = c.x; obj.cy = c.y;
        }
    }
    else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        const pts = obj.points || obj.vertices || [];
        if (pts.length < 2) return;
        const rotated = pts.map(p => rp(p.x, p.y));
        if (obj.points) obj.points = rotated;
        if (obj.vertices) obj.vertices = rotated;
    }
    else if (obj.type === 'text') {
        // v1.1: Текст — поворачиваем позицию + добавляем угол поворота
        const c = rp(obj.x, obj.y);
        obj.x = c.x; obj.y = c.y;
        obj.rotation = (obj.rotation || 0) + angleRad;
    }
}

console.log('✅ rotate-tool.js загружен (v1.0) — Поворот: выделите объекты → Q → введите угол');

})();
