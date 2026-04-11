
// Кэш для выпуклых оболочек деталей (part.id → hull)
const partHullCache = new Map();

// Очистка кэша при необходимости
function clearPartHullCache() {
    partHullCache.clear();
}

// ═══════════════════════════════════════════════════════════════
// SPATIAL GRID — Пространственная индексация для ускорения пересечений
// ═══════════════════════════════════════════════════════════════

const SPATIAL_CELL_SIZE = 100; // мм — размер ячейки сетки

// Построить Spatial Grid: Map<"cellX,cellY", Set<part>>
function buildSpatialGrid(placedParts, cellSize = SPATIAL_CELL_SIZE) {
    const grid = new Map();

    for (const part of placedParts) {
        const px = part.x || 0;
        const py = part.y || 0;
        const pw = part.width || part.bboxWidth || 100;
        const ph = part.height || part.bboxHeight || 100;

        // Определяем диапазон ячеек которые занимает деталь
        const minX = Math.floor(px / cellSize);
        const minY = Math.floor(py / cellSize);
        const maxX = Math.floor((px + pw) / cellSize);
        const maxY = Math.floor((py + ph) / cellSize);

        for (let cx = minX; cx <= maxX; cx++) {
            for (let cy = minY; cy <= maxY; cy++) {
                const key = `${cx},${cy}`;
                if (!grid.has(key)) grid.set(key, new Set());
                grid.get(key).add(part);
            }
        }
    }

    return grid;
}

// Получить только ближайшие детали из Spatial Grid (вместо проверки всех)
function getNearbyParts(spatialGrid, x, y, width, height, cellSize = SPATIAL_CELL_SIZE) {
    const nearby = new Set();

    const minX = Math.floor(x / cellSize);
    const minY = Math.floor(y / cellSize);
    const maxX = Math.floor((x + width) / cellSize);
    const maxY = Math.floor((y + height) / cellSize);

    for (let cx = minX; cx <= maxX; cx++) {
        for (let cy = minY; cy <= maxY; cy++) {
            const key = `${cx},${cy}`;
            const cell = spatialGrid.get(key);
            if (cell) {
                for (const part of cell) nearby.add(part);
            }
        }
    }

    return [...nearby];
}

