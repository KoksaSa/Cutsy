// ═══════════════════════════════════════════════════════════════
// ФУНКЦИИ ПРИВЯЗОК (SNAPPING) — исправленная версия
// ═══════════════════════════════════════════════════════════════
// Вынесено из index.html для удобства поддержки

// ═══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ УГЛОВ
// ═══════════════════════════════════════════════════════════════

// Разница углов в градусах с учётом перехода через 360° (результат 0..180)
function angleDiffDeg(a, b) {
    let d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

// Разница углов в радианах с учётом перехода через 2π (результат 0..π)
function angleDiffRad(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
}

// Проверка, попадает ли угол на дугу
function isAngleOnArc(angle, arc) {
    let startAngle = arc.startAngle || 0;
    let endAngle = arc.endAngle || Math.PI * 2;
    let direction = arc.direction || 'CCW';
    
    // Нормализуем углы в диапазон [0, 2π]
    const normalize = (a) => {
        a = a % (Math.PI * 2);
        if (a < 0) a += Math.PI * 2;
        return a;
    };
    
    const a = normalize(angle);
    const s = normalize(startAngle);
    const e = normalize(endAngle);
    
    if (direction === 'CCW') {
        if (s <= e) return a >= s && a <= e;
        else return a >= s || a <= e;
    } else { // CW
        if (s <= e) return a >= s || a <= e;  // v4.40 FIX S1: CW wrap-through-0
        else return a >= e && a <= s;  // v4.40 FIX S1: CW no-wrap
    }
}

// ═══════════════════════════════════════════════════════════════
// ОРТОГОНАЛЬНОСТЬ
// ═══════════════════════════════════════════════════════════════
// applyOrtho(startX, startY, endX, endY) - выравнивает линию по углам
// Углы: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
//
// [FIX #1] Начальный minDiff теперь учитывает переход через 360°

function applyOrtho(startX, startY, endX, endY, forceOrtho = false) {
    if (!orthoEnabled && !forceOrtho) return { x: endX, y: endY };

    // Вычисляем угол линии
    let angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    // Находим ближайший угол из списка ORTHO_ANGLES
    // [FIX] Используем angleDiffDeg для корректного сравнения через 360°
    let closestAngle = ORTHO_ANGLES[0];
    let minDiff = angleDiffDeg(angle, ORTHO_ANGLES[0]);

    for (const orthoAngle of ORTHO_ANGLES) {
        const diff = angleDiffDeg(angle, orthoAngle);
        if (diff < minDiff) {
            minDiff = diff;
            closestAngle = orthoAngle;
        }
    }

    // Вычисляем длину линии
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.sqrt(dx * dx + dy * dy);

    // Вычисляем новые координаты с выровненным углом
    const rad = closestAngle * (Math.PI / 180);
    return {
        x: startX + Math.cos(rad) * length,
        y: startY + Math.sin(rad) * length
    };
}

// ═══════════════════════════════════════════════════════════════
// УГЛОВЫЕ ПРИВЯЗКИ ЛИНИИ (Fusion 360 style)
// ═══════════════════════════════════════════════════════════════
//
// [FIX #5] Безопасная проверка obj.length

function findAngleConstraintSnap(startX, startY, endX, endY, excludeObj = null) {
    if (!snapEnabled) return null;

    const ANGLE_TOLERANCE = 5 * (Math.PI / 180); // 5 градусов
    // [FIX] Безопасное получение длины: свойство или метод
    const lines = objects.filter(obj => {
        if (obj.type !== 'line' || obj === excludeObj) return false;
        const len = typeof obj.length === 'function' ? obj.length() : obj.length;
        return len > 1;
    });
    const mouseAngle = Math.atan2(endY - startY, endX - startX);
    const mouseDist = Math.hypot(endX - startX, endY - startY);

    if (mouseDist < 1) return null;

    let bestSnap = null;
    let minAngleDiff = ANGLE_TOLERANCE;

    for (const line of lines) {
        const lineAngle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);

        // --- Проверка параллельности ---
        const parallelCandidates = [lineAngle, lineAngle + Math.PI];
        for (const candidate of parallelCandidates) {
            const diff = angleDiffRad(mouseAngle, candidate);
            if (diff < minAngleDiff) {
                minAngleDiff = diff;
                bestSnap = {
                    x: startX + Math.cos(candidate) * mouseDist,
                    y: startY + Math.sin(candidate) * mouseDist,
                    type: 'parallel',
                    obj: line,
                    angle: candidate,
                    label: '∥ Параллельно'
                };
            }
        }

        // --- Проверка перпендикулярности ---
        const perpCandidates = [lineAngle + Math.PI / 2, lineAngle - Math.PI / 2];
        for (const candidate of perpCandidates) {
            const diff = angleDiffRad(mouseAngle, candidate);
            if (diff < minAngleDiff) {
                minAngleDiff = diff;
                bestSnap = {
                    x: startX + Math.cos(candidate) * mouseDist,
                    y: startY + Math.sin(candidate) * mouseDist,
                    type: 'perpendicular',
                    obj: line,
                    angle: candidate,
                    label: '⟂ Перпендикулярно'
                };
            }
        }
    }

    return bestSnap;
}

