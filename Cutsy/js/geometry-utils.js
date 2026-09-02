// ═══════════════════════════════════════════════════════════════════════════════
// geometry-utils.js — v6 (Trim-логика)
//
// ПРИНЦИП: Ластик работает как инструмент TRIM в CAD:
//   - Кликаешь по линии → удаляется участок от точки клика
//     до ближайшего пересечения с другим объектом
//   - Если ОТДЕЛЬНАЯ ЛИНИЯ (type === 'line') не имеет пересечений
//     с другими объектами → удаляется ЦЕЛИКОМ
//   - Для рёбер составных объектов (rect, polygon) без пересечений —
//     обрезается хвост до конца (как в v5)
//   - НИКОГДА не делается надрез — только усечение (trim)
//
// Ключевые изменения v6:
// 1. Отдельная линия без пересечений удаляется ЦЕЛИКОМ
// 2. Рёбра составных объектов (rect, polygon) без пересечений —
//    обрезаются до конца (старое поведение v5)
// 3. Все предыдущие исправления v5 (TRIM-логика, circle-circle, и т.д.)
// ═══════════════════════════════════════════════════════════════════════════════

const _ERASER_LOG = true;
function _eraserLog(...args) { if (_ERASER_LOG) console.log('[ERASER]', ...args); }

// Малый допуск для численных сравнений
const _EPS = 1e-9;

// ═══════════════════════════════════════════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════════════════════════════════════════

function checkRectIntersect(rect, nestedParts, sheetSize) {
    if (rect.x < 0 || rect.y < 0 ||
        rect.x + rect.width > sheetSize.width ||
        rect.y + rect.height > sheetSize.height) {
        return true;
    }
    for (const nested of nestedParts) {
        if (rect.x < nested.x + nested.width &&
            rect.x + rect.width > nested.x &&
            rect.y < nested.y + nested.height &&
            rect.y + rect.height > nested.y) {
            return true;
        }
    }
    return false;
}

function findConnectedLines(line) {
    const connected = [];
    const points = [
        { x: line.x1, y: line.y1, type: 'start' },
        { x: line.x2, y: line.y2, type: 'end' }
    ];
    for (const other of objects) {
        if (other.type !== 'line' || other === line) continue;
        const otherPoints = [
            { x: other.x1, y: other.y1, type: 'start' },
            { x: other.x2, y: other.y2, type: 'end' }
        ];
        for (const pt of points) {
            for (const otherPt of otherPoints) {
                if (Math.abs(pt.x - otherPt.x) < 1 && Math.abs(pt.y - otherPt.y) < 1) {
                    connected.push({
                        line: other,
                        connectionPoint: otherPt,
                        targetPoint: pt
                    });
                }
            }
        }
    }
    return connected;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ПЕРЕСЕЧЕНИЕ ЛИНИИ С ОКРУЖНОСТЬЮ
// ═══════════════════════════════════════════════════════════════════════════════
function findLineCircleIntersection(line, circle) {
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < _EPS) return null;

    const fx = line.x1 - circle.cx;
    const fy = line.y1 - circle.cy;
    const a = lenSq;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - circle.radius * circle.radius;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < -_EPS) return null;
    const sqrtDisc = Math.sqrt(Math.max(0, discriminant));

    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);
    const intersections = [];

    if (t1 >= -0.001 && t1 <= 1.001) {
        const tc1 = Math.max(0, Math.min(1, t1));
        intersections.push({
            x: line.x1 + tc1 * dx,
            y: line.y1 + tc1 * dy,
            t: tc1
        });
    }
    if (t2 >= -0.001 && t2 <= 1.001 && Math.abs(t2 - t1) > _EPS) {
        const tc2 = Math.max(0, Math.min(1, t2));
        intersections.push({
            x: line.x1 + tc2 * dx,
            y: line.y1 + tc2 * dy,
            t: tc2
        });
    }
    return intersections.length > 0 ? intersections : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ПЕРЕСЕЧЕНИЕ ДВУХ ОКРУЖНОСТЕЙ
// ═══════════════════════════════════════════════════════════════════════════════
function findCircleCircleIntersection(c1, c2) {
    const dx = c2.cx - c1.cx;
    const dy = c2.cy - c1.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > c1.radius + c2.radius + 0.01) return null;
    if (dist < Math.abs(c1.radius - c2.radius) - 0.01) return null;
    if (dist < _EPS) return null;

    const a = (c1.radius * c1.radius - c2.radius * c2.radius + dist * dist) / (2 * dist);
    const h2 = c1.radius * c1.radius - a * a;
    if (h2 < -_EPS) return null;
    const h = Math.sqrt(Math.max(0, h2));

    const mx = c1.cx + a * dx / dist;
    const my = c1.cy + a * dy / dist;

    const intersections = [];
    intersections.push({
        x: mx + h * dy / dist,
        y: my - h * dx / dist
    });
    if (h > 0.01) {
        intersections.push({
            x: mx - h * dy / dist,
            y: my + h * dx / dist
        });
    }
    return intersections.length > 0 ? intersections : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ПЕРЕСЕЧЕНИЕ ОКРУЖНОСТИ С ДУГОЙ