// Добавить одну деталь в Spatial Grid (без полной перестройки)
function addToSpatialGrid(spatialGrid, part, cellSize = SPATIAL_CELL_SIZE) {
    const px = part.x || 0;
    const py = part.y || 0;
    const pw = part.width || part.bboxWidth || 100;
    const ph = part.height || part.bboxHeight || 100;

    const minX = Math.floor(px / cellSize);
    const minY = Math.floor(py / cellSize);
    const maxX = Math.floor((px + pw) / cellSize);
    const maxY = Math.floor((py + ph) / cellSize);

    for (let cx = minX; cx <= maxX; cx++) {
        for (let cy = minY; cy <= maxY; cy++) {
            const key = `${cx},${cy}`;
            if (!spatialGrid.has(key)) spatialGrid.set(key, new Set());
            spatialGrid.get(key).add(part);
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// ПРОВЕРКА: ЯВЛЯЕТСЯ ЛИ ДЕТАЛЬ КРУГЛОЙ (для шахматной раскладки)
// ═══════════════════════════════════════════════════════════════

// Определяем, является ли деталь круглой для применения шахматной раскладки
function isCircularPart(part) {
    if (!part || !part.objects || part.objects.length === 0) return false;
    
    // Проверяем, есть ли круги или многоугольники с большим количеством сторон
    const hasCircles = part.objects.some(obj => obj.type === 'circle');
    const hasManySidedPolygons = part.objects.some(obj => 
        obj.type === 'polygon' && obj.sides >= 16
    );
    
    // Деталь считается круглой, если есть хотя бы один круг или многоугольник ≥16 сторон
    const isCircular = hasCircles || hasManySidedPolygons;

    return isCircular;
}

// ═══════════════════════════════════════════════════════════════
// ПОИСК ПОЗИЦИИ С ОБЩИМИ ГРАНЯМИ (В ОДИН РЕЗ)
// ═══════════════════════════════════════════════════════════════

// Найти позицию для детали с общими гранями к уже размещённым
function findPositionWithCommonEdge(placedParts, newPart, sheetWidth, sheetHeight, minGap, edgeGap) {
    // ═══════════════════════════════════════════════════════
    // Не проверяем тип объектов - используем bounding box для всех
    const newWidth = newPart.bounds.width;
    const newHeight = newPart.bounds.height;

    // Пробуем найти позицию с общей гранью к каждой размещённой детали
    for (let i = 0; i < placedParts.length; i++) {
        const placed = placedParts[i];
        const placedWidth = placed.width || placed.bboxWidth;
        const placedHeight = placed.height || placed.bboxHeight;
        const placedX = placed.x;
        const placedY = placed.y;

        // ═══════════════════════════════════════════════════════
        // ВАРИАНТ 1: Справа от размещённой детали (общая вертикальная грань)
        // ═══════════════════════════════════════════════════════
        const rightX = placedX + placedWidth;
        const rightY = placedY;

        if (rightX + newWidth <= sheetWidth - edgeGap && rightY + newHeight <= sheetHeight - edgeGap) {
            const overlapY = Math.min(placedY + placedHeight, rightY + newHeight) - Math.max(placedY, rightY);
            if (overlapY >= 50) {
                const isOccupied = isPositionOccupied(rightX, rightY, newWidth, newHeight, placedParts, i);
                if (!isOccupied) {
                    return {
                        x: rightX, y: rightY, angle: 0, rotation: 0,
                        bboxWidth: newWidth, bboxHeight: newHeight
                    };
                }
            }
        }

        // ВАРИАНТ 2: Слева
        const leftX = placedX - newWidth;
        const leftY = placedY;
        if (leftX >= edgeGap && leftY + newHeight <= sheetHeight - edgeGap) {
            const overlapY = Math.min(placedY + placedHeight, leftY + newHeight) - Math.max(placedY, leftY);
            if (overlapY >= 50) {
                const isOccupied = isPositionOccupied(leftX, leftY, newWidth, newHeight, placedParts, i);
                if (!isOccupied) {
                    return {
                        x: leftX, y: leftY, angle: 0, rotation: 0,
                        bboxWidth: newWidth, bboxHeight: newHeight
                    };
                }
            }
        }

        // ВАРИАНТ 3: Снизу
        const bottomX = placedX;
        const bottomY = placedY + placedHeight;
        if (bottomX + newWidth <= sheetWidth - edgeGap && bottomY + newHeight <= sheetHeight - edgeGap) {
            const overlapX = Math.min(placedX + placedWidth, bottomX + newWidth) - Math.max(placedX, bottomX);
            if (overlapX >= 50) {
                const isOccupied = isPositionOccupied(bottomX, bottomY, newWidth, newHeight, placedParts, i);
                if (!isOccupied) {
                    return {
                        x: bottomX, y: bottomY, angle: 0, rotation: 0,
                        bboxWidth: newWidth, bboxHeight: newHeight
                    };
                }
            }
        }

        // ВАРИАНТ 4: Сверху
        const topX = placedX;
        const topY = placedY - newHeight;
        if (topX + newWidth <= sheetWidth - edgeGap && topY >= edgeGap) {
            const overlapX = Math.min(placedX + placedWidth, topX + newWidth) - Math.max(placedX, topX);
            if (overlapX >= 50) {
                const isOccupied = isPositionOccupied(topX, topY, newWidth, newHeight, placedParts, i);
                if (!isOccupied) {
                    return {
                        x: topX, y: topY, angle: 0, rotation: 0,
                        bboxWidth: newWidth, bboxHeight: newHeight
                    };
                }
            }
        }
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════
// ПРОВЕРКА: ЗАНЯТА ЛИ ПОЗИЦИЯ ДРУГОЙ ДЕТАЛЬЮ
// ═══════════════════════════════════════════════════════════════

function isPositionOccupied(x, y, width, height, placedParts, excludeIndex) {
    // Проверяем пересечение с каждой размещённой деталью (кроме excludeIndex)
    for (let i = 0; i < placedParts.length; i++) {
        if (i === excludeIndex) continue;  // Пропускаем текущую деталь
        
        const placed = placedParts[i];
        const placedX = placed.x;
        const placedY = placed.y;
        const placedWidth = placed.width || placed.bboxWidth;
        const placedHeight = placed.height || placed.bboxHeight;
        
        // Проверка пересечения прямоугольников
        if (x < placedX + placedWidth &&
            x + width > placedX &&
            y < placedY + placedHeight &&
            y + height > placedY) {
            return true;  // Позиция занята
        }
    }
    
    return false;  // Позиция свободна
}

// ═══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════

// Расчёт периметра детали по её объектам
function calculatePartPerimeter(part) {
    let perimeter = 0;
    part.objects.forEach(obj => {
        if (obj.type === 'line') {
            perimeter += Math.sqrt(Math.pow(obj.x2 - obj.x1, 2) + Math.pow(obj.y2 - obj.y1, 2));
        } else if (obj.type === 'rect') {
            perimeter += 2 * (Math.abs(obj.width) + Math.abs(obj.height));
        } else if (obj.type === 'circle') {
            perimeter += 2 * Math.PI * obj.radius;
        } else if (obj.type === 'polygon') {
            const vertices = obj.getVertices();
            for (let i = 0; i < vertices.length; i++) {
                const v1 = vertices[i];
                const v2 = vertices[(i + 1) % vertices.length];
                perimeter += Math.sqrt(Math.pow(v2.x - v1.x, 2) + Math.pow(v2.y - v1.y, 2));
            }
        }
    });
    return perimeter;
}

// Получить контур детали как массив полигонов
function getPartPolygons(part) {
    const polygons = [];
    const bbox = part.bounds;
    const circles = [], rects = [], lines = [], polygonObjects = [];

    part.objects.forEach(obj => {
        if (obj.type === 'circle') {
            circles.push({ cx: obj.cx - bbox.minX, cy: obj.cy - bbox.minY, radius: obj.radius });
        } else if (obj.type === 'line') {
            lines.push({ x1: obj.x1 - bbox.minX, y1: obj.y1 - bbox.minY, x2: obj.x2 - bbox.minX, y2: obj.y2 - bbox.minY });
        } else if (obj.type === 'rect') {
            const x1 = obj.x - bbox.minX, y1 = obj.y - bbox.minY;
            const x2 = x1 + obj.width, y2 = y1 + obj.height;
            rects.push({ x1, y1, x2, y2 });
        } else if (obj.type === 'polygon') {
            const vertices = [];
            const sides = obj.sides || 6;
            const radius = obj.radius || 50;
            const cx = obj.cx - bbox.minX;
            const cy = obj.cy - bbox.minY;
            const angleStep = (Math.PI * 2) / sides;
            for (let i = 0; i < sides; i++) {
                const angle = angleStep * i - Math.PI / 2;
                vertices.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
            }
            polygonObjects.push(vertices);
        }
    });

    rects.forEach(rect => {
        polygons.push([{ x: rect.x1, y: rect.y1 }, { x: rect.x2, y: rect.y1 }, { x: rect.x2, y: rect.y2 }, { x: rect.x1, y: rect.y2 }]);
    });

    polygonObjects.forEach(poly => polygons.push(poly));
    lines.forEach(line => polygons.push([{ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }]));

    if (rects.length === 0 && polygonObjects.length === 0 && lines.length === 0 && circles.length > 0) {
        polygons.push([{ x: 0, y: 0 }, { x: bbox.width, y: 0 }, { x: bbox.width, y: bbox.height }, { x: 0, y: bbox.height }]);
    }

    circles.forEach(c => {
        const segments = 16;
        const hole = [];
        for (let i = 0; i < segments; i++) {
            const angle = (2 * Math.PI * i) / segments;
            hole.push({ x: c.cx + Math.cos(angle) * c.radius, y: c.cy + Math.sin(angle) * c.radius });
        }
        polygons.push(hole);
    });

    return polygons;
}

// Получить упрощённый полигон (bounding box)
function getPartPolygon(part) {
    const bbox = part.bounds;
    return [{ x: 0, y: 0 }, { x: bbox.width, y: 0 }, { x: bbox.width, y: bbox.height }, { x: 0, y: bbox.height }];
}

// ═══════════════════════════════════════════════════════════════
// ГЕОМЕТРИЧЕСКИЕ АЛГОРИТМЫ
// ═══════════════════════════════════════════════════════════════

// Расчёт площади полигона (формула шнуровки)
function polygonArea(polygon) {
    if (polygon.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        area += polygon[i].x * polygon[j].y;
        area -= polygon[j].x * polygon[i].y;
    }
    return Math.abs(area / 2);
}

// Алгоритм Эндрю для выпуклой оболочки
function convexHull(points) {
    if (points.length < 3) return points;
    const unique = [];
    const seen = new Set();
    for (const p of points) {
        const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        if (!seen.has(key)) { seen.add(key); unique.push(p); }
    }
    if (unique.length < 3) return unique;
    unique.sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [], upper = [];
    for (const p of unique) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    for (let i = unique.length - 1; i >= 0; i--) {
        const p = unique[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
}

// Поворот полигона на 90° N раз
function rotatePolygon90(polygon, times = 1) {
    let result = polygon;
    for (let i = 0; i < times; i++) result = result.map(p => ({ x: -p.y, y: p.x }));
    return result;
}

// Пересекаются ли отрезки
function segmentsIntersect(a1, a2, b1, b2) {
    const ccw = (a, b, c) => {
        const val = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
        return Math.abs(val) < 0.0001 ? 0 : (val > 0 ? 1 : -1);
    };
    const d1 = ccw(b1, b2, a1), d2 = ccw(b1, b2, a2);
    const d3 = ccw(a1, a2, b1), d4 = ccw(a1, a2, b2);
    return (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)));
}

// Точка внутри полигона
function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
            (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
            inside = !inside;
        }
    }
    return inside;
}

// Bounding box для полигона
function getBoundingBox(polygon) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of polygon) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// ═══════════════════════════════════════════════════════════════
// NFP (No-Fit Polygon) ALGORITHM
// ═══════════════════════════════════════════════════════════════

// Вычисление No-Fit Polygon для двух полигонов
function computeNFP(polyA, polyB) {
    const polyBInv = polyB.map(p => ({ x: -p.x, y: -p.y }));
    return minkowskiSum(polyA, polyBInv);
}

// Сумма Минковского двух выпуклых полигонов
function minkowskiSum(poly1, poly2) {
    if (poly1.length === 0 || poly2.length === 0) return [];
    let idx1 = 0, idx2 = 0;
    for (let i = 1; i < poly1.length; i++) {
        if (poly1[i].y < poly1[idx1].y || (poly1[i].y === poly1[idx1].y && poly1[i].x < poly1[idx1].x)) idx1 = i;
    }
    for (let i = 1; i < poly2.length; i++) {
        if (poly2[i].y < poly2[idx2].y || (poly2[i].y === poly2[idx2].y && poly2[i].x < poly2[idx2].x)) idx2 = i;
    }
    const edges1 = getSortedEdges(poly1, idx1), edges2 = getSortedEdges(poly2, idx2);
    const merged = mergeEdges(edges1, edges2);
    const result = [];
    let x = poly1[idx1].x + poly2[idx2].x, y = poly1[idx1].y + poly2[idx2].y;
    result.push({ x, y });
    for (const edge of merged) {
        x += edge.dx; y += edge.dy;
        result.push({ x, y });
    }
    return result;
}

// Получить рёбра полигона, отсортированные по углу
function getSortedEdges(polygon, startIndex) {
    const edges = [];
    for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[(startIndex + i) % polygon.length];
        const p2 = polygon[(startIndex + i + 1) % polygon.length];
        edges.push({ dx: p2.x - p1.x, dy: p2.y - p1.y, angle: Math.atan2(p2.y - p1.y, p2.x - p1.x) });
    }
    edges.sort((a, b) => a.angle - b.angle);
    return edges;
}

// Слияние отсортированных рёбер
function mergeEdges(edges1, edges2) {
    const result = [];
    let i = 0, j = 0;
    while (i < edges1.length && j < edges2.length) {
        if (edges1[i].angle <= edges2[j].angle) { result.push(edges1[i]); i++; }
        else { result.push(edges2[j]); j++; }
    }
    while (i < edges1.length) { result.push(edges1[i]); i++; }
    while (j < edges2.length) { result.push(edges2[j]); j++; }
    return result;
}

// ═══════════════════════════════════════════════════════════════
// ОСНОВНОЙ АЛГОРИТМ РАСКЛАДКИ
// ═══════════════════════════════════════════════════════════════

// Получить внешний контур детали (реальный контур для раскладки)
function getPartConvexHull(part) {
    // Проверяем кэш
    if (partHullCache.has(part.id)) {
        return partHullCache.get(part.id);
    }
    
    const bbox = part.bounds;

    // Для раскладки используем bounding box — ОТНОСИТЕЛЬНЫЕ координаты (0,0) → (width, height)
    // чтобы вращение вокруг (width/2, height/2) работало корректно
    const hull = [
        { x: 0, y: 0 },
        { x: bbox.width, y: 0 },
        { x: bbox.width, y: bbox.height },
        { x: 0, y: bbox.height }
    ];
    
    // Сохраняем в кэш
    partHullCache.set(part.id, hull);
    
    return hull;
}

// Получить все полигоны детали для проверки пересечений (реальная геометрия)
function getPartCollisionPolygons(part, offsetX, offsetY, rotationAngle) {
    const polygons = [];
    const bbox = part.bounds;
    // Центр для вращения рассчитывается относительно нормализованных координат (0, 0)
    const centerX = bbox.width / 2;
    const centerY = bbox.height / 2;

    part.objects.forEach(obj => {
        if (obj.type === 'line') {
            // Нормализуем координаты относительно minX/minY детали
            const p1 = rotatePoint(obj.x1 - bbox.minX, obj.y1 - bbox.minY, rotationAngle, centerX, centerY);
            const p2 = rotatePoint(obj.x2 - bbox.minX, obj.y2 - bbox.minY, rotationAngle, centerX, centerY);
            polygons.push({
                type: 'line',
                points: [
                    { x: p1.x + offsetX, y: p1.y + offsetY },
                    { x: p2.x + offsetX, y: p2.y + offsetY }
                ]
            });
        } else if (obj.type === 'rect') {
            const corners = [
                { x: obj.x - bbox.minX, y: obj.y - bbox.minY },
                { x: obj.x + obj.width - bbox.minX, y: obj.y - bbox.minY },
                { x: obj.x + obj.width - bbox.minX, y: obj.y + obj.height - bbox.minY },
                { x: obj.x - bbox.minX, y: obj.y + obj.height - bbox.minY }
            ];
            const rotated = corners.map(c => rotatePoint(c.x, c.y, rotationAngle, centerX, centerY));
            polygons.push({
                type: 'rect',
                points: rotated.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }))
            });
        } else if (obj.type === 'circle') {
            const center = rotatePoint(obj.cx - bbox.minX, obj.cy - bbox.minY, rotationAngle, centerX, centerY);
            polygons.push({
                type: 'circle',
                cx: center.x + offsetX,
                cy: center.y + offsetY,
                radius: obj.radius
            });
        } else if (obj.type === 'polygon') {
            const vertices = obj.getVertices ? obj.getVertices() : [];
            const rotated = vertices.map(v => {
                const r = rotatePoint(v.x - bbox.minX, v.y - bbox.minY, rotationAngle, centerX, centerY);
                return { x: r.x + offsetX, y: r.y + offsetY };
            });
            polygons.push({
                type: 'polygon',
                points: rotated
            });
        } else if (obj.type === 'text') {
            // Текст представляем как прямоугольник
            const textWidth = (obj.text?.length || 1) * 8;
            const textHeight = obj.fontSize || 14;
            const corners = [
                { x: obj.x - bbox.minX, y: obj.y - bbox.minY },
                { x: obj.x + textWidth - bbox.minX, y: obj.y - bbox.minY },
                { x: obj.x + textWidth - bbox.minX, y: obj.y + textHeight - bbox.minY },
                { x: obj.x - bbox.minX, y: obj.y + textHeight - bbox.minY }
            ];
            const rotated = corners.map(c => rotatePoint(c.x, c.y, rotationAngle, centerX, centerY));
            polygons.push({
                type: 'rect',
                points: rotated.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }))
            });
        }
    });

    return polygons;
}