// ═══════════════════════════════════════════════════════════════
// ГЕОМЕТРИЧЕСКИЕ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════

// Поиск пересечения двух линий
function findLineIntersection(l1, l2) {
    const x1 = l1.x1, y1 = l1.y1, x2 = l1.x2, y2 = l1.y2;
    const x3 = l2.x1, y3 = l2.y1, x4 = l2.x2, y4 = l2.y2;

    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (denom === 0) return null; // Параллельные линии

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
        return {
            x: x1 + ua * (x2 - x1),
            y: y1 + ua * (y2 - y1)
        };
    }
    return null;
}

// Ближайшая точка на отрезке
function getClosestPointOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return { x: x1, y: y1 };

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    return {
        x: x1 + t * dx,
        y: y1 + t * dy
    };
}

// [FIX #11] Расстояние от точки до отрезка (отсутствовавшая функция)
function pointToLineDistance(px, py, x1, y1, x2, y2) {
    const closest = getClosestPointOnSegment(px, py, x1, y1, x2, y2);
    const dx = px - closest.x;
    const dy = py - closest.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// ═══════════════════════════════════════════════════════════════
// КАСАТЕЛЬНЫЕ К КРУГУ
// ═══════════════════════════════════════════════════════════════

// Найти точки касания из точки к кругу
// Возвращает массив точек {x, y, angle} или пустой массив если нет касательных
//
// [FIX #4] Защита от NaN при dist ≈ radius (floating point)

function findTangentPointsToCircle(pointX, pointY, circle) {
    const tangents = [];

    const dx = pointX - circle.cx;
    const dy = pointY - circle.cy;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);

    // [FIX] Добавлен допуск 1e-6 — точка на окружности не имеет касательных
    if (dist <= circle.radius + 1e-6) return [];

    const baseAngle = Math.atan2(dy, dx);

    // [FIX] Clamp ratio на случай floating point погрешности
    const ratio = Math.min(circle.radius / dist, 1.0);
    const angleOffset = Math.acos(ratio);

    const angle1 = baseAngle + angleOffset;
    const angle2 = baseAngle - angleOffset;

    tangents.push({
        x: circle.cx + Math.cos(angle1) * circle.radius,
        y: circle.cy + Math.sin(angle1) * circle.radius,
        angle: angle1
    });

    tangents.push({
        x: circle.cx + Math.cos(angle2) * circle.radius,
        y: circle.cy + Math.sin(angle2) * circle.radius,
        angle: angle2
    });

    return tangents;
}

// ═══════════════════════════════════════════════════════════════
// ПРИВЯЗКИ (SNAP) — ОСНОВНАЯ ФУНКЦИЯ
// ═══════════════════════════════════════════════════════════════

// Поиск точки привязки (расширенный: точки + грани + линии)
//
// [FIX #3] Круг обрабатывается отдельно — проекция на окружность, а не на прямые «грани»
// [FIX #12] Math.pow(x, 2) заменён на x * x

