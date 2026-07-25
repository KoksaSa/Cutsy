// ═══════════════════════════════════════════════════════════════
// eraser-tool.js — v1.0 — Умный ластик (Trim + Erase)
// ═══════════════════════════════════════════════════════════════
// Два режима:
// 1. КЛИК (без движения мыши) → Trim: обрезать сегмент линии/дуги
//    до ближайшего пересечения с другим объектом. Удаляется часть
//    от точки клика до ближайшего пересечения.
// 2. ПРОТЯГИВАНИЕ (drag) → Erase: удалить все сегменты, пересечённые
//    линией ластика (как раньше).
//
// Поддерживаемые типы: line, arc, circle, rect, polygon, polyline.
// ═══════════════════════════════════════════════════════════════

(function() {
'use strict';

const TRIM_TOLERANCE = 5; // мм — радиус поиска точки клика на объекте

/**
 * Trim: обрезает сегмент объекта от точки клика до ближайшего пересечения.
 * @param {Object} obj — объект для обрезки
 * @param {number} clickX — X клика
 * @param {number} clickY — Y клика
 * @returns {boolean} true если обрезано
 */
window.trimObjectAtPoint = function(obj, clickX, clickY) {
    if (!obj) return false;

    // Проверяем, что клик попадает на объект (с допуском)
    if (typeof obj.contains === 'function' && !obj.contains(clickX, clickY)) {
        // Дополнительная проверка: близость к ребру
        if (!_isNearObject(obj, clickX, clickY, TRIM_TOLERANCE)) return false;
    }

    if (obj.type === 'line') {
        return _trimLine(obj, clickX, clickY);
    }
    if (obj.type === 'arc') {
        return _trimArc(obj, clickX, clickY);
    }
    if (obj.type === 'circle') {
        return _trimCircle(obj, clickX, clickY);
    }
    if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        return _trimPolyline(obj, clickX, clickY);
    }
    if (obj.type === 'rect') {
        return _trimRect(obj, clickX, clickY);
    }

    return false;
};

/**
 * Проверяет, близко ли точка к объекту.
 */
function _isNearObject(obj, x, y, tolerance) {
    if (typeof obj.contains === 'function' && obj.contains(x, y)) return true;
    if (typeof obj.getPoints === 'function') {
        const pts = obj.getPoints();
        for (let i = 0; i < pts.length - 1; i++) {
            const d = _pointToSegmentDist(x, y, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
            if (d < tolerance) return true;
        }
        return false;
    }
    if (obj.type === 'line') {
        return _pointToSegmentDist(x, y, obj.x1, obj.y1, obj.x2, obj.y2) < tolerance;
    }
    if (obj.type === 'circle' || obj.type === 'arc') {
        const d = Math.hypot(x - obj.cx, y - obj.cy);
        return Math.abs(d - obj.radius) < tolerance;
    }
    return false;
}

function _pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Пересечение двух отрезков.
 */
function _segmentIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    if (t > 0.001 && t < 0.999 && u >= 0 && u <= 1) {
        return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), t: t };
    }
    return null;
}

/**
 * Trim линии: находим все пересечения с другими объектами.
 * Удаляем часть линии, на которую кликнул пользователь.
 *
 * Логика (как в AutoCAD):
 * - Клик слева от пересечения → удаляем левую часть (от начала до пересечения)
 * - Клик справа от пересечения → удаляем правую часть (от пересечения до конца)
 * - Два пересечения по обе стороны → удаляем сегмент между ними,
 *   оставляем больший из внешних отрезков
 */