// Поворот точки вокруг центра
function rotatePoint(x, y, angle, centerX, centerY) {
    if (angle === 0) return { x, y };
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = x - centerX;
    const dy = y - centerY;
    return {
        x: centerX + dx * cos - dy * sin,
        y: centerY + dx * sin + dy * cos
    };
}

// Поворот полигона вокруг центра на угол (в радианах)
function rotatePolygon(polygon, angle, centerX, centerY) {
    if (angle === 0) return polygon.map(p => ({ ...p }));
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return polygon.map(p => ({
        x: centerX + (p.x - centerX) * cos - (p.y - centerY) * sin,
        y: centerY + (p.x - centerX) * sin + (p.y - centerY) * cos
    }));
}

// Сдвиг полигона на вектор
function translatePolygon(polygon, dx, dy) {
    return polygon.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

// Проверка: лежит ли точка внутри полигона
function isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
            (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
            inside = !inside;
        }
    }
    return inside;
}

// Проверка пересечений между двумя деталями по реальной геометрии
function partsIntersect(part1, offset1, angle1, part2, offset2, angle2, minGap) {
    const polys1 = getPartCollisionPolygons(part1, offset1.x, offset1.y, angle1);
    const polys2 = getPartCollisionPolygons(part2, offset2.x, offset2.y, angle2);

    // Проверка пересечений между всеми объектами
    for (const poly1 of polys1) {
        for (const poly2 of polys2) {
            if (objectsIntersect(poly1, poly2, minGap)) {
                return true;
            }
        }
    }
    return false;
}

// Проверка пересечения двух объектов (линия, прямоугольник, круг, полигон)
function objectsIntersect(obj1, obj2, minGap) {
    // Если оба объекта имеют points (линии, полигоны, прямоугольники)
    if (obj1.points && obj2.points) {
        // Проверка пересечения рёбер
        for (let i = 0; i < obj1.points.length; i++) {
            const a1 = obj1.points[i];
            const a2 = obj1.points[(i + 1) % obj1.points.length];
            for (let j = 0; j < obj2.points.length; j++) {
                const b1 = obj2.points[j];
                const b2 = obj2.points[(j + 1) % obj2.points.length];
                if (segmentsIntersect(a1, a2, b1, b2)) {
                    return true;
                }
            }
        }
        
        // Проверка расстояний между вершинами и рёбрами
        for (const p of obj1.points) {
            for (let j = 0; j < obj2.points.length; j++) {
                const b1 = obj2.points[j];
                const b2 = obj2.points[(j + 1) % obj2.points.length];
                if (pointToSegmentDistance(p, b1, b2) < minGap) {
                    return true;
                }
            }
        }
        for (const p of obj2.points) {
            for (let j = 0; j < obj1.points.length; j++) {
                const a1 = obj1.points[j];
                const a2 = obj1.points[(j + 1) % obj1.points.length];
                if (pointToSegmentDistance(p, a1, a2) < minGap) {
                    return true;
                }
            }
        }
    }
    
    // Проверка с кругом
    if (obj1.type === 'circle' || obj2.type === 'circle') {
        const circle = obj1.type === 'circle' ? obj1 : obj2;
        const other = obj1.type === 'circle' ? obj2 : obj1;
        
        if (other.points) {
            // Проверка расстояния от центра круга до всех вершин
            for (const p of other.points) {
                const dist = Math.sqrt((p.x - circle.cx) ** 2 + (p.y - circle.cy) ** 2);
                if (dist < circle.radius + minGap) {
                    return true;
                }
            }
            
            // Проверка расстояния от центра круга до всех рёбер
            for (let j = 0; j < other.points.length; j++) {
                const b1 = other.points[j];
                const b2 = other.points[(j + 1) % other.points.length];
                const dist = pointToSegmentDistance({ x: circle.cx, y: circle.cy }, b1, b2);
                if (dist < circle.radius + minGap) {
                    return true;
                }
            }
        }
        
        // Проверка пересечения двух кругов
        if (other.type === 'circle') {
            const dist = Math.sqrt((circle.cx - other.cx) ** 2 + (circle.cy - other.cy) ** 2);
            if (dist < circle.radius + other.radius + minGap) {
                return true;
            }
        }
    }
    
    return false;
}

// Проверка пересечения двух полигонов с учётом зазора
function polygonsIntersect(poly1, poly2, minGap = 3) {
    // ═══════════════════════════════════════════════════════════
    // ВАЖНО: Используем точный minGap без увеличения!
    // Для "В один рез" minGap=0, детали должны касаться
    // ═══════════════════════════════════════════════════════════
    const gap = minGap;

    // Быстрая проверка по bounding box с зазором
    const bbox1 = getBoundingBox(poly1);
    const bbox2 = getBoundingBox(poly2);
    if (bbox1.maxX + gap <= bbox2.minX || bbox2.maxX + gap <= bbox1.minX ||
        bbox1.maxY + gap <= bbox2.minY || bbox2.maxY + gap <= bbox1.minY) {
        return false;
    }

    // Проверка пересечения рёбер
    for (let i = 0; i < poly1.length; i++) {
        const a1 = poly1[i];
        const a2 = poly1[(i + 1) % poly1.length];
        for (let j = 0; j < poly2.length; j++) {
            const b1 = poly2[j];
            const b2 = poly2[(j + 1) % poly2.length];
            if (segmentsIntersect(a1, a2, b1, b2)) {
                return true;
            }
        }
    }

    // Проверка: один полигон внутри другого
    // ═══════════════════════════════════════════════════════════
    // ВАЖНО: Проверяем ЦЕНТР полигона, а не вершину
    // Вершина может быть на границе (касание), но центр внутри = пересечение
    // ═══════════════════════════════════════════════════════════
    if (poly1.length > 0) {
        // Вычисляем центр poly1
        let center1X = 0, center1Y = 0;
        for (const p of poly1) { center1X += p.x; center1Y += p.y; }
        center1X /= poly1.length;
        center1Y /= poly1.length;
        const center1 = { x: center1X, y: center1Y };
        
        if (isPointInPolygon(center1, poly2)) {
            return true;  // Центр внутри другого полигона = пересечение
        }
    }
    if (poly2.length > 0) {
        // Вычисляем центр poly2
        let center2X = 0, center2Y = 0;
        for (const p of poly2) { center2X += p.x; center2Y += p.y; }
        center2X /= poly2.length;
        center2Y /= poly2.length;
        const center2 = { x: center2X, y: center2Y };
        
        if (isPointInPolygon(center2, poly1)) {
            return true;  // Центр внутри другого полигона = пересечение
        }
    }

    // Проверка минимального расстояния между вершинами и рёбрами
    // Каждая вершина poly1 должна быть на расстоянии >= gap от всех рёбер poly2
    for (let i = 0; i < poly1.length; i++) {
        const p = poly1[i];
        for (let j = 0; j < poly2.length; j++) {
            const b1 = poly2[j];
            const b2 = poly2[(j + 1) % poly2.length];
            const dist = pointToSegmentDistance(p, b1, b2);
            // ═══════════════════════════════════════════════════════════
            // ВАЖНО: Для "В один рез" (gap=0) используем строгое <
            // Касание (dist=0) НЕ считается пересечением
            // ═══════════════════════════════════════════════════════════
            if (dist < gap - 0.01) {
                return true; // Слишком близко - считаем пересечением
            }
        }
    }

    // Проверяем также вершины poly2 против рёбер poly1
    for (let i = 0; i < poly2.length; i++) {
        const p = poly2[i];
        for (let j = 0; j < poly1.length; j++) {
            const b1 = poly1[j];
            const b2 = poly1[(j + 1) % poly1.length];
            const dist = pointToSegmentDistance(p, b1, b2);
            if (dist < gap - 0.01) {
                return true;
            }
        }
    }

    // Каждая вершина poly2 должна быть на расстоянии >= gap от всех рёбер poly1
    for (let i = 0; i < poly2.length; i++) {
        const p = poly2[i];
        for (let j = 0; j < poly1.length; j++) {
            const a1 = poly1[j];
            const a2 = poly1[(j + 1) % poly1.length];
            const dist = pointToSegmentDistance(p, a1, a2);
            if (dist < gap) {
                return true; // Слишком близко - считаем пересечением
            }
        }
    }

    return false;
}