function findSnapPoint(mouseX, mouseY, excludeObj = null) {
    if (!snapEnabled) return null;

    const isArray = Array.isArray(excludeObj);
    function isExcluded(obj) {
        return isArray ? excludeObj.includes(obj) : obj === excludeObj;
    }

    // v4.67: Чёткий приоритет привязок — каждый тип имеет свой "слой".
    // Точки > Пересечения > Центры > Середины > Проекции > Origin
    const SNAP_D = (typeof window.getEffectiveSnapDistance === 'function') ? window.getEffectiveSnapDistance() : (typeof SNAP_DISTANCE !== 'undefined' ? SNAP_DISTANCE : 6);

    // Слой 1: Точки объектов (вершины, концы линий)
    let bestPoint = null, minPointDist = SNAP_D;
    objects.forEach(obj => {
        if (isExcluded(obj)) return;
        if (typeof obj.getPoints !== 'function') return;
        const pts = obj.getPoints();
        const maxIdx = obj.type === 'rect' ? Math.min(4, pts.length) : pts.length;
        for (let i = 0; i < maxIdx; i++) {
            const pt = pts[i];
            if (!pt || typeof pt.x !== 'number') continue;
            const d = Math.hypot(pt.x - mouseX, pt.y - mouseY);
            if (d < minPointDist) { minPointDist = d; bestPoint = { x: pt.x, y: pt.y, type: 'point', obj: obj, priority: 1 }; }
        }
        if (obj.type === 'arc' && typeof obj.getStartPoint === 'function') {
            const sp = obj.getStartPoint();
            const sd = Math.hypot(sp.x - mouseX, sp.y - mouseY);
            if (sd < minPointDist) { minPointDist = sd; bestPoint = { x: sp.x, y: sp.y, type: 'point', obj, priority: 1 }; }
            const ep = obj.getEndPoint();
            const ed = Math.hypot(ep.x - mouseX, ep.y - mouseY);
            if (ed < minPointDist) { minPointDist = ed; bestPoint = { x: ep.x, y: ep.y, type: 'point', obj, priority: 1 }; }
        }
        // v4.67: точки полилиний/CustomPolygon
        if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const ppts = obj.points || obj.vertices || [];
            for (const pt of ppts) {
                if (!pt || typeof pt.x !== 'number') continue;
                const d = Math.hypot(pt.x - mouseX, pt.y - mouseY);
                if (d < minPointDist) { minPointDist = d; bestPoint = { x: pt.x, y: pt.y, type: 'point', obj, priority: 1 }; }
            }
        }
    });

    // Слой 2: Пересечения линий
    let bestIntersect = null, minIntersectDist = SNAP_D;
    const ints = findAllLineIntersections(excludeObj, isArray);
    for (const it of ints) {
        const d = Math.hypot(it.x - mouseX, it.y - mouseY);
        if (d < minIntersectDist) { minIntersectDist = d; bestIntersect = { x: it.x, y: it.y, type: 'intersection', priority: 2 }; }
    }

    // Слой 3: Центры кругов/дуг
    let bestCenter = null, minCenterDist = SNAP_D;
    objects.forEach(obj => {
        if (isExcluded(obj)) return;
        if (obj.type === 'circle' || obj.type === 'arc') {
            const d = Math.hypot(obj.cx - mouseX, obj.cy - mouseY);
            if (d < minCenterDist) { minCenterDist = d; bestCenter = { x: obj.cx, y: obj.cy, type: 'center', obj: obj, priority: 3 }; }
        }
    });

    // Слой 4: Середины линий/граней
    let bestMid = null, minMidDist = SNAP_D;
    objects.forEach(obj => {
        if (isExcluded(obj)) return;
        if (obj.type === 'line') {
            const mx = (obj.x1 + obj.x2) / 2, my = (obj.y1 + obj.y2) / 2;
            const d = Math.hypot(mx - mouseX, my - mouseY);
            if (d < minMidDist) { minMidDist = d; bestMid = { x: mx, y: my, type: 'midpoint', obj: obj, priority: 4 }; }
        } else if (obj.type === 'rect' || obj.type === 'polygon') {
            const edges = getObjectEdges(obj);
            for (const edge of edges) {
                const d = Math.hypot(edge.midX - mouseX, edge.midY - mouseY);
                if (d < minMidDist) { minMidDist = d; bestMid = { x: edge.midX, y: edge.midY, type: 'midpoint', obj: obj, priority: 4 }; }
            }
        }
    });

    // Слой 5: Проекции на линии/грани/окружности
    let bestProj = null, minProjDist = SNAP_D;
    objects.forEach(obj => {
        if (isExcluded(obj)) return;
        if (obj.type === 'line') {
            const proj = getClosestPointOnSegment(mouseX, mouseY, obj.x1, obj.y1, obj.x2, obj.y2);
            const d = Math.hypot(proj.x - mouseX, proj.y - mouseY);
            if (d < minProjDist) { minProjDist = d; bestProj = { x: proj.x, y: proj.y, type: 'line', obj: obj, priority: 5 }; }
        } else if (obj.type === 'rect' || obj.type === 'polygon') {
            const edges = getObjectEdges(obj);
            for (const edge of edges) {
                const proj = getClosestPointOnSegment(mouseX, mouseY, edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
                const d = Math.hypot(proj.x - mouseX, proj.y - mouseY);
                if (d < minProjDist) { minProjDist = d; bestProj = { x: proj.x, y: proj.y, type: 'edge', obj: obj, edge: edge, priority: 5 }; }
            }
        } else if (obj.type === 'circle') {
            const dx = mouseX - obj.cx, dy = mouseY - obj.cy;
            const distFromCenter = Math.hypot(dx, dy);
            if (distFromCenter > 0.01) {
                const sx = obj.cx + (dx / distFromCenter) * obj.radius;
                const sy = obj.cy + (dy / distFromCenter) * obj.radius;
                const d = Math.hypot(sx - mouseX, sy - mouseY);
                if (d < minProjDist) { minProjDist = d; bestProj = { x: sx, y: sy, type: 'edge', obj: obj, priority: 5 }; }
            }
        } else if (obj.type === 'arc') {
            const dx = mouseX - obj.cx, dy = mouseY - obj.cy;
            const distFromCenter = Math.hypot(dx, dy);
            if (distFromCenter > 0.01 && obj.radius > 0) {
                const sx = obj.cx + (dx / distFromCenter) * obj.radius;
                const sy = obj.cy + (dy / distFromCenter) * obj.radius;
                const snapAngle = Math.atan2(sy - obj.cy, sx - obj.cx);
                if (isAngleOnArc(snapAngle, obj)) {
                    const d = Math.hypot(sx - mouseX, sy - mouseY);
                    if (d < minProjDist) { minProjDist = d; bestProj = { x: sx, y: sy, type: 'edge', obj: obj, priority: 5 }; }
                }
            }
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const pts = obj.points || obj.vertices || [];
            for (let i = 0; i < pts.length - 1; i++) {
                if (!pts[i] || !pts[i+1]) continue;
                const proj = getClosestPointOnSegment(mouseX, mouseY, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
                const d = Math.hypot(proj.x - mouseX, proj.y - mouseY);
                if (d < minProjDist) { minProjDist = d; bestProj = { x: proj.x, y: proj.y, type: 'edge', obj: obj, priority: 5 }; }
            }
            for (let i = 0; i < pts.length - 1; i++) {
                if (!pts[i] || !pts[i+1]) continue;
                const mx = (pts[i].x + pts[i+1].x) / 2, my = (pts[i].y + pts[i+1].y) / 2;
                const d = Math.hypot(mx - mouseX, my - mouseY);
                if (d < minMidDist) { minMidDist = d; bestMid = { x: mx, y: my, type: 'midpoint', obj: obj, priority: 4 }; }
            }
        }
    });

    // Слой 6: Origin (0,0)
    let bestOrigin = null;
    const od = Math.hypot(0 - mouseX, 0 - mouseY);
    if (od < SNAP_D) { bestOrigin = { x: 0, y: 0, type: 'origin', priority: 6 }; }

    // Выбор по приоритету
    if (bestPoint) return bestPoint;
    if (bestIntersect) return bestIntersect;
    if (bestCenter) return bestCenter;
    if (bestMid) return bestMid;
    if (bestProj) return bestProj;
    if (bestOrigin) return bestOrigin;
    return null;
}

// ═══════════════════════════════════════════════════════════════
// ТОЛЬКО ТОЧКИ (без проекций на линии)
// ═══════════════════════════════════════════════════════════════
//
// [FIX #2] Убран includes(pt) — сравнение по значению, а не по ссылке
// [FIX #7] Рефакторинг: делегирует в findSnapPoint, фильтрует результат
// [FIX #9] Явный приоритет: точки > пересечения > касательные

function findSnapPointOnly(x, y, excludeObj = null) {
    if (!snapEnabled) return null;

    const isArray = Array.isArray(excludeObj);

    function isExcluded(obj) {
        return isArray ? excludeObj.includes(obj) : obj === excludeObj;
    }

    // ─── Приоритет 1: Точки объектов и центр координат ─────────
    let closest = null;
    const minDist = (typeof window.getEffectiveSnapDistance === 'function') ? window.getEffectiveSnapDistance() : (typeof SNAP_DISTANCE !== 'undefined' ? SNAP_DISTANCE : 6);

    // Центр координат (0, 0)
    const ox = 0 - x, oy = 0 - y;
    const originDist = Math.sqrt(ox * ox + oy * oy);
    if (originDist < minDist) {
        minDist = originDist;
        closest = { x: 0, y: 0, isOrigin: true, type: 'origin' };
    }

    objects.forEach(obj => {
        if (isExcluded(obj)) return;

        // [FIX #2] Получаем точки один раз, ищем индекс по координатам
        const allPoints = obj.getPoints();

        allPoints.forEach((pt, ptIndex) => {
            // Для rect: первые 4 точки — вершины, остальные — середины/центр
            if (obj.type === 'rect' && ptIndex >= 4) return;
            // Для polygon: все точки из getVertices() — вершины
            // (предполагаем, что getPoints() для polygon возвращает только вершины)

            const dx = pt.x - x, dy = pt.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                closest = { x: pt.x, y: pt.y, type: 'point', obj: obj };
            }
        });

        // Центр круга
        if (obj.type === 'circle') {
            const dx = obj.cx - x, dy = obj.cy - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                closest = { x: obj.cx, y: obj.cy, type: 'center', obj: obj };
            }
        }

        // Центр дуги
        if (obj.type === 'arc') {
            const dx = obj.cx - x, dy = obj.cy - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                closest = { x: obj.cx, y: obj.cy, type: 'center', obj: obj };
            }
        }
    });

    // ─── Приоритет 2: Пересечения линий ────────────────────────
    const intersections = findAllLineIntersections(excludeObj, isArray);
    for (const intersect of intersections) {
        const dx = intersect.x - x, dy = intersect.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
            minDist = dist;
            closest = { x: intersect.x, y: intersect.y, type: 'intersection', intersectingLines: intersect.lines };
        }
    }

    // ─── Приоритет 3: Касательные к кругам ─────────────────────
    const tangentPoints = findAllTangentPoints(excludeObj, isArray);
    for (const tangent of tangentPoints) {
        const dx = tangent.x - x, dy = tangent.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
            minDist = dist;
            closest = { x: tangent.x, y: tangent.y, type: 'tangent', circle: tangent.circle, line: tangent.line };
        }
    }

    return closest;
}

