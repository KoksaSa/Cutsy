// ═══════════════════════════════════════════════════════════════
// ФУНКЦИИ ПРИВЯЗОК (SNAPPING)
// ═══════════════════════════════════════════════════════════════
// Вынесено из index.html для удобства поддержки

// ═══════════════════════════════════════════════════════════════
// ОРТОГОНАЛЬНОСТЬ
// ═══════════════════════════════════════════════════════════════
// applyOrtho(startX, startY, endX, endY) - выравнивает линию по углам
// Углы: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°

function applyOrtho(startX, startY, endX, endY) {
    if (!orthoEnabled) return { x: endX, y: endY };

    // Вычисляем угол линии
    let angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    // Находим ближайший угол из списка ORTHO_ANGLES
    let closestAngle = ORTHO_ANGLES[0];
    let minDiff = Math.abs(angle - ORTHO_ANGLES[0]);

    for (const orthoAngle of ORTHO_ANGLES) {
        let diff = Math.abs(angle - orthoAngle);
        // Учитываем переход через 360°
        if (diff > 180) diff = 360 - diff;

        if (diff < minDiff) {
            minDiff = diff;
            closestAngle = orthoAngle;
        }
    }

    // Вычисляем длину линии
    const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));

    // Вычисляем новые координаты с выровненным углом
    const rad = closestAngle * (Math.PI / 180);
    return {
        x: startX + Math.cos(rad) * length,
        y: startY + Math.sin(rad) * length
    };
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

// ═══════════════════════════════════════════════════════════════
// КАСАТЕЛЬНЫЕ К КРУГУ
// ═══════════════════════════════════════════════════════════════

// Найти точки касания из точки к кругу
// Возвращает массив точек {x, y, angle} или пустой массив если нет касательных
function findTangentPointsToCircle(pointX, pointY, circle) {
    const tangents = [];
    
    const dx = pointX - circle.cx;
    const dy = pointY - circle.cy;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);
    
    // Точка внутри круга - нет касательных
    if (dist <= circle.radius) return [];
    
    // Угол от центра круга к точке
    const baseAngle = Math.atan2(dy, dx);
    
    // Угол смещения (теорема Пифагора)
    const angleOffset = Math.acos(circle.radius / dist);
    
    // Две точки касания
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
// ТОЛЬКО ТОЧКИ (без проекций на линии)
// ═══════════════════════════════════════════════════════════════

// Найти только реальные точки объектов (концы, центры, пересечения, касательные)
function findSnapPointOnly(x, y, excludeObj = null) {
    if (!snapEnabled) return null;
    
    let closest = null, minDist = 4; // Точное расстояние 4px
    const isArray = Array.isArray(excludeObj);

    // 1. Центр координат (0, 0)
    const originDist = Math.sqrt(Math.pow(0 - x, 2) + Math.pow(0 - y, 2));
    if (originDist < minDist) {
        minDist = originDist;
        closest = { x: 0, y: 0, isOrigin: true, type: 'origin' };
    }

    // 2. Точки объектов (концы линий, центры кругов, вершины)
    objects.forEach(obj => {
        if (isArray) {
            if (excludeObj.includes(obj)) return;
        } else {
            if (obj === excludeObj) return;
        }

        // Конечные точки объекта
        const points = obj.getPoints();
        points.forEach(pt => {
            // Пропускаем "виртуальные" точки (середина, центр прямоугольника)
            // Нас интересуют только реальные вершины
            if (obj.type === 'rect' || obj.type === 'polygon') {
                // Для прямоугольников и многоугольников - только вершины (первые 4 точки для rect, все для polygon)
                const vertices = obj.getPoints().slice(0, 4);
                if (!vertices.includes(pt) && obj.type === 'rect') return;
            }
            
            const dist = Math.sqrt(Math.pow(pt.x - x, 2) + Math.pow(pt.y - y, 2));
            if (dist < minDist) {
                minDist = dist;
                closest = { x: pt.x, y: pt.y, type: 'point', obj: obj };
            }
        });

        // Центр круга
        if (obj.type === 'circle') {
            const dist = Math.sqrt(Math.pow(obj.cx - x, 2) + Math.pow(obj.cy - y, 2));
            if (dist < minDist) {
                minDist = dist;
                closest = { x: obj.cx, y: obj.cy, type: 'center', obj: obj };
            }
        }
    });

    // 3. Пересечения линий (только если они очень близко)
    const intersections = findAllLineIntersections(excludeObj, isArray);
    for (const intersect of intersections) {
        const dist = Math.sqrt(Math.pow(intersect.x - x, 2) + Math.pow(intersect.y - y, 2));
        if (dist < minDist) {
            minDist = dist;
            closest = { x: intersect.x, y: intersect.y, type: 'intersection', intersectingLines: intersect.lines };
        }
    }

    // 4. Касательные к кругам (только если очень близко)
    const tangentPoints = findAllTangentPoints(excludeObj, isArray);
    for (const tangent of tangentPoints) {
        const dist = Math.sqrt(Math.pow(tangent.x - x, 2) + Math.pow(tangent.y - y, 2));
        if (dist < minDist) {
            minDist = dist;
            closest = { x: tangent.x, y: tangent.y, type: 'tangent', circle: tangent.circle, line: tangent.line };
        }
    }

    return closest;
}