// Расчёт расстояния от точки до отрезка
function pointToSegmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) {
        // Отрезок вырожден в точку
        return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
    }

    // Проекция точки на прямую
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    const projX = a.x + t * dx;
    const projY = a.y + t * dy;

    return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}

// Проверка: полигон внутри листа с зазором
function isPolygonInsideSheet(polygon, sheetWidth, sheetHeight, minGap, edgeGap = null) {
    // Используем edgeGap если передан, иначе minGap
    const gap = edgeGap !== null ? edgeGap : minGap;
    
    for (const p of polygon) {
        if (p.x < gap || p.x > sheetWidth - gap ||
            p.y < gap || p.y > sheetHeight - gap) {
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: внутри контура остатка?
    // ═══════════════════════════════════════════════════════════
    // sheetRemnant объявлена в sheet-remnant.js, безопасный доступ через window
    const remnant = (typeof sheetRemnant !== 'undefined') ? sheetRemnant : (window.sheetRemnant || null);
    if (typeof isRectInsideRemnant === 'function' && remnant && remnant.outerContour && remnant.outerContour.length > 0) {
        // Вычисляем bounding box полигона
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of polygon) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }

        // Проверяем, что bounding box внутри контура (с учётом отверстий)
        if (!isRectInsideRemnant(minX, minY, maxX - minX, maxY - minY)) {
            return false;
        }
    }

    return true;
}

// ═══════════════════════════════════════════════════════════════
// BOTTOM-LEFT — Генерация кандидатных позиций для размещения
// ═══════════════════════════════════════════════════════════════

// Генерирует кандидатные позиции на основе размещённых деталей
// (вместо перебора всей сетки проверяем только позиции у граней)
function generateCandidatePositions(placedParts, partWidth, partHeight, sheetWidth, sheetHeight, minGap, edgeGap, step) {
    const candidates = new Set();
    const key = (x, y) => `${Math.round(x)},${Math.round(y)}`;

    // 1. Позиция в левом нижнем углу листа (базовая)
    if (partWidth <= sheetWidth - edgeGap * 2 && partHeight <= sheetHeight - edgeGap * 2) {
        candidates.add(key(edgeGap, edgeGap));
    }

    // 2. Для каждой размещённой детали — позиции справа и сверху
    for (const placed of placedParts) {
        const px = placed.x || 0;
        const py = placed.y || 0;
        const pw = placed.width || placed.bboxWidth || 0;
        const ph = placed.height || placed.bboxHeight || 0;

        // Справа от детали (прижата по Y, сдвиг по X)
        const rightX = px + pw + minGap;
        if (rightX + partWidth <= sheetWidth - edgeGap) {
            // Округляем до шага сетки
            const snappedY = Math.floor(py / step) * step;
            candidates.add(key(rightX, snappedY));
            candidates.add(key(rightX, Math.max(edgeGap, snappedY - step)));
            candidates.add(key(rightX, Math.min(sheetHeight - partHeight - edgeGap, snappedY + step)));
        }

        // Сверху от детали (прижата по X, сдвиг по Y)
        const topY = py + ph + minGap;
        if (topY + partHeight <= sheetHeight - edgeGap) {
            const snappedX = Math.floor(px / step) * step;
            candidates.add(key(snappedX, topY));
            candidates.add(key(Math.max(edgeGap, snappedX - step), topY));
            candidates.add(key(Math.min(sheetWidth - partWidth - edgeGap, snappedX + step), topY));
        }

        // Внизу от детали
        const bottomY = py - partHeight - minGap;
        if (bottomY >= edgeGap) {
            const snappedX = Math.floor(px / step) * step;
            candidates.add(key(snappedX, bottomY));
        }

        // Слева от детали
        const leftX = px - partWidth - minGap;
        if (leftX >= edgeGap) {
            const snappedY = Math.floor(py / step) * step;
            candidates.add(key(leftX, snappedY));
        }
    }

    // 3. Преобразуем в массив и сортируем
    // ═══════════════════════════════════════════════════════════
    // ВАЖНО: Сортируем сначала по X (слева направо), потом по Y (снизу вверх)
    // Это позволяет заполнять столбцы вертикально, а не строки горизонтально
    // ═══════════════════════════════════════════════════════════
    const positions = [];
    for (const k of candidates) {
        const [x, y] = k.split(',').map(Number);
        if (x >= edgeGap && x + partWidth <= sheetWidth - edgeGap &&
            y >= edgeGap && y + partHeight <= sheetHeight - edgeGap) {
            
            // ═══════════════════════════════════════════════════════════
            // ВАЖНО: Проверяем что позиция не занята другой деталью
            // ═══════════════════════════════════════════════════════════
            const isOccupied = placedParts.some(placed => {
                const placedWidth = placed.width || placed.bboxWidth || 0;
                const placedHeight = placed.height || placed.bboxHeight || 0;
                
                // Проверка пересечения bounding box с зазором
                return !(x + partWidth + minGap < placed.x ||
                         placed.x + placedWidth + minGap < x ||
                         y + partHeight + minGap < placed.y ||
                         placed.y + placedHeight + minGap < y);
            });
            
            if (!isOccupied) {
                positions.push({ x, y });
            }
        }
    }

    console.log(`      📍 generateCandidatePositions: ${candidates.size} кандидатов → ${positions.length} валидных (после фильтрации занятых)`);
    if (positions.length > 0 && positions.length <= 5) {
        positions.forEach((p, i) => console.log(`         #${i+1}: (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`));
    }

    // Сортировка: сначала левые (меньший X), потом нижние (меньший Y)
    positions.sort((a, b) => a.x - b.x || a.y - b.y);

    return positions;
}

// Получить опорную точку полигона (левая нижняя)
function getReferencePoint(polygon) {
    let ref = polygon[0];
    for (const p of polygon) {
        if (p.y < ref.y || (p.y === ref.y && p.x < ref.x)) {
            ref = p;
        }
    }
    return ref;
}