// ═══════════════════════════════════════════════════════════════════════════════
function findCircleArcIntersection(circle, arc) {
    const arcCx = arc.cx || 0;
    const arcCy = arc.cy || 0;
    const arcR = Math.abs(arc.radius || 0);
    if (arcR <= 0) return null;

    const arcAsCircle = { cx: arcCx, cy: arcCy, radius: arcR };
    const pts = findCircleCircleIntersection(circle, arcAsCircle);
    if (!pts) return null;

    const arcStartAngle = arc.startAngle || 0;
    const arcEndAngle = arc.endAngle || 2 * Math.PI;
    const filtered = [];

    for (const pt of pts) {
        let angle = Math.atan2(pt.y - arcCy, pt.x - arcCx);
        if (angle < arcStartAngle) angle += 2 * Math.PI;
        if (angle >= arcStartAngle - 0.01 && angle <= arcEndAngle + 0.01) {
            filtered.push(pt);
        }
    }
    return filtered.length > 0 ? filtered : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ВСЕ ПЕРЕСЕЧЕНИЯ ОКРУЖНОСТИ С ДРУГИМИ ОБЪЕКТАМИ
// ═══════════════════════════════════════════════════════════════════════════════
function findCircleIntersections(circle) {
    const intersections = [];
    const DEDUP_TOL = 0.5;

    for (const obj of objects) {
        if (obj === circle) continue;

        let pts = null;

        if (obj.type === 'line') {
            pts = findLineCircleIntersection(obj, circle);
        } else if (obj.type === 'rect' || obj.type === 'polygon' || obj.type === 'CustomPolygon') {
            const edges = getObjectEdges(obj);
            pts = [];
            for (const edge of edges) {
                const edgeLine = { x1: edge.p1.x, y1: edge.p1.y, x2: edge.p2.x, y2: edge.p2.y };
                const edgePts = findLineCircleIntersection(edgeLine, circle);
                if (edgePts) pts.push(...edgePts);
            }
            if (pts.length === 0) pts = null;
        } else if (obj.type === 'circle') {
            pts = findCircleCircleIntersection(circle, obj);
        } else if (obj.type === 'arc') {
            pts = findCircleArcIntersection(circle, obj);
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const pPts = obj.points || obj.vertices || [];
            pts = [];
            for (let i = 0; i < pPts.length - 1; i++) {
                const edgeLine = { x1: pPts[i].x, y1: pPts[i].y, x2: pPts[i + 1].x, y2: pPts[i + 1].y };
                const edgePts = findLineCircleIntersection(edgeLine, circle);
                if (edgePts) pts.push(...edgePts);
            }
            if (obj.closed && pPts.length > 2) {
                const edgeLine = { x1: pPts[pPts.length - 1].x, y1: pPts[pPts.length - 1].y, x2: pPts[0].x, y2: pPts[0].y };
                const edgePts = findLineCircleIntersection(edgeLine, circle);
                if (edgePts) pts.push(...edgePts);
            }
            if (pts.length === 0) pts = null;
        }

        if (pts) {
            for (const pt of pts) {
                const exists = intersections.some(i =>
                    Math.abs(i.x - pt.x) < DEDUP_TOL && Math.abs(i.y - pt.y) < DEDUP_TOL
                );
                if (!exists) {
                    intersections.push({
                        x: pt.x,
                        y: pt.y,
                        angle: Math.atan2(pt.y - circle.cy, pt.x - circle.cx)
                    });
                }
            }
        }
    }

    intersections.sort((a, b) => a.angle - b.angle);
    return intersections;
}

// ═══════════════════════════════════════════════════════════════════════════════
// СТЕРЕТЬ ДУГУ КРУГА
// ═══════════════════════════════════════════════════════════════════════════════
function eraseCircleArc(circle, clickX, clickY, intersections) {
    const clickAngle = Math.atan2(clickY - circle.cy, clickX - circle.cx);

    if (intersections.length === 0) {
        const deleteAngle = 30 * (Math.PI / 180);
        const keepStartAngle = clickAngle + deleteAngle;
        const keepEndAngle = clickAngle - deleteAngle + 2 * Math.PI;
        return createArcAsLines(circle, keepStartAngle, keepEndAngle);
    }

    if (intersections.length === 1) {
        const intAngle = intersections[0].angle;
        let diff = clickAngle - intAngle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;

        const margin = 5 * (Math.PI / 180);
        if (diff >= 0) {
            return createArcAsLines(circle, clickAngle + margin, intAngle + 2 * Math.PI - margin);
        } else {
            return createArcAsLines(circle, intAngle + margin, clickAngle - margin + 2 * Math.PI);
        }
    }

    // Два и более пересечений
    let eraseFromIdx = -1;

    for (let i = 0; i < intersections.length; i++) {
        const next = (i + 1) % intersections.length;
        let a1 = intersections[i].angle;
        let a2 = intersections[next].angle;
        while (a2 < a1) a2 += 2 * Math.PI;
        let ca = clickAngle;
        while (ca < a1) ca += 2 * Math.PI;
        while (ca > a1 + 2 * Math.PI) ca -= 2 * Math.PI;
        if (ca >= a1 && ca <= a2) {
            eraseFromIdx = i;
            break;
        }
    }

    if (eraseFromIdx === -1) {
        let minDist = Infinity;
        for (let i = 0; i < intersections.length; i++) {
            const next = (i + 1) % intersections.length;
            let a1 = intersections[i].angle;
            let a2 = intersections[next].angle;
            while (a2 < a1) a2 += 2 * Math.PI;
            let ca = clickAngle;
            while (ca < a1) ca += 2 * Math.PI;
            const midA = (a1 + a2) / 2;
            const dist = Math.abs(ca - midA);
            if (dist < minDist) {
                minDist = dist;
                eraseFromIdx = i;
            }
        }
    }

    if (eraseFromIdx === -1) return [];

    const newLines = [];
    for (let i = 0; i < intersections.length; i++) {
        if (i === eraseFromIdx) continue;
        const next = (i + 1) % intersections.length;
        let startAngle = intersections[i].angle;
        let endAngle = intersections[next].angle;
        while (endAngle <= startAngle) endAngle += 2 * Math.PI;
        const arcLines = createArcAsLines(circle, startAngle, endAngle);
        newLines.push(...arcLines);
    }
    return newLines;
}

// ═══════════════════════════════════════════════════════════════════════════════
// АППРОКСИМАЦИЯ ДУГИ ЛИНИЯМИ
// ═══════════════════════════════════════════════════════════════════════════════
function createArcAsLines(arcObj, startAngle, endAngle) {
    const cx = arcObj.cx || 0;
    const cy = arcObj.cy || 0;
    const r = Math.abs(arcObj.radius || 0);
    if (r <= 0) return [];

    let sa = startAngle;
    let ea = endAngle;
    while (ea <= sa) ea += 2 * Math.PI;

    const arcAngle = ea - sa;
    if (arcAngle < 0.001) return [];
    if (arcAngle >= 2 * Math.PI - 0.01) return [];

    const segments = Math.max(8, Math.ceil(arcAngle / (Math.PI / 18)));
    const angleStep = arcAngle / segments;
    const newLines = [];
    let prevX = cx + Math.cos(sa) * r;
    let prevY = cy + Math.sin(sa) * r;

    for (let i = 1; i <= segments; i++) {
        const angle = sa + i * angleStep;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        newLines.push(new Line(prevX, prevY, x, y));
        prevX = x;
        prevY = y;
    }
    return newLines;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНАЯ: расстояние от точки до отрезка
// ═══════════════════════════════════════════════════════════════════════════════
function _pointToSegmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < _EPS) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));

    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНАЯ: найти все пересечения ребра с другими объектами