// Экспортируем глобально
window.findSnapPointOnly = findSnapPointOnly;

// ═══════════════════════════════════════════════════════════════
// ПРИВЯЗКИ (SNAP) - РАСШИРЕННЫЕ (ГРАНИ + ЛИНИИ)
// ═══════════════════════════════════════════════════════════════

// Поиск точки привязки (расширенный: точки + грани + линии)
function findSnapPoint(mouseX, mouseY, excludeObj = null) {
    if (!snapEnabled) return null;
    let closest = null, minDist = SNAP_DISTANCE;
    let snapType = 'point'; // Тип привязки: 'point', 'edge', 'line'

    // Проверяем, является ли excludeObj массивом
    const isArray = Array.isArray(excludeObj);

    // Сначала проверяем центр координат (0, 0) в мировых координатах
    const originDist = Math.sqrt(Math.pow(0 - mouseX, 2) + Math.pow(0 - mouseY, 2));
    if (originDist < minDist) {
        minDist = originDist;
        closest = { x: 0, y: 0, isOrigin: true, type: 'origin' };
    }

    objects.forEach(obj => {
        if (isArray) {
            if (excludeObj.includes(obj)) return;
        } else {
            if (obj === excludeObj) return;
        }
        
        // 1. Привязка к точкам объекта (вершины, центры)
        obj.getPoints().forEach(pt => {
            const dist = Math.sqrt(Math.pow(pt.x - mouseX, 2) + Math.pow(pt.y - mouseY, 2));
            if (dist < minDist) {
                minDist = dist;
                closest = { x: pt.x, y: pt.y, type: 'point', obj: obj };
            }
        });

        // 2. Привязка к граням (прямоугольники, многоугольники)
        const edges = getObjectEdges(obj);
        for (const edge of edges) {
            // Ближайшая точка на грани
            const proj = getClosestPointOnSegment(mouseX, mouseY, edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
            const dist = Math.sqrt(Math.pow(proj.x - mouseX, 2) + Math.pow(proj.y - mouseY, 2));
            
            if (dist < minDist) {
                minDist = dist;
                closest = { x: proj.x, y: proj.y, type: 'edge', obj: obj, edge: edge };
            }

            // Привязка к середине грани
            const midDist = Math.sqrt(Math.pow(edge.midX - mouseX, 2) + Math.pow(edge.midY - mouseY, 2));
            if (midDist < minDist) {
                minDist = midDist;
                closest = { x: edge.midX, y: edge.midY, type: 'midpoint', obj: obj, edge: edge };
            }
        }

        // 3. Привязка к линиям (проекция на линию)
        if (obj.type === 'line') {
            const proj = getClosestPointOnSegment(mouseX, mouseY, obj.x1, obj.y1, obj.x2, obj.y2);
            const dist = Math.sqrt(Math.pow(proj.x - mouseX, 2) + Math.pow(proj.y - mouseY, 2));
            
            if (dist < minDist) {
                minDist = dist;
                closest = { x: proj.x, y: proj.y, type: 'line', obj: obj };
            }

            // Привязка к середине линии
            const midX = (obj.x1 + obj.x2) / 2;
            const midY = (obj.y1 + obj.y2) / 2;
            const midDist = Math.sqrt(Math.pow(midX - mouseX, 2) + Math.pow(midY - mouseY, 2));
            if (midDist < minDist) {
                minDist = midDist;
                closest = { x: midX, y: midY, type: 'midpoint', obj: obj };
            }
        }

        // 4. Привязка к центру круга
        if (obj.type === 'circle') {
            const dist = Math.sqrt(Math.pow(obj.cx - mouseX, 2) + Math.pow(obj.cy - mouseY, 2));
            if (dist < minDist) {
                minDist = dist;
                closest = { x: obj.cx, y: obj.cy, type: 'center', obj: obj };
            }
        }
    });

    return closest;
}

/**
 * Найти ближайшую точку на отрезке
 */
function getClosestPointOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    
    if (lenSq === 0) return { x: x1, y: y1 };
    
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t)); // Ограничиваем отрезком
    
    return {
        x: x1 + t * dx,
        y: y1 + t * dy
    };
}