// Найти позицию для размещения детали с использованием точной геометрии
// spatialGrid — опциональная пространственная сетка для ускорения проверки пересечений
async function findPositionWithNFP(placedParts, newPart, sheetWidth, sheetHeight, cancelCallback = null, spatialGrid = null) {
    // ═══════════════════════════════════════════════════════════
    // ОПРЕДЕЛЯЕМ ЗАЗОР: приоритет "В один рез" > настройки UI
    // ═══════════════════════════════════════════════════════════
    let minGap, edgeGap;

    if (newPart.oneCutEnabled === true && placedParts.length > 0) {
        // "В один рез" — зазор 0 (детали вплотную)
        minGap = 0;
        edgeGap = parseInt(document.getElementById('edgeGap')?.value) || 3;
    } else if (window.allowOverlap === true) {
        // Наложение разрешено
        minGap = -100;
        edgeGap = 0;
    } else {
        // Обычный режим — читаем из UI
        minGap = parseFloat(document.getElementById('partGap')?.value) || 3;
        edgeGap = parseFloat(document.getElementById('edgeGap')?.value) || 3;
    }

    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРЯЕМ: ВКЛЮЧЕН ЛИ РЕЖИМ "В ОДИН РЕЗ"
    // ═══════════════════════════════════════════════════════════
    if (newPart.oneCutEnabled === true && placedParts.length > 0) {
        const commonEdgePosition = findPositionWithCommonEdge(placedParts, newPart, sheetWidth, sheetHeight, minGap, edgeGap);
        if (commonEdgePosition) {
            // Создаём positionedHull для последующих проверок пересечений
            const bboxHull = [
                { x: 0, y: 0 },
                { x: commonEdgePosition.bboxWidth, y: 0 },
                { x: commonEdgePosition.bboxWidth, y: commonEdgePosition.bboxHeight },
                { x: 0, y: commonEdgePosition.bboxHeight }
            ];
            commonEdgePosition.positionedHull = bboxHull.map(p => ({
                x: p.x + commonEdgePosition.x,
                y: p.y + commonEdgePosition.y
            }));
            return commonEdgePosition;
        }
    }

    // Проверяем, является ли деталь прямоугольной (только линии и прямоугольники)
    const isRectangular = newPart.objects && newPart.objects.every(obj =>
        obj.type === 'rect' || obj.type === 'line'
    );

    // ═══════════════════════════════════════════════════════════
    // СПЕЦИАЛЬНЫЙ ОБРАБОТЧИК ДЛЯ БОЛЬШИХ ПРЯМОУГОЛЬНЫХ ДЕТАЛЕЙ
    // ═══════════════════════════════════════════════════════════
    // Для деталей >= 400 мм по любой стороне используем упрощённую стратегию:
    // - Столбец 1: детали 0° поворот, stacked vertically
    // - Столбец 2: детали 90° поворот, stacked vertically
    const bboxArea = newPart.bounds.width * newPart.bounds.height;
    const maxSide = Math.max(newPart.bounds.width, newPart.bounds.height);
    const minSide = Math.min(newPart.bounds.width, newPart.bounds.height);
    
    // Критерий: любая сторона >= 400 мм И площадь >= 100,000 мм²
    const isLargeRect = isRectangular && maxSide >= 400 && bboxArea >= 100000;

    if (isLargeRect) {
        console.log(`   📦 [БОЛЬШАЯ ДЕТАЛЬ] ${newPart.bounds.width.toFixed(0)}×${newPart.bounds.height.toFixed(0)} мм (площадь: ${(bboxArea/1000).toFixed(0)}K мм²)`);

        // Получаем выпуклую оболочку (уже в относительных координатах 0-based)
        const partHull = getPartConvexHull(newPart);
        if (partHull.length < 3) return null;

        const bbox = newPart.bounds;
        const centerX = bbox.width / 2;
        const centerY = bbox.height / 2;

        // Считаем сколько деталей ЭТОЙ ЖЕ детали уже размещено
        let samePartCount = 0;
        let count0 = 0, count90 = 0;
        for (const placed of placedParts) {
            if (placed.partId === newPart.id) {
                samePartCount++;
                if (placed.rotation === 0) count0++;
                else if (placed.rotation === 1) count90++;
            }
        }

        // СТРАТЕГИЯ: сначала заполняем столбец 0° (горизонтальные),
        // затем столбец 90° (вертикальные). Это даёт больше деталей на листе.
        // Цикл по rotation: 0° первый, если не влезает — пробуем 90°.
        for (const rotIdx of [0, 1]) {
            const angle = rotIdx === 0 ? 0 : Math.PI / 2;
            const rotation = rotIdx;

            // Поворачиваем оболочку (относительные координаты)
            const rotatedHull = rotatePolygon(partHull, angle, centerX, centerY);

            // Находим bottom-left повёрнутого hull
            const tempRef = getReferencePoint(rotatedHull);

            // Нормализуем: сдвигаем hull так чтобы bottom-left = (0,0)
            const normalizedHull = rotatedHull.map(p => ({
                x: p.x - tempRef.x,
                y: p.y - tempRef.y
            }));

            // Получаем bounding box повёрнутой детали
            const rotatedBbox = getBoundingBox(normalizedHull);

            // Дополнительный сдвиг: чтобы bounding box начинался с (0,0)
            // rotatedBbox.minX/minY могут быть отрицательными после поворота
            const finalHull = normalizedHull.map(p => ({
                x: p.x - rotatedBbox.minX,
                y: p.y - rotatedBbox.minY
            }));
            const finalBbox = { width: rotatedBbox.width, height: rotatedBbox.height };

            // refPoint = tempRef + rotatedBbox.min - это точка отсчёта для render.js
            // Чтобы формула (rotatedCorner - refPoint) давала координаты внутри bbox
            const refPoint = {
                x: tempRef.x + rotatedBbox.minX,
                y: tempRef.y + rotatedBbox.minY
            };

            // Позиция X: столбец 0° слева, столбец 90° справа
            const x = rotIdx === 0 ? edgeGap : edgeGap + bbox.width + minGap;

            // Находим maxY только для деталей ЭТОЙ ЖЕ детали с таким же поворотом
            let maxY = edgeGap;
            for (const placed of placedParts) {
                if (placed.partId === newPart.id && placed.rotation === rotIdx) {
                    const placedH = placed.height || placed.bboxHeight || 0;
                    const placedBottom = placed.y + placedH;
                    if (placedBottom > maxY) maxY = placedBottom;
                }
            }
            const y = maxY + minGap;

            console.log(`   🔄 Деталь #${samePartCount + 1}: пробуем ${rotIdx === 0 ? '0°' : '90°'}, позиция: (${x.toFixed(0)}, ${y.toFixed(0)}), размер: ${finalBbox.width.toFixed(0)}×${finalBbox.height.toFixed(0)}, refPoint=(${refPoint.x.toFixed(0)},${refPoint.y.toFixed(0)})`);

            // Проверяем что влезает в лист
            if (x + finalBbox.width > sheetWidth - edgeGap ||
                y + finalBbox.height > sheetHeight - edgeGap) {
                console.log(`      ❌ Не влезает в лист, пробуем следующий поворот...`);
                continue;  // Попробуем следующий rotation
            }

            // Проверяем пересечения со ВСЕМИ размещёнными деталями
            let canPlace = true;
            const positionedHull = translatePolygon(finalHull, x, y);

            for (const placed of placedParts) {
                const pw = placed.width || placed.bboxWidth || 0;
                const ph = placed.height || placed.bboxHeight || 0;

                // Проверка реального ПЕРЕКРЫТИЯ bounding box (не зазора)
                if (x < placed.x + pw &&
                    x + finalBbox.width > placed.x &&
                    y < placed.y + ph &&
                    y + finalBbox.height > placed.y) {
                    canPlace = false;
                    console.log(`      ❌ Пересечение с деталью на (${placed.x.toFixed(0)}, ${placed.y.toFixed(0)})`);
                    break;
                }
            }

            if (canPlace) {
                console.log(`   ✅ Размещена на (${x.toFixed(0)}, ${y.toFixed(0)}) с поворотом ${rotIdx === 0 ? '0°' : '90°'}, refPoint=(${refPoint.x.toFixed(0)},${refPoint.y.toFixed(0)})`);
                return {
                    x, y,
                    rotation,
                    angle,
                    partId: newPart.id,
                    positionedHull,
                    refPoint,
                    bboxWidth: finalBbox.width,
                    bboxHeight: finalBbox.height
                };
            }
        }

        // Не удалось разместить ни с одним поворотом
        console.log(`   ❌ Не найдена позиция`);
        return null;
    }

    // Проверяем, является ли деталь круглой (для шахматной раскладки)
    const isCircular = isCircularPart(newPart);

    // Динамический шаг сетки: больше для больших деталей
    const minDimension = Math.min(newPart.bounds.width, newPart.bounds.height);
    const step = Math.max(20, Math.min(50, minDimension / 3));

    // Получаем выпуклую оболочку новой детали (с кэшированием)
    const partHull = getPartConvexHull(newPart);
    if (partHull.length < 3) return null;  // Не удалось построить оболочку

    // Центр детали для вращения
    const bbox = newPart.bounds;
    const centerX = bbox.width / 2;
    const centerY = bbox.height / 2;

    // Углы поворота: 'fast' = 0° и 90°, 'full' = 19 углов, 'auto' = прямоугольные=2, сложные=4
    const rotationMode = newPart.rotationMode || 'auto';
    let rotationAngles;
    if (rotationMode === 'fast') {
        rotationAngles = [0, 90];  // Только 0° и 90°
    } else if (rotationMode === 'full') {
        rotationAngles = [0, 20, 40, 60, 80, 90, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340];  // 19 углов
    } else {
        // 'auto' - автоматический выбор
        rotationAngles = isRectangular
            ? [0, 90]  // Только 0° и 90° для прямоугольных деталей
            : [0, 45, 90, 135];  // balanced по умолчанию для сложных деталей
    }

    for (let i = 0; i < rotationAngles.length; i++) {
        // Проверка отмены
        if (cancelCallback && cancelCallback()) {
            return null;  // Прерываем поиск
        }

        const angle = (rotationAngles[i] * Math.PI) / 180;  // Поворот в радианах
        // rotation: 0 для углов близких к 0°/180°/360°, 1 для углов близких к 90°/270°
        // Это нужно для совместимости с логикой больших прямоугольных деталей
        const angleDeg = rotationAngles[i] % 360;
        const rotation = (angleDeg >= 45 && angleDeg <= 135) || (angleDeg >= 225 && angleDeg <= 315) ? 1 : 0;

        console.log(`   🔄 Пробуем поворот ${rotationAngles[i]}° для детали #${newPart.id}`);

        // Поворачиваем оболочку детали
        const rotatedHull = rotatePolygon(partHull, angle, centerX, centerY);

        // Находим bottom-left повёрнутого hull
        const tempRef = getReferencePoint(rotatedHull);

        // Нормализуем: сдвигаем hull так чтобы bottom-left = (0,0)
        const tempNormalizedHull = rotatedHull.map(p => ({
            x: p.x - tempRef.x,
            y: p.y - tempRef.y
        }));

        // Получаем bounding box
        const tempBbox = getBoundingBox(tempNormalizedHull);

        // Дополнительный сдвиг: чтобы bounding box начинался с (0,0)
        const normalizedHull = tempNormalizedHull.map(p => ({
            x: p.x - tempBbox.minX,
            y: p.y - tempBbox.minY
        }));

        // refPoint для render.js: tempRef + tempBbox.min
        const refPoint = {
            x: tempRef.x + tempBbox.minX,
            y: tempRef.y + tempBbox.minY
        };

        const rotatedBbox = { width: tempBbox.width, height: tempBbox.height };

        // Быстрая проверка: влезает ли в лист
        if (rotatedBbox.width + minGap * 2 > sheetWidth ||
            rotatedBbox.height + minGap * 2 > sheetHeight) {
            continue;
        }

        // ═══════════════════════════════════════════════════════
        // ШАХМАТНАЯ РАСКЛАДКА ДЛЯ КРУГЛЫХ ДЕТАЛЕЙ
        // ═══════════════════════════════════════════════════════
        if (isCircular) {
            
            // Для круглых деталей используем гексагональную упаковку
            // Находим реальный диаметр круга (не bounding box)
            let diameter = 0;
            if (newPart.objects && newPart.objects.length > 0) {
                for (const obj of newPart.objects) {
                    if (obj.type === 'circle') {
                        const objDiameter = obj.radius * 2;
                        if (objDiameter > diameter) diameter = objDiameter;
                    } else if (obj.type === 'polygon' && obj.sides >= 16) {
                        const objDiameter = obj.radius * 2;
                        if (objDiameter > diameter) diameter = objDiameter;
                    }
                }
            }
            
            // Если не нашли диаметр, используем bounding box
            if (diameter === 0) {
                diameter = Math.max(newPart.bounds.width, newPart.bounds.height);
            }
            
            // ═══════════════════════════════════════════════════════
            // ГЕКСАГОНАЛЬНАЯ УПАКОВКА ДЛЯ КРУГОВ
            // ═══════════════════════════════════════════════════════
            // Параметры шахматной раскладки:
            // - Шаг между центрами по X = diameter + minGap
            // - Шаг между центрами по Y = diameter + minGap
            // - Смещение чётных рядов = diameter / 2 (для шахматного порядка)
            // Это даёт зазор ~3мм между всеми кругами

            const step = diameter + minGap;
            const rowSpacing = step;
            const rowOffset = diameter / 2;  // Смещение = радиус (половина диаметра)

            let rowNum = 0;
            let placedInChess = false;
            for (let y = edgeGap; y <= sheetHeight - rotatedBbox.height - edgeGap; y += rowSpacing) {
                // Проверка отмены
                if (cancelCallback && cancelCallback()) {
                    return null;
                }

                // Смещение для чётных рядов (шахматный порядок)
                const xOffset = (rowNum % 2 === 1) ? rowOffset : 0;

                for (let x = edgeGap + xOffset; x <= sheetWidth - rotatedBbox.width - edgeGap; x += step) {
                    // ═══════════════════════════════════════════════════
                    // ПРОВЕРКА ОТМЕНЫ ВНУТРИ ЦИКЛА (каждые 50 итераций)
                    // ═══════════════════════════════════════════════════
                    if (cancelCallback && x % 50 === 0 && cancelCallback()) {
                        return null;
                    }

                    // Сдвигаем полигон в позицию
                    const positionedHull = translatePolygon(normalizedHull, x, y);

                    // Проверка: внутри ли листа
                    if (!isPolygonInsideSheet(positionedHull, sheetWidth, sheetHeight, edgeGap)) {
                        continue;
                    }

                    // Проверка пересечений с уже размещёнными деталями по реальной геометрии
                    let canPlace = true;
                    // Используем Spatial Grid если есть, иначе перебираем все
                    const partsToCheck = spatialGrid ? getNearbyParts(spatialGrid, x, y, rotatedBbox.width, rotatedBbox.height) : placedParts;
                    for (const placed of partsToCheck) {
                        // Проверка отмены
                        if (cancelCallback && cancelCallback()) {
                            return null;
                        }

                        // Быстрая проверка по выпуклой оболочке
                        if (polygonsIntersect(positionedHull, placed.positionedHull, minGap)) {
                            canPlace = false;
                            break;
                        }
                    }

                    if (canPlace) {
                        placedInChess = true;
                        return {
                            x, y,
                            rotation,
                            angle,
                            positionedHull,
                            refPoint,  // ═══════════════════ ВАЖНО: refPoint для корректной отрисовки
                            bboxWidth: rotatedBbox.width,
                            bboxHeight: rotatedBbox.height
                        };
                    }
                }
                rowNum++;
            }
            
            if (!placedInChess) {
                // Не удалось разместить в шахматном порядке, продолжаем обычную раскладку
            }
        }
        
        // ═══════════════════════════════════════════════════════
        // ОБЫЧНАЯ РАСКЛАДКА — BOTTOM-LEFT
        // ═══════════════════════════════════════════════════════
        // Для не-круглых деталей или если шахматная не нашла позицию
        if (!isCircular) {
            // Генерируем кандидатные позиции (только у граней деталей)
            const candidates = generateCandidatePositions(placedParts, rotatedBbox.width, rotatedBbox.height, sheetWidth, sheetHeight, minGap, edgeGap, step);

            // Fallback: sparse grid для покрытия пустых зон
            const sparseGrid = [];
            const sparseStep = step * 3;
            for (let y = edgeGap; y <= sheetHeight - rotatedBbox.height - edgeGap; y += sparseStep) {
                for (let x = edgeGap; x <= sheetWidth - rotatedBbox.width - edgeGap; x += sparseStep) {
                    sparseGrid.push({ x, y });
                }
            }
            // Сначала Bottom-Left, потом grid fallback
            const allCandidates = [...candidates, ...sparseGrid];

            // Проверяем каждую позицию
            let checkedCount = 0;
            let rejectedBySheet = 0;
            let rejectedByIntersection = 0;
            
            for (let ci = 0; ci < allCandidates.length; ci++) {
                // Проверка отмены
                if (cancelCallback && cancelCallback()) {
                    return null;  // Прерываем поиск
                }

                // Разблокировка UI каждые 100 итераций
                if (ci % 100 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }

                const pos = allCandidates[ci];
                const x = pos.x;
                const y = pos.y;
                
                checkedCount++;

                // Сдвигаем полигон в позицию
                const positionedHull = translatePolygon(normalizedHull, x, y);

                // Проверка: внутри ли листа
                if (!isPolygonInsideSheet(positionedHull, sheetWidth, sheetHeight, minGap, edgeGap)) {
                    rejectedBySheet++;
                    continue;
                }

                // Проверка пересечений с уже размещёнными деталями по реальной геометрии
                let canPlace = true;
                // Используем Spatial Grid если есть, иначе перебираем все
                const partsToCheck = spatialGrid ? getNearbyParts(spatialGrid, x, y, rotatedBbox.width, rotatedBbox.height) : placedParts;
                for (const placed of partsToCheck) {
                    // Проверка отмены
                    if (cancelCallback && cancelCallback()) {
                        return null;  // Прерываем поиск
                    }

                    // ═══════════════════════════════════════════════════════════
                    // ВАЖНО: Пропускаем проверку с уже размещённой деталью 
                    // на ТОЙ ЖЕ САМОЙ позиции (это не пересечение, а дубликат)
                    // ═══════════════════════════════════════════════════════════
                    if (Math.abs(placed.x - x) < 1 && Math.abs(placed.y - y) < 1) {
                        continue;  // Пропускаем - это та же позиция
                    }

                    // ═══════════════════════════════════════════════════
                    // ПРОВЕРКА ПЕРЕСЕЧЕНИЙ
                    // ═══════════════════════════════════════════════════
                    let hasIntersection = false;

                    // Сначала быстрая проверка по выпуклой оболочке (если есть)
                    if (placed.positionedHull && Array.isArray(placed.positionedHull)) {
                        if (polygonsIntersect(positionedHull, placed.positionedHull, minGap)) {
                            hasIntersection = true;
                        }
                    }

                    // Если нет positionedHull, проверяем по bounding box
                    if (!hasIntersection) {
                        const placedWidth = placed.width || placed.bboxWidth;
                        const placedHeight = placed.height || placed.bboxHeight;
                        const placedX = placed.x;
                        const placedY = placed.y;

                        // Проверка пересечения прямоугольников
                        if (x < placedX + placedWidth &&
                            x + rotatedBbox.width > placedX &&
                            y < placedY + placedHeight &&
                            y + rotatedBbox.height > placedY) {
                            hasIntersection = true;
                        }
                    }

                    if (hasIntersection) {
                        canPlace = false;
                        rejectedByIntersection++;
                        
                        // ═══════════════════════════════════════════════════
                        // ОТЛАДКА: Выводим информацию о первом пересечении
                        // ═══════════════════════════════════════════════════
                        if (rejectedByIntersection === 1 && checkedCount <= 3) {
                            console.log(`         🔍 Деталь #${newPart.id} на (${x.toFixed(0)}, ${y.toFixed(0)}) пересекается с деталью на (${placed.x.toFixed(0)}, ${placed.y.toFixed(0)})`);
                            console.log(`            bbox1: [${(x).toFixed(0)}, ${(y).toFixed(0)}] - [${(x + rotatedBbox.width).toFixed(0)}, ${(y + rotatedBbox.height).toFixed(0)}]`);
                            console.log(`            bbox2: [${placed.x.toFixed(0)}, ${placed.y.toFixed(0)}] - [${(placed.x + (placed.width || placed.bboxWidth)).toFixed(0)}, ${(placed.y + (placed.height || placed.bboxHeight)).toFixed(0)}]`);
                        }
                        
                        break;
                    }
                }

                if (canPlace) {
                    console.log(`   ✅ Найдена позиция для детали #${newPart.id} на (${x.toFixed(0)}, ${y.toFixed(0)}) с поворотом ${rotationAngles[i]}°`);
                    return {
                        x, y,
                        rotation,
                        angle,
                        positionedHull,
                        refPoint,  // ═══════════════════ ВАЖНО: refPoint для корректной отрисовки
                        bboxWidth: rotatedBbox.width,
                        bboxHeight: rotatedBbox.height
                    };
                }
            }
            
            // Логирование если ни одна позиция не подошла
            if (checkedCount > 0) {
                console.log(`      ❌ Поворот ${rotationAngles[i]}°: проверено ${checkedCount} позиций, отклонено: ${rejectedBySheet} (лист) + ${rejectedByIntersection} (пересечение) = ${rejectedBySheet + rejectedByIntersection}`);
            }
        }
    }
    
    console.log(`   ❌ Не найдена позиция для детали #${newPart.id} ни с одним поворотом`);
    return null;
}