// Возвращает массив { x, y, t } отсортированный по t
// ═══════════════════════════════════════════════════════════════════════════════
function _getEdgeObjectIntersections(edge, excludeObj) {
    const dx = edge.p2.x - edge.p1.x;
    const dy = edge.p2.y - edge.p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < _EPS) return [];

    const results = [];

    for (const other of objects) {
        if (other === excludeObj) continue;

        let pts = null;

        if (other.type === 'line') {
            const pt = findLineIntersection(
                { x1: edge.p1.x, y1: edge.p1.y, x2: edge.p2.x, y2: edge.p2.y },
                { x1: other.x1, y1: other.y1, x2: other.x2, y2: other.y2 }
            );
            if (pt) pts = [pt];
        } else if (other.type === 'circle') {
            pts = findLineCircleIntersection(
                { x1: edge.p1.x, y1: edge.p1.y, x2: edge.p2.x, y2: edge.p2.y },
                other
            );
        } else if (other.type === 'rect' || other.type === 'polygon' || other.type === 'CustomPolygon') {
            const oEdges = (typeof getObjectEdges === 'function') ? getObjectEdges(other) : [];
            pts = [];
            for (const oe of oEdges) {
                const pt = findLineIntersection(
                    { x1: edge.p1.x, y1: edge.p1.y, x2: edge.p2.x, y2: edge.p2.y },
                    { x1: oe.p1.x, y1: oe.p1.y, x2: oe.p2.x, y2: oe.p2.y }
                );
                if (pt) pts.push(pt);
            }
            if (pts.length === 0) pts = null;
        } else if (other.type === 'arc') {
            const arcPts = (typeof other.getPoints === 'function') ? other.getPoints(24) : [];
            pts = [];
            for (let i = 0; i < arcPts.length - 1; i++) {
                const pt = findLineIntersection(
                    { x1: edge.p1.x, y1: edge.p1.y, x2: edge.p2.x, y2: edge.p2.y },
                    { x1: arcPts[i].x, y1: arcPts[i].y, x2: arcPts[i + 1].x, y2: arcPts[i + 1].y }
                );
                if (pt) pts.push(pt);
            }
            if (pts.length === 0) pts = null;
        } else if (other.type === 'polyline' || other.type === 'lwpolyline') {
            const pPts = other.points || other.vertices || [];
            pts = [];
            for (let i = 0; i < pPts.length - 1; i++) {
                const pt = findLineIntersection(
                    { x1: edge.p1.x, y1: edge.p1.y, x2: edge.p2.x, y2: edge.p2.y },
                    { x1: pPts[i].x, y1: pPts[i].y, x2: pPts[i + 1].x, y2: pPts[i + 1].y }
                );
                if (pt) pts.push(pt);
            }
            if (other.closed && pPts.length > 2) {
                const pt = findLineIntersection(
                    { x1: edge.p1.x, y1: edge.p1.y, x2: edge.p2.x, y2: edge.p2.y },
                    { x1: pPts[pPts.length - 1].x, y1: pPts[pPts.length - 1].y, x2: pPts[0].x, y2: pPts[0].y }
                );
                if (pt) pts.push(pt);
            }
            if (pts.length === 0) pts = null;
        }

        if (pts) {
            for (const pt of pts) {
                const t = ((pt.x - edge.p1.x) * dx + (pt.y - edge.p1.y) * dy) / lenSq;
                // ИСПРАВЛЕНО v5: включаем пересечения на концах (t≈0, t≈1)
                // Это критично для линий, полученных от предыдущего усечения —
                // их концы лежат на пересечениях с другими объектами
                if (t >= -0.05 && t <= 1.05) {
                    const tc = Math.max(0, Math.min(1, t)); // клампим в [0, 1]
                    const exists = results.some(r => Math.abs(r.t - tc) < 0.005);
                    if (!exists) {
                        results.push({ x: pt.x, y: pt.y, t: tc });
                    }
                }
            }
        }
    }

    // ── ДОПОЛНИТЕЛЬНО: проверяем близость концов ребра к другим объектам ──
    // Линия от предыдущего усечения может иметь концы, которые точно
    // совпадают с другими объектами, но findLineIntersection может не найти
    // пересечение из-за того, что конец ребра = начало/конец другого ребра.
    // Проверяем расстояние от концов до других объектов.
    const ENDPOINT_TOL = 2.0; // допуск близости конца к объекту
    for (const other of objects) {
        if (other === excludeObj) continue;

        // Проверяем начало ребра (t=0)
        if (!results.some(r => r.t < 0.005)) {
            const d1 = _pointToObjectDistance(edge.p1.x, edge.p1.y, other);
            if (d1 < ENDPOINT_TOL) {
                results.push({ x: edge.p1.x, y: edge.p1.y, t: 0 });
            }
        }

        // Проверяем конец ребра (t=1)
        if (!results.some(r => r.t > 0.995)) {
            const d2 = _pointToObjectDistance(edge.p2.x, edge.p2.y, other);
            if (d2 < ENDPOINT_TOL) {
                results.push({ x: edge.p2.x, y: edge.p2.y, t: 1 });
            }
        }
    }

    results.sort((a, b) => a.t - b.t);
    return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// НОВАЯ v5: расстояние от точки до объекта (любого типа)