function _trimLine(obj, clickX, clickY) {
    if (typeof objects === 'undefined') return false;

    // Находим все пересечения этой линии с другими объектами
    const intersections = [];
    for (const other of objects) {
        if (other === obj) continue;
        if (other.type === 'line') {
            const ip = _segmentIntersect(obj.x1, obj.y1, obj.x2, obj.y2,
                other.x1, other.y1, other.x2, other.y2);
            if (ip) intersections.push(ip);
        } else if (other.type === 'circle' || other.type === 'arc') {
            const pts = _lineCircleIntersections(obj.x1, obj.y1, obj.x2, obj.y2,
                other.cx, other.cy, other.radius);
            for (const p of pts) {
                const dx = obj.x2 - obj.x1, dy = obj.y2 - obj.y1;
                const len = Math.hypot(dx, dy);
                if (len < 0.001) continue;
                const t = ((p.x - obj.x1) * dx + (p.y - obj.y1) * dy) / (len * len);
                if (t > 0.01 && t < 0.99) {
                    intersections.push({ x: p.x, y: p.y, t: t });
                }
            }
        } else if (other.type === 'polyline' || other.type === 'lwpolyline') {
            const pts = other.points || other.vertices || [];
            for (let i = 0; i < pts.length - 1; i++) {
                const ip = _segmentIntersect(obj.x1, obj.y1, obj.x2, obj.y2,
                    pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
                if (ip) intersections.push(ip);
            }
        } else if (other.type === 'rect' && typeof other.getPoints === 'function') {
            const pts = other.getPoints();
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i], b = pts[(i + 1) % pts.length];
                const ip = _segmentIntersect(obj.x1, obj.y1, obj.x2, obj.y2,
                    a.x, a.y, b.x, b.y);
                if (ip) intersections.push(ip);
            }
        }
    }

    if (intersections.length === 0) {
        // v4.97: Нет пересечений — удаляем линию целиком
        const idx = objects.indexOf(obj);
        if (idx >= 0) {
            objects.splice(idx, 1);
            if (typeof findPartForObject === 'function') {
                const part = findPartForObject(obj);
                if (part) {
                    part.objects = part.objects.filter(o => o !== obj);
                    if (typeof updatePartBounds === 'function') updatePartBounds(part);
                }
            }
        }
        return true;
    }

    // Параметр t точки клика на линии
    const dx = obj.x2 - obj.x1, dy = obj.y2 - obj.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.001) return false;
    const clickT = ((clickX - obj.x1) * dx + (clickY - obj.y1) * dy) / lenSq;

    // Ближайшее пересечение справа (t > clickT) и слева (t < clickT)
    let rightInt = null, leftInt = null;
    for (const ip of intersections) {
        if (ip.t > clickT) {
            if (!rightInt || ip.t < rightInt.t) rightInt = ip;
        } else if (ip.t < clickT) {
            if (!leftInt || ip.t > leftInt.t) leftInt = ip;
        }
    }

    if (rightInt && leftInt) {
        // Пересечения с обеих сторон → удаляем сегмент между ними (часть, на которую кликнули)
        // Оставляем больший из внешних отрезков
        const leftLen = leftInt.t * Math.sqrt(lenSq);       // от начала до leftInt
        const rightLen = (1 - rightInt.t) * Math.sqrt(lenSq); // от rightInt до конца
        if (leftLen >= rightLen) {
            // Оставляем левый внешний отрезок: начало → leftInt
            obj.x2 = leftInt.x; obj.y2 = leftInt.y;
        } else {
            // Оставляем правый внешний отрезок: rightInt → конец
            obj.x1 = rightInt.x; obj.y1 = rightInt.y;
        }
    } else if (rightInt) {
        // Пересечение только справа → клик был слева от него
        // Удаляем левую часть (от начала до пересечения)
        obj.x1 = rightInt.x; obj.y1 = rightInt.y;
    } else if (leftInt) {
        // Пересечение только слева → клик был справа от него
        // Удаляем правую часть (от пересечения до конца)
        obj.x2 = leftInt.x; obj.y2 = leftInt.y;
    } else {
        return false;
    }

    return true;
}

/**
 * Пересечение линии и окружности.
 */
function _lineCircleIntersections(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const fx = x1 - cx, fy = y1 - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return [];
    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);
    const pts = [];
    if (t1 >= 0 && t1 <= 1) pts.push({ x: x1 + t1 * dx, y: y1 + t1 * dy });
    if (t2 >= 0 && t2 <= 1) pts.push({ x: x1 + t2 * dx, y: y1 + t2 * dy });
    return pts;
}

/**
 * Trim дуги: упрощённо — не реализовано (сложно).
 */
function _trimArc(obj, clickX, clickY) {
    return false; // TODO: реализовать trim дуги
}

/**
 * Trim окружности: по пересечениям преобразуем в дугу (Arc).
 */