// ═══════════════════════════════════════════════════════════════
// ПОИСК ТОЧКИ ОБЪЕКТА
// ═══════════════════════════════════════════════════════════════
//
// [FIX #6] indexOf(pt) заменён на findIndex по координатам

function findObjectPoint(mouseX, mouseY) {
    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (!obj || typeof obj.getPoints !== 'function') continue;

        const points = obj.getPoints();
        for (let ptIdx = 0; ptIdx < points.length; ptIdx++) {
            const pt = points[ptIdx];
            const dx = pt.x - mouseX, dy = pt.y - mouseY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const snapRadius = (typeof window.getEffectiveSnapDistance === 'function') ? window.getEffectiveSnapDistance() : (typeof SNAP_DISTANCE !== 'undefined' ? SNAP_DISTANCE : 6);
            if (dist < snapRadius) {
                let pointType = null;
                let edgeIndex = 0;

                if (obj.type === 'line') {
                    if (Math.abs(pt.x - obj.x1) < 0.1 && Math.abs(pt.y - obj.y1) < 0.1) pointType = 'start';
                    else if (Math.abs(pt.x - obj.x2) < 0.1 && Math.abs(pt.y - obj.y2) < 0.1) pointType = 'end';
                    else pointType = 'center';
                } else if (obj.type === 'circle') {
                    if (Math.abs(pt.x - obj.cx) < 0.1 && Math.abs(pt.y - obj.cy) < 0.1) pointType = 'center';
                    else pointType = 'edge';
                } else if (obj.type === 'rect') {
                    // [FIX] Используем ptIdx из цикла вместо indexOf
                    if (ptIdx >= 4 && ptIdx < 8) {
                        pointType = 'edge';
                        edgeIndex = ptIdx - 4;
                    } else if (ptIdx === 8) {
                        pointType = 'center';
                    } else {
                        pointType = 'vertex';
                    }
                } else if (obj.type === 'polygon') {
                    if (Math.abs(pt.x - obj.cx) < 0.1 && Math.abs(pt.y - obj.cy) < 0.1) pointType = 'center';
                    else pointType = 'vertex';
                } else if (obj.type === 'arc') {
                    if (Math.abs(pt.x - obj.cx) < 0.1 && Math.abs(pt.y - obj.cy) < 0.1) pointType = 'center';
                    else pointType = 'edge';
                }

                return { obj, point: pt, pointType, edgeIndex };
            }
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
// ВСЕ ПЕРЕСЕЧЕНИЯ ЛИНИЙ
// ═══════════════════════════════════════════════════════════════

function findAllLineIntersections(excludeObj = null, isArray = false) {
    const intersections = [];
    const lines = objects.filter(obj => obj.type === 'line');

    function isExcluded(obj) {
        return isArray ? excludeObj.includes(obj) : obj === excludeObj;
    }

    for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
            const l1 = lines[i];
            const l2 = lines[j];

            if (isExcluded(l1) || isExcluded(l2)) continue;

            const intersect = findLineIntersection(l1, l2);
            if (intersect) {
                const exists = intersections.some(existing =>
                    Math.abs(existing.x - intersect.x) < 0.1 &&
                    Math.abs(existing.y - intersect.y) < 0.1
                );

                if (!exists) {
                    intersections.push({
                        x: intersect.x,
                        y: intersect.y,
                        lines: [l1, l2]
                    });
                }
            }
        }
    }

    return intersections;
}