// ═══════════════════════════════════════════════════════════════════════════════
function _pointToObjectDistance(px, py, obj) {
    if (obj.type === 'line') {
        return _pointToSegmentDistance(px, py, obj.x1, obj.y1, obj.x2, obj.y2);
    } else if (obj.type === 'circle') {
        const distToCenter = Math.sqrt((px - obj.cx) * (px - obj.cx) + (py - obj.cy) * (py - obj.cy));
        return Math.abs(distToCenter - obj.radius);
    } else if (obj.type === 'rect' || obj.type === 'polygon' || obj.type === 'CustomPolygon') {
        const edges = (typeof getObjectEdges === 'function') ? getObjectEdges(obj) : [];
        let minDist = Infinity;
        for (const e of edges) {
            const d = _pointToSegmentDistance(px, py, e.p1.x, e.p1.y, e.p2.x, e.p2.y);
            if (d < minDist) minDist = d;
        }
        return minDist;
    } else if (obj.type === 'arc') {
        const arcPts = (typeof obj.getPoints === 'function') ? obj.getPoints(24) : [];
        let minDist = Infinity;
        for (let i = 0; i < arcPts.length - 1; i++) {
            const d = _pointToSegmentDistance(px, py, arcPts[i].x, arcPts[i].y, arcPts[i + 1].x, arcPts[i + 1].y);
            if (d < minDist) minDist = d;
        }
        return minDist;
    } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        const pPts = obj.points || obj.vertices || [];
        let minDist = Infinity;
        for (let i = 0; i < pPts.length - 1; i++) {
            const d = _pointToSegmentDistance(px, py, pPts[i].x, pPts[i].y, pPts[i + 1].x, pPts[i + 1].y);
            if (d < minDist) minDist = d;
        }
        return minDist;
    }
    return Infinity;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНАЯ: получить рёбра объекта
// ═══════════════════════════════════════════════════════════════════════════════
function _getEdges(obj) {
    const edges = [];
    if (obj.type === 'line') {
        edges.push({ p1: { x: obj.x1, y: obj.y1 }, p2: { x: obj.x2, y: obj.y2 } });
    } else if (obj.type === 'rect') {
        const x1 = obj.x, y1 = obj.y, x2 = obj.x + obj.width, y2 = obj.y + obj.height;
        edges.push({ p1: { x: x1, y: y1 }, p2: { x: x2, y: y1 } });
        edges.push({ p1: { x: x2, y: y1 }, p2: { x: x2, y: y2 } });
        edges.push({ p1: { x: x2, y: y2 }, p2: { x: x1, y: y2 } });
        edges.push({ p1: { x: x1, y: y2 }, p2: { x: x1, y: y1 } });
    } else if (obj.type === 'polygon' && typeof obj.getVertices === 'function') {
        const v = obj.getVertices();
        for (let i = 0; i < v.length; i++) {
            const next = (i + 1) % v.length;
            edges.push({ p1: v[i], p2: v[next] });
        }
    } else if (obj.type === 'CustomPolygon' && obj.points) {
        for (let i = 0; i < obj.points.length - 1; i++) {
            edges.push({ p1: obj.points[i], p2: obj.points[i + 1] });
        }
        if (obj.closed && obj.points.length > 2) {
            edges.push({ p1: obj.points[obj.points.length - 1], p2: obj.points[0] });
        }
    }
    return edges;
}