function _trimCircle(obj, clickX, clickY) {
    if (typeof objects === 'undefined') return false;
    if (typeof Arc === 'undefined') return false;

    // Собираем все пересечения окружности с другими объектами
    const intersections = [];
    for (const other of objects) {
        if (other === obj) continue;
        if (other.type === 'line') {
            const pts = _lineCircleIntersections(other.x1, other.y1, other.x2, other.y2,
                obj.cx, obj.cy, obj.radius);
            for (const p of pts) {
                const angle = Math.atan2(p.y - obj.cy, p.x - obj.cx);
                intersections.push({ x: p.x, y: p.y, angle: angle });
            }
        } else if (other.type === 'circle' || other.type === 'arc') {
            // Пересечение двух окружностей
            const pts = _circleCircleIntersections(obj.cx, obj.cy, obj.radius,
                other.cx, other.cy, other.radius);
            for (const p of pts) {
                const angle = Math.atan2(p.y - obj.cy, p.x - obj.cx);
                intersections.push({ x: p.x, y: p.y, angle: angle });
            }
        }
    }

    if (intersections.length < 2) return false;

    // Сортируем пересечения по углу
    intersections.sort((a, b) => a.angle - b.angle);

    // Находим угол точки клика
    const clickAngle = Math.atan2(clickY - obj.cy, clickX - obj.cx);

    // Находим дугу, на которую кликнул пользователь (между двумя пересечениями)
    let bestArc = null;
    for (let i = 0; i < intersections.length; i++) {
        const a1 = intersections[i].angle;
        const a2 = intersections[(i + 1) % intersections.length].angle;
        let midAngle = (a1 + a2) / 2;
        // Проверяем, что midAngle между a1 и a2 с учётом перехода через π
        let inArc = false;
        if (a1 <= a2) {
            inArc = clickAngle >= a1 && clickAngle <= a2;
            if (!inArc) midAngle = a1 + (a2 - a1) / 2;
        } else {
            inArc = clickAngle >= a1 || clickAngle <= a2;
            if (!inArc) midAngle = a1 + (a2 + 2 * Math.PI - a1) / 2;
            if (midAngle > Math.PI) midAngle -= 2 * Math.PI;
        }
        if (inArc) {
            const arcLen = a2 > a1 ? a2 - a1 : a2 + 2 * Math.PI - a1;
            const oppLen = 2 * Math.PI - arcLen;
            // Оставляем противоположную (большую) дугу
            if (oppLen >= arcLen) {
                bestArc = { startAngle: a2, endAngle: a1 + (a1 > a2 ? 2 * Math.PI : 0) };
            } else {
                bestArc = { startAngle: a1, endAngle: a2 };
            }
            break;
        }
    }

    if (!bestArc) return false;

    // Преобразуем окружность в дугу
    obj.type = 'arc';
    obj.startAngle = bestArc.startAngle;
    obj.endAngle = bestArc.endAngle;
    obj.radius = obj.radius || obj.r;

    // Принудительно перезаписываем методы для корректной отрисовки дуги
    obj.contains = function(px, py) {
        const d = Math.hypot(px - this.cx, py - this.cy);
        if (Math.abs(d - this.radius) > 5) return false;
        const a = Math.atan2(py - this.cy, px - this.cx);
        let sa = this.startAngle, ea = this.endAngle;
        if (sa > ea) ea += 2 * Math.PI;
        let na = a;
        if (na < sa) na += 2 * Math.PI;
        return na >= sa && na <= ea;
    };
    obj.getPoints = function() {
        const pts = [];
        const steps = 32;
        let sa = this.startAngle, ea = this.endAngle;
        if (sa > ea) ea += 2 * Math.PI;
        for (let i = 0; i <= steps; i++) {
            const a = sa + (ea - sa) * i / steps;
            pts.push({ x: this.cx + this.radius * Math.cos(a), y: this.cy + this.radius * Math.sin(a) });
        }
        return pts;
    };
    obj.draw = function(ctx) {
        ctx.beginPath();
        let sa = this.startAngle, ea = this.endAngle;
        if (sa > ea) ea += 2 * Math.PI;
        ctx.arc(this.cx, this.cy, this.radius, sa, ea);
        ctx.strokeStyle = this.color || '#00aadd';
        ctx.stroke();
    };
    obj.move = function(dx, dy) {
        this.cx += dx;
        this.cy += dy;
    };

    return true;
}

/**
 * Пересечение двух окружностей.
 */
function _circleCircleIntersections(x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1, dy = y2 - y1;
    const d = Math.hypot(dx, dy);
    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d < 0.001) return [];
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(r1 * r1 - a * a);
    const xm = x1 + a * dx / d;
    const ym = y1 + a * dy / d;
    const pts = [
        { x: xm + h * dy / d, y: ym - h * dx / d },
        { x: xm - h * dy / d, y: ym + h * dx / d }
    ];
    return pts;
}

/**
 * Trim прямоугольника: находим ближайшую грань, обрезаем её по пересечению.
 * Прямоугольник заменяется набором отдельных линий (4 или меньше).
 */