// ═══════════════════════════════════════════════════════════════
// ВСЕ КАСАТЕЛЬНЫЕ К КРУГАМ
// ═══════════════════════════════════════════════════════════════

function findAllTangentPoints(excludeObj = null, isArray = false) {
    const tangents = [];
    const circles = objects.filter(obj => obj.type === 'circle');
    const lines = objects.filter(obj => obj.type === 'line');

    function isExcluded(obj) {
        return isArray ? excludeObj.includes(obj) : obj === excludeObj;
    }

    for (const line of lines) {
        if (isExcluded(line)) continue;

        for (const circle of circles) {
            if (isExcluded(circle)) continue;

            const tangents1 = findTangentPointsToCircle(line.x1, line.y1, circle);
            const tangents2 = findTangentPointsToCircle(line.x2, line.y2, circle);

            for (const tangent of [...tangents1, ...tangents2]) {
                const exists = tangents.some(existing =>
                    Math.abs(existing.x - tangent.x) < 0.1 &&
                    Math.abs(existing.y - tangent.y) < 0.1
                );

                if (!exists) {
                    tangents.push({
                        x: tangent.x,
                        y: tangent.y,
                        circle: circle,
                        line: line
                    });
                }
            }
        }
    }

    return tangents;
}

// ═══════════════════════════════════════════════════════════════
// ГРАНИ ОБЪЕКТОВ
// ═══════════════════════════════════════════════════════════════
//
// [FIX #3] Круг больше НЕ возвращает «грани» как прямые отрезки.
//          Привязка к окружности обрабатывается отдельно в findSnapPoint.