// ═══════════════════════════════════════════════════════════════
// ПОДБОР ОПТИМАЛЬНОГО ЛИСТА
// ═══════════════════════════════════════════════════════════════

// Стандартные размеры листов (определяются в index.html)
// const STANDARD_SHEETS = [...] - объявлено в index.html

// Найти оптимальный лист для деталей (БЫСТРЫЙ алгоритм)
function findOptimalSheet(partsToPlace) {
    if (partsToPlace.length === 0) return null;

    // Быстрая оценка по площади bounding box
    const totalBboxArea = partsToPlace.reduce((sum, part) => {
        return sum + (part.bounds.width * part.bounds.height * part.quantity);
    }, 0);

    const results = [];

    for (const sheet of STANDARD_SHEETS) {
        const sheetArea = sheet.width * sheet.height;
        // Быстрая проверка: влезает ли общая площадь (с запасом 15% на потери)
        const estimatedUtilization = (totalBboxArea / sheetArea * 100);
        
        if (estimatedUtilization <= 85) {  // Запас 15%
            results.push({
                sheet: sheet,
                estimatedUtilization: estimatedUtilization,
                waste: 100 - estimatedUtilization
            });
        }
    }

    // Сортируем по минимальным отходам
    results.sort((a, b) => a.waste - b.waste);

    // Возвращаем лучший вариант или null
    if (results.length > 0) {
        const best = results[0];
        return {
            sheet: best.sheet,
            utilization: best.estimatedUtilization,
            waste: best.waste,
            allPlaced: true,  // Предполагаем, что всё влезет
            placed: partsToPlace.reduce((sum, p) => sum + p.quantity, 0),
            totalNeeded: partsToPlace.reduce((sum, p) => sum + p.quantity, 0)
        };
    }

    return null;
}