function _trimRect(obj, clickX, clickY) {
    if (typeof objects === 'undefined') return false;
    if (typeof Line === 'undefined') return false;

    // Получаем 4 вершины прямоугольника
    const pts = (typeof obj.getPoints === 'function') ? obj.getPoints() : null;
    if (!pts || pts.length < 4) return false;

    // 4 ребра прямоугольника
    const edges = [];
    for (let i = 0; i < 4; i++) {
        edges.push({ p1: pts[i], p2: pts[(i + 1) % 4], index: i });
    }

    // Находим ближайшее ребро к точке клика
    let bestEdge = -1, bestDist = TRIM_TOLERANCE;
    for (let i = 0; i < edges.length; i++) {
        const d = _pointToSegmentDist(clickX, clickY,
            edges[i].p1.x, edges[i].p1.y, edges[i].p2.x, edges[i].p2.y);
        if (d < bestDist) { bestDist = d; bestEdge = i; }
    }
    if (bestEdge < 0) return false;

    // Находим пересечения этого ребра с другими объектами
    const edge = edges[bestEdge];
    const intersections = [];
    for (const other of objects) {
        if (other === obj) continue;
        if (other.type === 'line') {
            const ip = _segmentIntersect(edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y,
                other.x1, other.y1, other.x2, other.y2);
            if (ip) intersections.push(ip);
        } else if (other.type === 'circle' || other.type === 'arc') {
            const pts2 = _lineCircleIntersections(edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y,
                other.cx, other.cy, other.radius);
            for (const p of pts2) {
                const dx = edge.p2.x - edge.p1.x, dy = edge.p2.y - edge.p1.y;
                const lenSq = dx * dx + dy * dy;
                if (lenSq < 0.001) continue;
                const t = ((p.x - edge.p1.x) * dx + (p.y - edge.p1.y) * dy) / lenSq;
                if (t > 0.01 && t < 0.99) {
                    intersections.push({ x: p.x, y: p.y, t: t });
                }
            }
        } else if (other.type === 'polyline' || other.type === 'lwpolyline') {
            const oPts = other.points || other.vertices || [];
            for (let i = 0; i < oPts.length - 1; i++) {
                const ip = _segmentIntersect(edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y,
                    oPts[i].x, oPts[i].y, oPts[i+1].x, oPts[i+1].y);
                if (ip) intersections.push(ip);
            }
        } else if (other.type === 'rect' && typeof other.getPoints === 'function') {
            const oPts = other.getPoints();
            for (let i = 0; i < oPts.length; i++) {
                const a = oPts[i], b = oPts[(i + 1) % oPts.length];
                const ip = _segmentIntersect(edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y,
                    a.x, a.y, b.x, b.y);
                if (ip) intersections.push(ip);
            }
        }
    }

    // Параметр клика на ребре
    const dx = edge.p2.x - edge.p1.x, dy = edge.p2.y - edge.p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.001) return false;
    const clickT = ((clickX - edge.p1.x) * dx + (clickY - edge.p1.y) * dy) / lenSq;

    // Ближайшие пересечения слева и справа от клика
    let rightInt = null, leftInt = null;
    for (const ip of intersections) {
        if (ip.t > clickT) {
            if (!rightInt || ip.t < rightInt.t) rightInt = ip;
        } else if (ip.t < clickT) {
            if (!leftInt || ip.t > leftInt.t) leftInt = ip;
        }
    }

    // Создаём линии для всех рёбер, кроме обрезаемого
    const newLines = [];
    for (let i = 0; i < edges.length; i++) {
        if (i === bestEdge) continue; // обрезаемое ребро — обработаем отдельно
        newLines.push(new Line(edges[i].p1.x, edges[i].p1.y, edges[i].p2.x, edges[i].p2.y));
    }

    // Обрабатываем обрезаемое ребро
    if (rightInt && leftInt) {
        // Пересечения с обеих сторон → оставляем больший внешний отрезок
        const leftLen = leftInt.t * Math.sqrt(lenSq);
        const rightLen = (1 - rightInt.t) * Math.sqrt(lenSq);
        if (leftLen >= rightLen) {
            // Оставляем: p1 → leftInt
            newLines.push(new Line(edge.p1.x, edge.p1.y, leftInt.x, leftInt.y));
        } else {
            // Оставляем: rightInt → p2
            newLines.push(new Line(rightInt.x, rightInt.y, edge.p2.x, edge.p2.y));
        }
    } else if (rightInt) {
        // Пересечение только справа → удаляем левую часть (p1 → пересечение)
        // Оставляем: rightInt → p2
        newLines.push(new Line(rightInt.x, rightInt.y, edge.p2.x, edge.p2.y));
    } else if (leftInt) {
        // Пересечение только слева → удаляем правую часть (пересечение → p2)
        // Оставляем: p1 → leftInt
        newLines.push(new Line(edge.p1.x, edge.p1.y, leftInt.x, leftInt.y));
    } else {
        // Нет пересечений → удаляем всё ребро целиком
        // (не добавляем линию для этого ребра)
    }

    // Копируем свойства (цвет и т.д.)
    for (const line of newLines) {
        if (obj.color) line.color = obj.color;
        line.id = Date.now() + Math.random();
    }

    // Заменяем прямоугольник на отдельные линии
    const idx = objects.indexOf(obj);
    if (idx >= 0) {
        objects.splice(idx, 1);
        objects.push(...newLines);
        if (typeof findPartForObject === 'function') {
            const part = findPartForObject(obj);
            if (part) {
                part.objects = part.objects.filter(o => o !== obj);
                part.objects.push(...newLines);
                if (typeof updatePartBounds === 'function') updatePartBounds(part);
            }
        }
    }

    return true;
}