function getObjectEdges(obj) {
    const edges = [];

    if (obj.type === 'rect') {
        const points = obj.getPoints().slice(0, 4);
        for (let i = 0; i < 4; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % 4];
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            edges.push({ p1, p2, length, angle, midX, midY, index: i });
        }
    } else if (obj.type === 'polygon') {
        const vertices = obj.getVertices();
        for (let i = 0; i < vertices.length; i++) {
            const p1 = vertices[i];
            const p2 = vertices[(i + 1) % vertices.length];
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            edges.push({ p1, p2, length, angle, midX, midY, index: i });
        }
    } else if (obj.type === 'circle') {
        // [FIX #3] Круг НЕ возвращает фиктивные прямые грани.
        // Привязка к окружности обрабатывается в findSnapPoint через
        // проекцию на окружность, а не на прямые отрезки N→E→S→W.
        // findEdgeAtPoint по-прежнему обрабатывает круг отдельно.
        // Возвращаем пустой массив — потребитель (findSnapPoint) использует
        // отдельную логику для окружности.
    } else if (obj.type === 'line') {
        const p1 = { x: obj.x1, y: obj.y1 };
        const p2 = { x: obj.x2, y: obj.y2 };
        const len = typeof obj.length === 'function' ? obj.length() : obj.length;
        edges.push({
            p1, p2,
            length: len,
            angle: typeof obj.getAngle === 'function' ? obj.getAngle() : Math.atan2(p2.y - p1.y, p2.x - p1.x),
            midX: (p1.x + p2.x) / 2,
            midY: (p1.y + p2.y) / 2,
            index: 0
        });
    }

    return edges;
}