// Проверка размещения на листе
async function tryPlacePartsOnSheet(partsToPlace, sheetWidth, sheetHeight, minGap, cancelCallback = null) {
    const placedPolygons = [];
    let totalPlaced = 0;
    const totalNeeded = partsToPlace.reduce((sum, part) => sum + part.quantity, 0);
    const sortedParts = [...partsToPlace].sort((a, b) => (b.bounds.width * b.bounds.height) - (a.bounds.width * a.bounds.height));

    // Spatial Grid для ускорения
    let spatialGrid = new Map();

    for (const part of sortedParts) {
        let placedCount = 0;
        while (placedCount < part.quantity) {
            // Проверка отмены
            if (cancelCallback && cancelCallback()) {
                return { placed: totalPlaced, allPlaced: false, totalNeeded, cancelled: true };
            }

            const position = await findPositionWithNFP(placedPolygons, part, sheetWidth, sheetHeight, cancelCallback, spatialGrid);
            if (position) {
                const placed = {
                    positionedHull: position.positionedHull,
                    x: position.x,
                    y: position.y,
                    partId: part.id,
                    part: part,
                    angle: position.angle,
                    rotation: position.rotation,
                    width: position.bboxWidth,
                    height: position.bboxHeight
                };
                placedPolygons.push(placed);
                addToSpatialGrid(spatialGrid, placed);
                placedCount++;
                totalPlaced++;
            } else {
                break;
            }
        }
    }

    return { placed: totalPlaced, allPlaced: totalPlaced === totalNeeded, totalNeeded };
}

// ═══════════════════════════════════════════════════════════════
// ФУНКЦИЯ РАСКЛАДКИ (вызов из index.html)
// ═══════════════════════════════════════════════════════════════