/**
 * Trim полилинии: находим сегмент под кликом, обрезаем до пересечения.
 */
function _trimPolyline(obj, clickX, clickY) {
    if (!obj.points || obj.points.length < 2) return false;
    if (typeof objects === 'undefined') return false;

    // Находим ближайший сегмент к точке клика
    let bestSeg = -1, bestDist = TRIM_TOLERANCE;
    for (let i = 0; i < obj.points.length - 1; i++) {
        const d = _pointToSegmentDist(clickX, clickY,
            obj.points[i].x, obj.points[i].y,
            obj.points[i+1].x, obj.points[i+1].y);
        if (d < bestDist) { bestDist = d; bestSeg = i; }
    }
    if (bestSeg < 0) return false;

    // Находим пересечения этого сегмента с другими объектами
    const p1 = obj.points[bestSeg], p2 = obj.points[bestSeg + 1];
    const intersections = [];
    for (const other of objects) {
        if (other === obj) continue;
        if (other.type === 'line') {
            const ip = _segmentIntersect(p1.x, p1.y, p2.x, p2.y,
                other.x1, other.y1, other.x2, other.y2);
            if (ip) intersections.push(ip);
        } else if (other.type === 'polyline' || other.type === 'lwpolyline') {
            const pts = other.points || other.vertices || [];
            for (let i = 0; i < pts.length - 1; i++) {
                const ip = _segmentIntersect(p1.x, p1.y, p2.x, p2.y,
                    pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
                if (ip) intersections.push(ip);
            }
        }
    }

    if (intersections.length === 0) {
        // Нет пересечений — удаляем весь сегмент
        obj.points.splice(bestSeg, 1);
        return true;
    }

    // Параметр клика на сегменте
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.001) return false;
    const clickT = ((clickX - p1.x) * dx + (clickY - p1.y) * dy) / lenSq;

    // Ближайшее пересечение
    let nearest = null;
    for (const ip of intersections) {
        if (!nearest || Math.abs(ip.t - clickT) < Math.abs(nearest.t - clickT)) {
            nearest = ip;
        }
    }

    if (!nearest) return false;

    // Разделяем сегмент: p1 → intersection → p2
    // Удаляем часть, на которую кликнул пользователь
    if (nearest.t > clickT) {
        // Пересечение справа от клика → клик был на левой части
        // Удаляем левую часть (от p1 до пересечения)
        obj.points[bestSeg] = { x: nearest.x, y: nearest.y };
        // Если после замены остались 2 одинаковые точки — удаляем дубликат
        if (bestSeg > 0 && obj.points[bestSeg - 1] &&
            Math.abs(obj.points[bestSeg].x - obj.points[bestSeg - 1].x) < 0.01 &&
            Math.abs(obj.points[bestSeg].y - obj.points[bestSeg - 1].y) < 0.01) {
            obj.points.splice(bestSeg - 1, 1);
        }
    } else {
        // Пересечение слева от клика → клик был на правой части
        // Удаляем правую часть (от пересечения до p2)
        obj.points[bestSeg + 1] = { x: nearest.x, y: nearest.y };
        // Если после замены остались 2 одинаковые точки — удаляем дубликат
        if (bestSeg + 2 < obj.points.length && obj.points[bestSeg + 2] &&
            Math.abs(obj.points[bestSeg + 1].x - obj.points[bestSeg + 2].x) < 0.01 &&
            Math.abs(obj.points[bestSeg + 1].y - obj.points[bestSeg + 2].y) < 0.01) {
            obj.points.splice(bestSeg + 2, 1);
        }
    }

    return true;
}

console.log('✅ eraser-tool.js v1.0 загружен — window.trimObjectAtPoint');
})();