// Поиск грани под курсором
function findEdgeAtPoint(x, y) {
    const tolerance = 15;
    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];

        // Особая обработка для круга — ищем ближайшую точку на окружности
        if (obj.type === 'circle') {
            const dx = x - obj.cx;
            const dy = y - obj.cy;
            const distFromCenter = Math.sqrt(dx * dx + dy * dy);
            const distFromCircle = Math.abs(distFromCenter - obj.radius);

            if (distFromCircle < tolerance) {
                if (distFromCenter > 0) {
                    const snapX = obj.cx + (dx / distFromCenter) * obj.radius;
                    const snapY = obj.cy + (dy / distFromCenter) * obj.radius;
                    return {
                        obj,
                        edge: {
                            p1: { x: snapX, y: snapY },
                            p2: { x: snapX, y: snapY },
                            isCircle: true,
                            cx: obj.cx,
                            cy: obj.cy,
                            radius: obj.radius
                        }
                    };
                }
            }
            continue;
        }

        // Особая обработка для дуги (arc)
        if (obj.type === 'arc') {
            const dx = x - obj.cx;
            const dy = y - obj.cy;
            const distFromCenter = Math.sqrt(dx * dx + dy * dy);
            const distFromArc = Math.abs(distFromCenter - obj.radius);

            if (distFromArc < tolerance) {
                if (distFromCenter > 0) {
                    const snapX = obj.cx + (dx / distFromCenter) * obj.radius;
                    const snapY = obj.cy + (dy / distFromCenter) * obj.radius;
                    return {
                        obj,
                        edge: {
                            p1: { x: snapX, y: snapY },
                            p2: { x: snapX, y: snapY },
                            isCircle: true,
                            cx: obj.cx,
                            cy: obj.cy,
                            radius: obj.radius
                        }
                    };
                }
            }
            continue;
        }

        const edges = getObjectEdges(obj);
        for (let edge of edges) {
            const dist = pointToLineDistance(x, y, edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
            if (dist < tolerance) {
                return { obj, edge };
            }
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
// ЭКСПОРТЫ
// ═══════════════════════════════════════════════════════════════
// [FIX #10] Все функции экспортируются глобально

window.applyOrtho = applyOrtho;
window.findAngleConstraintSnap = findAngleConstraintSnap;
window.findLineIntersection = findLineIntersection;
window.getClosestPointOnSegment = getClosestPointOnSegment;
window.pointToLineDistance = pointToLineDistance;
window.findTangentPointsToCircle = findTangentPointsToCircle;
window.findSnapPointOnly = findSnapPointOnly;
window.findSnapPoint = findSnapPoint;
window.findObjectPoint = findObjectPoint;
window.findAllLineIntersections = findAllLineIntersections;
window.findAllTangentPoints = findAllTangentPoints;
window.getObjectEdges = getObjectEdges;
window.findEdgeAtPoint = findEdgeAtPoint;
window.angleDiffDeg = angleDiffDeg;
window.angleDiffRad = angleDiffRad;