// ═══════════════════════════════════════════════════════════════════════════════
// НОВАЯ v5: Найти параметр t на ребре — точку, куда попал ластик
// Возвращает { t, hit: true/false, method: string }
//
// Принцип: находим ближайшую точку на ребре к линии ластика.
// Это и есть точка Trim (усечения).
// ═══════════════════════════════════════════════════════════════════════════════
function _findTrimPoint(edge, eraserLine, tolerance) {
    const dx = edge.p2.x - edge.p1.x;
    const dy = edge.p2.y - edge.p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return { t: -1, hit: false, method: 'zero_edge' };

    // ── Способ 1: Пересечение ребра с линией ластика ──
    const eraserInt = findLineIntersection(
        { x1: edge.p1.x, y1: edge.p1.y, x2: edge.p2.x, y2: edge.p2.y },
        eraserLine
    );
    if (eraserInt) {
        const t = ((eraserInt.x - edge.p1.x) * dx + (eraserInt.y - edge.p1.y) * dy) / (len * len);
        if (t >= -0.01 && t <= 1.01) {
            const tc = Math.max(0, Math.min(1, t));
            return { t: tc, hit: true, method: 'intersection' };
        }
    }

    // ── Способ 2: Проекция середины ластика на ребро ──
    const midEx = (eraserLine.x1 + eraserLine.x2) / 2;
    const midEy = (eraserLine.y1 + eraserLine.y2) / 2;
    let tProj = ((midEx - edge.p1.x) * dx + (midEy - edge.p1.y) * dy) / (len * len);
    tProj = Math.max(0, Math.min(1, tProj));

    const projX = edge.p1.x + tProj * dx;
    const projY = edge.p1.y + tProj * dy;
    const distToEraser = pointToLineDistance(projX, projY,
        eraserLine.x1, eraserLine.y1, eraserLine.x2, eraserLine.y2);

    if (distToEraser < tolerance) {
        return { t: tProj, hit: true, method: 'projection' };
    }

    // ── Способ 3: Близость концов ластика к ребру ──
    const d1 = _pointToSegmentDistance(eraserLine.x1, eraserLine.y1,
        edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
    if (d1 < tolerance) {
        let t1 = ((eraserLine.x1 - edge.p1.x) * dx + (eraserLine.y1 - edge.p1.y) * dy) / (len * len);
        t1 = Math.max(0, Math.min(1, t1));
        return { t: t1, hit: true, method: 'endpoint_1' };
    }

    const d2 = _pointToSegmentDistance(eraserLine.x2, eraserLine.y2,
        edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
    if (d2 < tolerance) {
        let t2 = ((eraserLine.x2 - edge.p1.x) * dx + (eraserLine.y2 - edge.p1.y) * dy) / (len * len);
        t2 = Math.max(0, Math.min(1, t2));
        return { t: t2, hit: true, method: 'endpoint_2' };
    }

    // ── Способ 4: Расстояние от середины ребра до ластика ──
    const midX = (edge.p1.x + edge.p2.x) / 2;
    const midY = (edge.p1.y + edge.p2.y) / 2;
    const distMid = pointToLineDistance(midX, midY,
        eraserLine.x1, eraserLine.y1, eraserLine.x2, eraserLine.y2);
    if (distMid < tolerance) {
        return { t: 0.5, hit: true, method: 'midpoint' };
    }

    return { t: -1, hit: false, method: 'miss' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// НОВАЯ v5: TRIM ребра — основная логика усечения
//
// Принцип работы как в CAD Trim:
//   1. Находим точку клика на ребре (параметр t)
//   2. Находим все пересечения ребра с другими объектами (границы)
//   3. Определяем сегмент, в который попал клик
//   4. Удаляем этот сегмент ЦЕЛИКОМ
//   5. Если нет пересечений с объектами — удаляем хвост до конца
//
// Возвращает { newLines: Line[], wasCut: boolean }
// ═══════════════════════════════════════════════════════════════════════════════
function _trimEdge(edge, eraserLine, tolerance, parentObj) {
    const dx = edge.p2.x - edge.p1.x;
    const dy = edge.p2.y - edge.p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return { newLines: [], wasCut: false };

    // ── Шаг 1: Находим точку Trim на ребре ──
    const trimPoint = _findTrimPoint(edge, eraserLine, tolerance);
    if (!trimPoint.hit) {
        _eraserLog('    TRIM: мимо (метод:', trimPoint.method, ')');
        return { newLines: [], wasCut: false };
    }

    _eraserLog('    TRIM: точка клика t=', trimPoint.t.toFixed(3), 'метод:', trimPoint.method);

    // ── Шаг 2: Находим все пересечения с другими объектами ──
    const objIntersections = _getEdgeObjectIntersections(edge, parentObj);
    _eraserLog('    TRIM: пересечений с объектами:', objIntersections.length);

    if (objIntersections.length > 0) {
        // Есть пересечения — находим сегмент, содержащий точку Trim
        // Границы: 0, t1, t2, ..., 1
        const bounds = [0];
        for (const oi of objIntersections) bounds.push(oi.t);
        bounds.push(1);

        _eraserLog('    TRIM: границы сегментов:', bounds.map(b => b.toFixed(3)).join(', '));

        // Ищем сегмент, содержащий trimPoint.t
        let segIdx = -1;
        for (let s = 0; s < bounds.length - 1; s++) {
            if (trimPoint.t >= bounds[s] - 0.001 && trimPoint.t <= bounds[s + 1] + 0.001) {
                segIdx = s;
                break;
            }
        }

        if (segIdx === -1) {
            _eraserLog('    TRIM: сегмент не найден! (выходим за границы)');
            return { newLines: [], wasCut: false };
        }

        const tStart = bounds[segIdx];
        const tEnd = bounds[segIdx + 1];
        _eraserLog('    TRIM: клик в сегменте [', tStart.toFixed(3), '..', tEnd.toFixed(3), '] → УДАЛЯЕМ');

        // Сохраняем все сегменты КРОМЕ найденного
        const newLines = [];
        for (let s = 0; s < bounds.length - 1; s++) {
            if (s === segIdx) continue; // Пропускаем удаляемый сегмент

            const ts = bounds[s];
            const te = bounds[s + 1];
            const sx = edge.p1.x + ts * dx;
            const sy = edge.p1.y + ts * dy;
            const ex = edge.p1.x + te * dx;
            const ey = edge.p1.y + te * dy;
            const segLen = Math.sqrt((ex - sx) * (ex - sx) + (ey - sy) * (ey - sy));

            if (segLen > 0.001) {
                _eraserLog('    TRIM: сохраняем [', ts.toFixed(3), '..', te.toFixed(3), '] длина=', segLen.toFixed(1));
                newLines.push(new Line(sx, sy, ex, ey));
            }
        }

        return { newLines, wasCut: true };
    }

    // ── Шаг 3: Нет пересечений с объектами ──
    const t = trimPoint.t;

    // Если это отдельная линия (type === 'line') без пересечений — удаляем ЦЕЛИКОМ
    if (parentObj && parentObj.type === 'line') {
        _eraserLog('    TRIM: отдельная линия без пересечений → удаляем ЦЕЛИКОМ');
        return { newLines: [], wasCut: true };
    }

    // Для рёбер составных объектов (rect, polygon и т.д.) — обрезаем хвост до конца
    // Это нужно чтобы не уничтожать целые стороны прямоугольника
    if (t < 0.5) {
        _eraserLog('    TRIM: нет пересечений (составной объект), t=', t.toFixed(3), '< 0.5 → удаляем хвост от НАЧАЛА');
        if (t > 0.001) {
            const sx = edge.p1.x + t * dx;
            const sy = edge.p1.y + t * dy;
            return {
                newLines: [new Line(sx, sy, edge.p2.x, edge.p2.y)],
                wasCut: true
            };
        } else {
            _eraserLog('    TRIM: t≈0 → удаляем ВСЮ линию');
            return { newLines: [], wasCut: true };
        }
    } else {
        _eraserLog('    TRIM: нет пересечений (составной объект), t=', t.toFixed(3), '>= 0.5 → удаляем хвост до КОНЦА');
        if (t < 0.999) {
            const ex = edge.p1.x + t * dx;
            const ey = edge.p1.y + t * dy;
            return {
                newLines: [new Line(edge.p1.x, edge.p1.y, ex, ey)],
                wasCut: true
            };
        } else {
            _eraserLog('    TRIM: t≈1 → удаляем ВСЮ линию');
            return { newLines: [], wasCut: true };
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART ERASE — стирание объектов ластиком (v6 TRIM)
//
// Ластик = TRIM в CAD:
//   - Кликаешь по линии → удаляется участок от точки клика
//     до ближайшего пересечения с другим объектом
//   - Если линия не пересекается с другими объектами → удаляется ЦЕЛИКОМ
//   - НИКОГДА не делается надрез — только усечение
// ═══════════════════════════════════════════════════════════════════════════════
function smartEraseWithLine(obj, eraserLine) {
    if (!obj) return false;

    const tolerance = (typeof getEffectiveEraserTolerance === 'function') ? getEffectiveEraserTolerance() : 3;

    // ═══════════════════════════════════════════════════════════════════════════
    // СТИРАНИЕ ЛИНИЙ / ПРЯМОУГОЛЬНИКОВ / ПОЛИГОНОВ
    // ═══════════════════════════════════════════════════════════════════════════
    if (obj.type === 'line' || obj.type === 'rect' || obj.type === 'polygon' || obj.type === 'CustomPolygon') {
        _eraserLog('╔══ TRIM:', obj.type, '══════════════════════════════════════');

        // Для линии показываем координаты
        if (obj.type === 'line') {
            _eraserLog('║ Линия: (', obj.x1.toFixed(1), ',', obj.y1.toFixed(1), ') → (',
                obj.x2.toFixed(1), ',', obj.y2.toFixed(1), ')');
        }
        _eraserLog('║ Ластик: (', eraserLine.x1.toFixed(1), ',', eraserLine.y1.toFixed(1),
            ') → (', eraserLine.x2.toFixed(1), ',', eraserLine.y2.toFixed(1), ')');

        const edges = _getEdges(obj);
        const newLines = [];
        const cutEdges = [];

        for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
            const edge = edges[edgeIndex];
            _eraserLog('║ Ребро', edgeIndex, ': (', edge.p1.x.toFixed(1), ',', edge.p1.y.toFixed(1),
                ') → (', edge.p2.x.toFixed(1), ',', edge.p2.y.toFixed(1), ')');

            const result = _trimEdge(edge, eraserLine, tolerance, obj);

            if (result.wasCut) {
                cutEdges.push(edgeIndex);
                newLines.push(...result.newLines);
                _eraserLog('║ → РЕЗУЛЬТАТ: усечено, новых линий:', result.newLines.length);
            } else {
                _eraserLog('║ → РЕЗУЛЬТАТ: не затронуто');
            }
        }

        // Добавляем нетронутые рёбра
        for (let j = 0; j < edges.length; j++) {
            if (!cutEdges.includes(j)) {
                newLines.push(new Line(edges[j].p1.x, edges[j].p1.y, edges[j].p2.x, edges[j].p2.y));
            }
        }

        if (cutEdges.length > 0) {
            _eraserLog('╚══ TRIM: УСПЕХ — усечено ребер:', cutEdges.length,
                ', всего линий:', newLines.length);

            const idx = objects.indexOf(obj);
            if (idx >= 0) {
                objects.splice(idx, 1);
                objects.push(...newLines);
                const part = findPartForObject(obj);
                if (part) {
                    part.objects = part.objects.filter(o => o !== obj);
                    part.objects.push(...newLines);
                    updatePartBounds(part);
                }
            }
            return true;
        }

        _eraserLog('╚══ TRIM: НЕ УДАЛОСЬ — ни одно ребро не усечено');
        return false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // СТИРАНИЕ ОКРУЖНОСТИ
    // ═══════════════════════════════════════════════════════════════════════════
    if (obj.type === 'circle') {
        _eraserLog('╔══ TRIM: ОКРУЖНОСТЬ ══════════════════════════');
        _eraserLog('║ Центр: (', obj.cx.toFixed(1), ',', obj.cy.toFixed(1), ') r=', obj.radius.toFixed(1));

        const objectIntersections = findCircleIntersections(obj);
        _eraserLog('║ Пересечений с объектами:', objectIntersections.length);

        const eraserPts = findLineCircleIntersection(eraserLine, obj);
        _eraserLog('║ Пересечений с ластиком:', (eraserPts ? eraserPts.length : 0));

        let eraseX, eraseY;

        if (eraserPts && eraserPts.length >= 2) {
            const chordMidX = (eraserPts[0].x + eraserPts[1].x) / 2;
            const chordMidY = (eraserPts[0].y + eraserPts[1].y) / 2;
            const midAngle = Math.atan2(chordMidY - obj.cy, chordMidX - obj.cx);
            eraseX = obj.cx + Math.cos(midAngle) * obj.radius;
            eraseY = obj.cy + Math.sin(midAngle) * obj.radius;
            _eraserLog('║ 2 точки: проекция (', eraseX.toFixed(1), ',', eraseY.toFixed(1), ')');
        } else if (eraserPts && eraserPts.length === 1) {
            eraseX = eraserPts[0].x;
            eraseY = eraserPts[0].y;
            _eraserLog('║ 1 точка (касание): (', eraseX.toFixed(1), ',', eraseY.toFixed(1), ')');
        } else {
            const eraserMidX = (eraserLine.x1 + eraserLine.x2) / 2;
            const eraserMidY = (eraserLine.y1 + eraserLine.y2) / 2;
            const distToCenter = pointToLineDistance(obj.cx, obj.cy,
                eraserLine.x1, eraserLine.y1, eraserLine.x2, eraserLine.y2);

            _eraserLog('║ 0 точек: расстояние от центра до ластика=', distToCenter.toFixed(1));

            if (Math.abs(distToCenter - obj.radius) > tolerance &&
                distToCenter > obj.radius + tolerance) {
                _eraserLog('╚══ TRIM: ластик слишком далеко — ПРОПУСК');
                return false;
            }

            const projAngle = Math.atan2(eraserMidY - obj.cy, eraserMidX - obj.cx);
            eraseX = obj.cx + Math.cos(projAngle) * obj.radius;
            eraseY = obj.cy + Math.sin(projAngle) * obj.radius;
            _eraserLog('║ Проекция: (', eraseX.toFixed(1), ',', eraseY.toFixed(1), ')');
        }

        const arcLines = eraseCircleArc(obj, eraseX, eraseY, objectIntersections);
        if (arcLines.length > 0) {
            _replaceObjectWithLines(obj, arcLines);
            _eraserLog('╚══ TRIM: УСПЕХ — окружность усечена, линий:', arcLines.length);
            return true;
        }

        _eraserLog('╚══ TRIM: НЕ УДАЛОСЬ — eraseCircleArc вернул пусто');
        return false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // СТИРАНИЕ ДУГИ (arc) — TRIM подход
    // ═══════════════════════════════════════════════════════════════════════════
    if (obj.type === 'arc') {
        _eraserLog('╔══ TRIM: ДУГА ════════════════════════════════');

        const pts = (typeof obj.getPoints === 'function') ? obj.getPoints(36) : [];
        if (pts.length < 2) {
            _eraserLog('╚══ TRIM: НЕ УДАЛОСЬ — слишком мало точек');
            return false;
        }

        const edges = [];
        for (let i = 0; i < pts.length - 1; i++) {
            edges.push({ p1: pts[i], p2: pts[i + 1] });
        }

        const newLines = [];
        const cutEdges = [];

        for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
            const result = _trimEdge(edges[edgeIndex], eraserLine, tolerance, obj);
            if (result.wasCut) {
                cutEdges.push(edgeIndex);
                newLines.push(...result.newLines);
            }
        }

        for (let j = 0; j < edges.length; j++) {
            if (!cutEdges.includes(j)) {
                newLines.push(new Line(edges[j].p1.x, edges[j].p1.y, edges[j].p2.x, edges[j].p2.y));
            }
        }

        if (cutEdges.length > 0) {
            _replaceObjectWithLines(obj, newLines);
            _eraserLog('╚══ TRIM: УСПЕХ — дуга усечена, линий:', newLines.length);
            return true;
        }
        _eraserLog('╚══ TRIM: НЕ УДАЛОСЬ — ни одно ребро не усечено');
        return false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // СТИРАНИЕ ПОЛИЛИНИИ / LWPOLYLINE — TRIM подход
    // ═══════════════════════════════════════════════════════════════════════════
    if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        _eraserLog('╔══ TRIM: ПОЛИЛИНИЯ (', obj.type, ') ══════════════');

        const pts = obj.points || obj.vertices || [];
        if (pts.length < 2) {
            _eraserLog('╚══ TRIM: НЕ УДАЛОСЬ — слишком мало точек');
            return false;
        }

        const edges = [];
        for (let i = 0; i < pts.length - 1; i++) {
            edges.push({ p1: pts[i], p2: pts[i + 1] });
        }
        if (obj.closed && pts.length > 2) {
            edges.push({ p1: pts[pts.length - 1], p2: pts[0] });
        }

        const newLines = [];
        const cutEdges = [];

        for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
            const result = _trimEdge(edges[edgeIndex], eraserLine, tolerance, obj);
            if (result.wasCut) {
                cutEdges.push(edgeIndex);
                newLines.push(...result.newLines);
            }
        }

        for (let j = 0; j < edges.length; j++) {
            if (!cutEdges.includes(j)) {
                newLines.push(new Line(edges[j].p1.x, edges[j].p1.y, edges[j].p2.x, edges[j].p2.y));
            }
        }

        if (cutEdges.length > 0) {
            _replaceObjectWithLines(obj, newLines);
            _eraserLog('╚══ TRIM: УСПЕХ — полилиния усечена, линий:', newLines.length);
            return true;
        }
        _eraserLog('╚══ TRIM: НЕ УДАЛОСЬ — ни одно ребро не усечено');
        return false;
    }

    return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНАЯ: заменить объект на массив линий
// ═══════════════════════════════════════════════════════════════════════════════
function _replaceObjectWithLines(obj, newLines) {
    _eraserLog('  → Заменяем объект на', newLines.length, 'линий');
    const idx = objects.indexOf(obj);
    if (idx >= 0) {
        objects.splice(idx, 1);
        objects.push(...newLines);
        const part = findPartForObject(obj);
        if (part) {
            part.objects = part.objects.filter(o => o !== obj);
            part.objects.push(...newLines);
            updatePartBounds(part);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// МИКРОСТЫК — вычисление пересечений линии с полигоном
// ═══════════════════════════════════════════════════════════════════════════════
function findLinePolygonIntersections(line, polygon) {
    const intersections = [];
    const vertices = polygon.getVertices ? polygon.getVertices() : polygon;

    for (let i = 0; i < vertices.length; i++) {
        const next = (i + 1) % vertices.length;
        const edge = new Line(vertices[i].x, vertices[i].y, vertices[next].x, vertices[next].y);
        const pt = findLineIntersection(line, edge);

        if (pt) {
            const distToStart = Math.sqrt(Math.pow(pt.x - vertices[i].x, 2) + Math.pow(pt.y - vertices[i].y, 2));
            const distToEnd = Math.sqrt(Math.pow(pt.x - vertices[next].x, 2) + Math.pow(pt.y - vertices[next].y, 2));
            const edgeLen = Math.sqrt(Math.pow(vertices[next].x - vertices[i].x, 2) + Math.pow(vertices[next].y - vertices[i].y, 2));

            if (distToStart + distToEnd <= edgeLen + 0.5) {
                const exists = intersections.some(existing =>
                    Math.abs(existing.x - pt.x) < 0.5 && Math.abs(existing.y - pt.y) < 0.5
                );
                if (!exists) {
                    intersections.push({ x: pt.x, y: pt.y });
                }
            }
        }
    }

    return intersections;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Вычисление пересечения двух линий
// ═══════════════════════════════════════════════════════════════════════════════
function findLineIntersection(line1, line2) {
    const x1 = line1.x1, y1 = line1.y1, x2 = line1.x2, y2 = line1.y2;
    const x3 = line2.x1, y3 = line2.y1, x4 = line2.x2, y4 = line2.y2;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.001) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= -0.01 && t <= 1.01 && u >= -0.01 && u <= 1.01) {
        return {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1)
        };
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ПЕРЕМЕСТИТЬ КОНЕЧНУЮ ТОЧКУ ЛИНИИ И СВЯЗАННЫЕ С НЕЙ ЛИНИИ (для панели свойств)
// ═══════════════════════════════════════════════════════════════════════════════
function moveLineEndpoint(line, pointType, newX, newY, movedLines = new Set()) {
    if (movedLines.has(line.id)) return; // Уже перемещали эту линию
    movedLines.add(line.id);

    const oldX = pointType === 'start' ? line.x1 : line.x2;
    const oldY = pointType === 'start' ? line.y1 : line.y2;
    const dx = newX - oldX;
    const dy = newY - oldY;

    // Перемещаем точку текущей линии
    if (pointType === 'start') {
        line.x1 = newX;
        line.y1 = newY;
    } else {
        line.x2 = newX;
        line.y2 = newY;
    }

    // Находим все линии, связанные с этой точкой
    for (const other of objects) {
        if (other.type !== 'line' || other === line) continue;
        if (movedLines.has(other.id)) continue;

        // Проверяем, соединена ли другая линия с этой точкой
        const isStartConnected = Math.abs(other.x1 - oldX) < 1 && Math.abs(other.y1 - oldY) < 1;
        const isEndConnected = Math.abs(other.x2 - oldX) < 1 && Math.abs(other.y2 - oldY) < 1;

        if (isStartConnected) {
            moveLineEndpoint(other, 'start', other.x1 + dx, other.y1 + dy, movedLines);
        } else if (isEndConnected) {
            moveLineEndpoint(other, 'end', other.x2 + dx, other.y2 + dy, movedLines);
        }
    }
}

console.log('✅ geometry-utils.js v6 (TRIM + moveLineEndpoint) loaded');