// Поиск точки объекта
function findObjectPoint(mouseX, mouseY) {
    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        // Защитная проверка
        if (!obj || typeof obj.getPoints !== 'function') continue;
        const points = obj.getPoints();
        for (let pt of points) {
            const dist = Math.sqrt(Math.pow(pt.x - mouseX, 2) + Math.pow(pt.y - mouseY, 2));
            if (dist < POINT_SNAP_DISTANCE) {
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
                    const ptIdx = points.indexOf(pt);
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

// Найти все пересечения между линиями
function findAllLineIntersections(excludeObj = null, isArray = false) {
    const intersections = [];
    const lines = objects.filter(obj => obj.type === 'line');
    
    for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
            const l1 = lines[i];
            const l2 = lines[j];
            
            // Пропускаем исключаемые объекты
            if (isArray) {
                if (excludeObj.includes(l1) || excludeObj.includes(l2)) continue;
            } else {
                if (l1 === excludeObj || l2 === excludeObj) continue;
            }
            
            const intersect = findLineIntersection(l1, l2);
            if (intersect) {
                // Проверяем, нет ли уже такой точки
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

// Найти все точки касания линий к кругам
function findAllTangentPoints(excludeObj = null, isArray = false) {
    const tangents = [];
    const circles = objects.filter(obj => obj.type === 'circle');
    const lines = objects.filter(obj => obj.type === 'line');
    
    // Для каждой линии проверяем касательные к каждому кругу
    for (const line of lines) {
        // Пропускаем исключаемые линии
        if (isArray) {
            if (excludeObj.includes(line)) continue;
        } else {
            if (line === excludeObj) continue;
        }
        
        for (const circle of circles) {
            // Пропускаем исключаемые круги
            if (isArray) {
                if (excludeObj.includes(circle)) continue;
            } else {
                if (circle === excludeObj) continue;
            }
            
            // Проверяем обе конечные точки линии
            const tangents1 = findTangentPointsToCircle(line.x1, line.y1, circle);
            const tangents2 = findTangentPointsToCircle(line.x2, line.y2, circle);
            
            // Добавляем уникальные точки касания
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

// Получение граней объекта
function getObjectEdges(obj) {
    const edges = [];
    if (obj.type === 'rect') {
        const points = obj.getPoints().slice(0, 4);
        for (let i = 0; i < 4; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % 4];
            const length = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            edges.push({ p1, p2, length, angle, midX, midY, index: i });
        }
    } else if (obj.type === 'polygon') {
        const vertices = obj.getVertices();
        for (let i = 0; i < vertices.length; i++) {
            const p1 = vertices[i];
            const p2 = vertices[(i + 1) % vertices.length];
            const length = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            edges.push({ p1, p2, length, angle, midX, midY, index: i });
        }
    } else if (obj.type === 'line') {
        const p1 = { x: obj.x1, y: obj.y1 };
        const p2 = { x: obj.x2, y: obj.y2 };
        edges.push({ p1, p2, length: obj.length, angle: obj.getAngle(), midX: (p1.x + p2.x) / 2, midY: (p1.y + p2.y) / 2, index: 0 });
    }
    return edges;
}

// Поиск грани под курсором
function findEdgeAtPoint(x, y) {
    const tolerance = 8;
    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
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