// Главная функция раскладки - вызывается при нажатии кнопки "🔲 Раскладка"
// existingNestedParts - уже размещённые детали (для добавления новых)
// cancelCallback - функция для проверки отмены
async function performNesting(parts, sheetSize, existingNestedParts = [], cancelCallback = null) {
    const startTime = performance.now();
    const partsToNest = parts.filter(p => p.nestingEnabled !== false);
    const totalQuantity = partsToNest.reduce((sum, p) => sum + p.quantity, 0);

    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`🚀 [РАСКЛАДКА] Начало. Деталей: ${partsToNest.length} (${totalQuantity} шт), Лист: ${sheetSize.width}×${sheetSize.height}`);
    console.log(`═══════════════════════════════════════════════════════════\n`);

    // Очищаем кэш выпуклых оболочек перед новой раскладкой
    clearPartHullCache();

    if (parts.length === 0) {
        alert('Сначала создайте детали (кнопку "📦 Создать деталь")');
        return null;
    }

    if (partsToNest.length === 0) {
        alert('⚠️ Отметьте детали для раскладки (галочка в списке деталей)');
        return null;
    }

    // Сортируем детали по убыванию площади bounding box (самые большие сначала)
    const sortedParts = [...partsToNest].sort((a, b) => {
        const areaA = a.bounds.width * a.bounds.height;
        const areaB = b.bounds.width * b.bounds.height;
        return areaB - areaA;
    });

    // Копируем уже размещённые детали
    const nestedParts = [...existingNestedParts];
    const placedPolygons = [];  // Хранит { positionedHull, x, y, partId, ... }

    // Создаём placedPolygons из уже размещённых деталей
    existingNestedParts.forEach(nested => {
        placedPolygons.push({
            positionedHull: nested.polygon,
            x: nested.x,
            y: nested.y,
            partId: nested.partId,
            part: parts.find(p => p.id === nested.partId),
            angle: nested.angle || 0,
            rotation: nested.rotation,  // ═══════════════════ ВАЖНО: rotation для stacking
            width: nested.width,
            height: nested.height
        });
    });

    // ═══════════════════════════════════════════════════════════
    // SPATIAL GRID — строим один раз, обновляем после каждой детали
    // ═══════════════════════════════════════════════════════════
    let spatialGrid = buildSpatialGrid(placedPolygons);

    const unplacedParts = [];

    // ═══════════════════════════════════════════════════════════
    // ПОСЛЕДОВАТЕЛЬНОЕ РАЗМЕЩЕНИЕ: от больших к маленьким
    // ═══════════════════════════════════════════════════════════
    // 1. Сначала размещаем все экземпляры самой большой детали
    // 2. Затем все экземпляры следующей по величине детали
    // 3. И так далее до самых маленьких
    // ═══════════════════════════════════════════════════════════

    for (let partIdx = 0; partIdx < sortedParts.length; partIdx++) {
        const part = sortedParts[partIdx];

        // Проверка отмены
        if (cancelCallback && cancelCallback()) {
            console.log('⚠️ Раскладка отменена пользователем (перед деталью)');
            return null;  // Возвращаем null при отмене
        }

        // ═══════════════════════════════════════════════════
        // ЛОГИРОВАНИЕ: количество для раскладки
        // ═══════════════════════════════════════════════════

        let placedCount = 0;
        let unplacedCount = 0;

        // Размещаем все экземпляры этой детали
        for (let q = 0; q < part.quantity; q++) {
            // Проверка отмены перед каждой деталью
            if (cancelCallback && cancelCallback()) {
                console.log('⚠️ Раскладка отменена пользователем (перед позицией)');
                return null;  // Возвращаем null при отмене
            }

            const position = await findPositionWithNFP(placedPolygons, part, sheetSize.width, sheetSize.height, cancelCallback, spatialGrid);

            if (position) {
                // ✅ Удалось разместить
                const outline = getPartPolygons(part);

                // ═══════════════════════════════════════════════════
                // Используем refPoint из findPositionWithNFP
                // ═══════════════════════════════════════════════════
                const refPoint = position.refPoint;

                nestedParts.push({
                    partId: part.id,
                    x: position.x,
                    y: position.y,
                    // Размеры повёрнутой детали (для расчёта пересечений)
                    width: position.bboxWidth || part.bounds.width,
                    height: position.bboxHeight || part.bounds.height,
                    // Исходные базовые размеры (для отображения)
                    baseWidth: part.bounds.width,
                    baseHeight: part.bounds.height,
                    rotation: position.rotation,
                    angle: position.angle || 0,
                    polygon: position.positionedHull,  // Точный контур
                    outline: outline,
                    refPoint: refPoint  // Сохраняем для отрисовки
                });
                placedPolygons.push({
                    positionedHull: position.positionedHull,
                    x: position.x,
                    y: position.y,
                    partId: part.id,
                    part: part,  // Сохраняем ссылку на деталь для проверки геометрии
                    angle: position.angle || 0,
                    rotation: position.rotation,  // ═══════════════════ ВАЖНО: rotation для stacking больших деталей
                    width: position.bboxWidth,
                    height: position.bboxHeight
                });
                // Обновляем Spatial Grid
                const lastPlaced = placedPolygons[placedPolygons.length - 1];
                addToSpatialGrid(spatialGrid, lastPlaced);

                placedCount++;

                // Разблокируем UI на 1 мс для обработки событий (клик отмены)
                await new Promise(resolve => setTimeout(resolve, 1));
            } else {
                // ❌ Не удалось разместить
                unplacedCount++;
                // Разблокируем UI даже при неудачном размещении
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }

        // Если остались неразмещённые детали этого типа
        if (unplacedCount > 0) {
            unplacedParts.push({
                partId: part.id,
                quantity: unplacedCount,
                placed: placedCount,
                total: part.quantity
            });
        }
    }

    // Статистика - расчёт по точной площади полигонов
    const totalArea = sheetSize.width * sheetSize.height;
    const usedArea = nestedParts.reduce((sum, p) => {
        const part = parts.find(pt => pt.id === p.partId);
        if (!part) return sum;
        // Используем площадь выпуклой оболочки
        const hull = getPartConvexHull(part);
        const polyArea = polygonArea(hull);
        return sum + polyArea;
    }, 0);
    const utilization = (usedArea / totalArea * 100).toFixed(1);

    const optimal = findOptimalSheet(parts);
    let recommendation = null;
    if (optimal && optimal.allPlaced) {
        const currentWaste = 100 - parseFloat(utilization);
        if (optimal.waste < currentWaste - 5) {
            recommendation = {
                sheetName: optimal.sheet.name,
                optimalWaste: optimal.waste.toFixed(1),
                currentWaste: currentWaste.toFixed(1),
                savings: (currentWaste - optimal.waste).toFixed(1)
            };
        }
    }

    const totalTime = (performance.now() - startTime).toFixed(0);
    const totalPlaced = nestedParts.length - existingNestedParts.length;
    const totalUnplaced = unplacedParts.reduce((s, p) => s + p.quantity, 0);
    const totalNesting = totalPlaced + totalUnplaced;

    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`✅ [РАСКЛАДКА] Завершена за ${totalTime} мс`);
    console.log(`   📦 Размещено деталей: ${totalPlaced}`);
    console.log(`   📋 Разложено деталей: ${totalNesting} шт`);
    console.log(`   ❌ Не размещено: ${totalUnplaced} шт.`);
    console.log(`   📊 Заполненность: ${utilization}%`);
    console.log(`═══════════════════════════════════════════════════════════\n`);

    return {
        nestedParts,
        unplacedParts,
        utilization: parseFloat(utilization),
        recommendation
    };
}

// ═══════════════════════════════════════════════════════════════
// ВРАЩЕНИЕ ДЕТАЛИ НА ЛИСТЕ
// ═══════════════════════════════════════════════════════════════

// Привязка угла к 0°, 90°, 180°, 270°
function snapAngle(angleDegrees) {
    // Нормализуем угол к диапазону [0, 360)
    angleDegrees = angleDegrees % 360;
    if (angleDegrees < 0) angleDegrees += 360;

    // Зоны привязки (±15° от целевого угла)
    if (angleDegrees >= 345 || angleDegrees <= 15) return 0;
    if (angleDegrees >= 75 && angleDegrees <= 105) return 90;
    if (angleDegrees >= 165 && angleDegrees <= 195) return 180;
    if (angleDegrees >= 255 && angleDegrees <= 285) return 270;

    // Нет привязки - возвращаем как есть
    return angleDegrees;
}

// Поворот детали на листе на заданный угол (в градусах)
// Returns: true если поворот успешен, false если не влезает
function rotateNestedPart(nested, rotationDegrees, sheetWidth, sheetHeight, allNestedParts) {
    const currentAngle = nested.angle || 0;
    const currentAngleDeg = (currentAngle * 180 / Math.PI) % 360;

    // Новый угол
    let newAngleDeg = currentAngleDeg + rotationDegrees;

    // Привязка к углам
    const snappedAngleDeg = snapAngle(newAngleDeg);

    // Преобразуем в радианы
    const newAngle = (snappedAngleDeg * Math.PI) / 180;

    // Получаем исходные размеры детали
    const baseWidth = nested.baseWidth || nested.width;
    const baseHeight = nested.baseHeight || nested.height;

    // Создаём bounding box для вращения
    const testHull = [
        { x: 0, y: 0 },
        { x: baseWidth, y: 0 },
        { x: baseWidth, y: baseHeight },
        { x: 0, y: baseHeight }
    ];

    // Центр детали для вращения
    const centerX = baseWidth / 2;
    const centerY = baseHeight / 2;

    // Поворачиваем bounding box
    const rotatedHull = rotatePolygon(testHull, newAngle, centerX, centerY);

    // Находим bottom-left повёрнутого hull
    let tempRef = rotatedHull[0];
    for (const p of rotatedHull) {
        const py = Math.round(p.y * 1000000) / 1000000;
        const refY = Math.round(tempRef.y * 1000000) / 1000000;
        const px = Math.round(p.x * 1000000) / 1000000;
        const refX = Math.round(tempRef.x * 1000000) / 1000000;

        if (py < refY || (py === refY && px < refX)) {
            tempRef = p;
        }
    }

    // Нормализуем: сдвигаем hull так чтобы bottom-left = (0,0)
    const tempNormalizedHull = rotatedHull.map(p => ({
        x: p.x - tempRef.x,
        y: p.y - tempRef.y
    }));

    // Получаем bounding box
    const tempBbox = getBoundingBox(tempNormalizedHull);

    // Дополнительный сдвиг: чтобы bounding box начинался с (0,0)
    const finalHull = tempNormalizedHull.map(p => ({
        x: p.x - tempBbox.minX,
        y: p.y - tempBbox.minY
    }));

    // refPoint для render.js: tempRef + tempBbox.min
    const newRefPoint = {
        x: tempRef.x + tempBbox.minX,
        y: tempRef.y + tempBbox.minY
    };

    const rotatedBbox = { width: tempBbox.width, height: tempBbox.height };

    // ═══════════════════════════════════════════════════════════
    // КОРРЕКЦИЯ ПОЗИЦИИ: сдвигаем деталь чтобы она не выходила за лист
    // (поворот всегда разрешён, но деталь должна остаться в пределах листа)
    // ═══════════════════════════════════════════════════════════
    let newX = nested.x;
    let newY = nested.y;

    // Сдвигаем по X если выходит за левый край
    if (newX < 0) newX = 0;
    // Сдвигаем по X если выходит за правый край
    if (newX + rotatedBbox.width > sheetWidth) newX = sheetWidth - rotatedBbox.width;
    // Сдвигаем по Y если выходит за верхний край
    if (newY < 0) newY = 0;
    // Сдвигаем по Y если выходит за нижний край
    if (newY + rotatedBbox.height > sheetHeight) newY = sheetHeight - rotatedBbox.height;

    // ═══════════════════════════════════════════════════════════
    // СТОЛКНОВЕНИЯ НЕ ПРОВЕРЯЕМ — поворот всегда разрешается
    // ═══════════════════════════════════════════════════════════

    // Всё OK - обновляем данные детали
    nested.x = newX;
    nested.y = newY;
    nested.angle = newAngle;
    nested.width = rotatedBbox.width;
    nested.height = rotatedBbox.height;
    nested.polygon = finalHull;
    // Сохраняем refPoint для отрисовки
    nested.refPoint = newRefPoint;

    console.log(`✅ Поворот детали #${nested.partId}: угол=${snappedAngleDeg}°, размер=${rotatedBbox.width.toFixed(0)}x${rotatedBbox.height.toFixed(0)}`);

    return true; // Поворот успешен
}

