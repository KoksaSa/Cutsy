// ════════════════════════════════════════════════════════════════




(function(N) {
    'use strict';
    
N.mergeCloseVertices = function mergeCloseVertices(objects, eps = N.MERGE_EPS) {
    if (!objects || objects.length === 0) return objects;
    // FIX: Очищаем кеш spatial hash при новом вызове
    N.mergeCloseVertices._lineGrid = null;
    for (const obj of objects) {
        // v3.67: N.getShapeType() вместо obj.type — классы из shapes.js
        

        const objType = N.getShapeType(obj);
        if (objType === 'polyline' || objType === 'lwpolyline') {
            const pts = obj.points || obj.vertices || [];
            for (let i = 1; i < pts.length; i++) {
                const dx = pts[i].x - pts[i-1].x;
                const dy = pts[i].y - pts[i-1].y;
                if (Math.sqrt(dx*dx + dy*dy) < eps) {
                    pts[i].x = pts[i-1].x;
                    pts[i].y = pts[i-1].y;
                }
            }
        }
        // Для линий: если конечная точка одной линии близка к начальной
        

        

        

        if (objType === 'line') {
            // Ленивая инициализация spatial hash для line endpoints
            if (!N.mergeCloseVertices._lineGrid) {
                N.mergeCloseVertices._lineGrid = new Map();
                N.mergeCloseVertices._gridCell = eps * 2;
                // Индексируем все линии
                const gc = N.mergeCloseVertices._gridCell;
                for (const other of objects) {
                    if (N.getShapeType(other) !== 'line') continue;
                    // Индексируем начальную точку other
                    const k1 = `${(other.x1 / gc) | 0},${(other.y1 / gc) | 0}`;
                    const k2 = `${(other.x2 / gc) | 0},${(other.y2 / gc) | 0}`;
                    if (!N.mergeCloseVertices._lineGrid.has(k1)) N.mergeCloseVertices._lineGrid.set(k1, []);
                    if (!N.mergeCloseVertices._lineGrid.has(k2)) N.mergeCloseVertices._lineGrid.set(k2, []);
                    N.mergeCloseVertices._lineGrid.get(k1).push(other);
                    if (k1 !== k2) N.mergeCloseVertices._lineGrid.get(k2).push(other);
                }
            }
            const gc = N.mergeCloseVertices._gridCell;
            const grid = N.mergeCloseVertices._lineGrid;
            // Ищем соседей только в ближайших ячейках
            const checkKeys = [
                `${(obj.x2 / gc) | 0},${(obj.y2 / gc) | 0}`,
                `${((obj.x2 / gc) | 0) - 1},${(obj.y2 / gc) | 0}`,
                `${((obj.x2 / gc) | 0) + 1},${(obj.y2 / gc) | 0}`,
                `${(obj.x2 / gc) | 0},${((obj.y2 / gc) | 0) - 1}`,
                `${(obj.x2 / gc) | 0},${((obj.y2 / gc) | 0) + 1}`,
            ];
            const checked = new Set();
            for (const key of checkKeys) {
                const bucket = grid.get(key);
                if (!bucket) continue;
                for (const other of bucket) {
                    if (other === obj || N.getShapeType(other) !== 'line' || checked.has(other)) continue;
                    checked.add(other);
                    const dx1 = obj.x2 - other.x1;
                    const dy1 = obj.y2 - other.y1;
                    if (Math.sqrt(dx1*dx1 + dy1*dy1) < eps) {
                        other.x1 = obj.x2;
                        other.y1 = obj.y2;
                    }
                    const dx2 = obj.x1 - other.x2;
                    const dy2 = obj.y1 - other.y2;
                    if (Math.sqrt(dx2*dx2 + dy2*dy2) < eps) {
                        other.x2 = obj.x1;
                        other.y2 = obj.y1;
                    }
                }
            }
        }
    }
    return objects;
}

N.rasterizePartToGrid = function rasterizePartToGrid(part, gridSize = 10) {
    const bbox = part.bounds;
    if (!bbox || bbox.width < 2 || bbox.height < 2) {
        return { grid: new Uint8Array(0), gw: 0, gh: 0, gridSize, isHoleCircle: new Set() };
    }

    // v3.39: Слияние близких вершин ДО растеризации —
    

    

    

    

    if (!part._verticesMerged) {
        N.mergeCloseVertices(part.objects, N.MERGE_EPS);
        part._verticesMerged = true;
    }

    const gw = Math.ceil(bbox.width / gridSize);
    const gh = Math.ceil(bbox.height / gridSize);
    const grid = new Uint8Array(gw * gh);

    // КРУГОВЫЕ ОТВЕРСТИЯ: внутренние круги = пустоты
    

    const circles = (part.objects || []).filter(o => N.getShapeType(o) === 'circle');
    const isHoleCircle = new Set();
    if (circles.length >= 2) {
        for (let i = 0; i < circles.length; i++) {
            for (let j = 0; j < circles.length; j++) {
                if (i === j) continue;
                const outer = circles[i], inner = circles[j];
                const dist = Math.hypot((inner.cx||0)-(outer.cx||0), (inner.cy||0)-(outer.cy||0));
                if (dist + (inner.radius||0) < (outer.radius||0) - 1) {
                    isHoleCircle.add(part.objects.indexOf(inner));
                }
            }
        }
    }
    // v3.67: Круг внутри прямоугольника = отверстие (дыра).
    

    // круги находятся внутри rect, но не внутри другого круга,
    // поэтому предыдущая проверка их не находила.
    

    // а не как пустота → spacing не учитывал отверстия.
    const rects = (part.objects || []).filter(o => N.getShapeType(o) === 'rect');
    if (rects.length > 0 && circles.length > 0) {
        for (const circ of circles) {
            // Проверяем: круг полностью внутри какого-либо rect?
            for (const r of rects) {
                const ccx = circ.cx || 0, ccy = circ.cy || 0, cr = circ.radius || 0;
                const rx = r.x || 0, ry = r.y || 0, rw = r.width || 0, rh = r.height || 0;
                if (ccx - cr >= rx && ccy - cr >= ry &&
                    ccx + cr <= rx + rw && ccy + cr <= ry + rh) {
                    isHoleCircle.add(part.objects.indexOf(circ));
                    break;
                }
            }
        }
    }

    // Заполняем ячейки, занятые объектами
    for (let oi = 0; oi < (part.objects || []).length; oi++) {
        const obj = part.objects[oi];
        if (isHoleCircle.has(oi)) continue;

        // v3.54: N.getShapeType() вместо obj.type — классы из shapes.js
        

        const objType = N.getShapeType(obj);
        if (objType === 'rect') {
            // v3.67: Убрана дублирующая растеризация — раньше rect заполнялся
            

            

            N.rasterizeRectToGrid(obj, bbox, grid, gw, gh, gridSize);
        } else if (objType === 'circle') {
            N.rasterizeCircleToGrid(obj, bbox, grid, gw, gh, gridSize);
        } else if (objType === 'polygon') {
            const sides = obj.sides || 6;
            const r = obj.radius;
            const pcx = obj.cx - bbox.minX;
            const pcy = obj.cy - bbox.minY;
            const step = (Math.PI * 2) / sides;
            const polyPts = [];
            for (let i = 0; i < sides; i++) {
                const ang = step * i - Math.PI / 2;
                polyPts.push({ x: pcx + Math.cos(ang) * r, y: pcy + Math.sin(ang) * r });
            }
            // v3.49: loop-based min/max instead of Math.min(...spread) to prevent stack overflow
            let pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
            for (const p of polyPts) {
                if (p.x < pMinX) pMinX = p.x;
                if (p.y < pMinY) pMinY = p.y;
                if (p.x > pMaxX) pMaxX = p.x;
                if (p.y > pMaxY) pMaxY = p.y;
            }
            const px1 = Math.max(0, Math.floor(pMinX / gridSize));
            const py1 = Math.max(0, Math.floor(pMinY / gridSize));
            const px2 = Math.min(gw, Math.ceil(pMaxX / gridSize));
            const py2 = Math.min(gh, Math.ceil(pMaxY / gridSize));
            for (let gy = py1; gy < py2; gy++)
                for (let gx = px1; gx < px2; gx++)
                    if (N.isPointInPolygon({ x: (gx + 0.5) * gridSize, y: (gy + 0.5) * gridSize }, polyPts))
                        grid[gy * gw + gx] = 1;
        } else if (objType === 'line' || objType === 'arc' || objType === 'polyline' || objType === 'lwpolyline') {
            // v3.60: Используем общую функцию rasterizeLineObjectToGrid
            N.rasterizeLineObjectToGrid(obj, bbox, grid, gw, gh, gridSize, {
                fillPolygons: true,
                expandBy: 1
            });
        }
    }

    // СТИРАЕМ ячейки внутри кругов-отверстий
    for (const holeIdx of isHoleCircle) {
        const obj = part.objects[holeIdx];
        // v3.54: N.getShapeType() вместо obj.type
        if (N.getShapeType(obj) === 'circle') {
            const cx = (obj.cx - bbox.minX) / gridSize;
            const cy = (obj.cy - bbox.minY) / gridSize;
            const r = obj.radius / gridSize;
            const r2 = r * r;
            const gxMin = Math.max(0, Math.floor(cx - r));
            const gxMax = Math.min(gw, Math.ceil(cx + r));
            const gyMin = Math.max(0, Math.floor(cy - r));
            const gyMax = Math.min(gh, Math.ceil(cy + r));
            for (let gy = gyMin; gy < gyMax; gy++)
                for (let gx = gxMin; gx < gxMax; gx++)
                    if ((gx + 0.5 - cx) ** 2 + (gy + 0.5 - cy) ** 2 <= r2)
                        grid[gy * gw + gx] = 0;
        }
    }

    return { grid, gw, gh, gridSize, isHoleCircle };
}

N.rasterizeLineObjectToGrid = function rasterizeLineObjectToGrid(obj, bbox, grid, gw, gh, gridSize, options = {}) {
    const {
        fillPolygons = false,  // true: заполнять полигоны, false: только контур
        expandBy = 1           

    } = options;

    const objType = N.getShapeType(obj);

    if (objType === 'line') {
        const lx1 = (obj.x1 - bbox.minX) / gridSize;
        const ly1 = (obj.y1 - bbox.minY) / gridSize;
        const lx2 = (obj.x2 - bbox.minX) / gridSize;
        const ly2 = (obj.y2 - bbox.minY) / gridSize;
        const dx = lx2 - lx1, dy = ly2 - ly1;
        const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
        const sx = dx / steps, sy = dy / steps;

        for (let i = 0; i <= steps; i++) {
            const cgx = Math.round(lx1 + sx * i);
            const cgy = Math.round(ly1 + sy * i);
            for (let dy2 = -expandBy; dy2 <= expandBy; dy2++) {
                for (let dx2 = -expandBy; dx2 <= expandBy; dx2++) {
                    const gx = cgx + dx2, gy = cgy + dy2;
                    if (gx >= 0 && gx < gw && gy >= 0 && gy < gh) {
                        grid[gy * gw + gx] = 1;
                    }
                }
            }
        }
    } else if (objType === 'arc') {
        const acx = (obj.cx || 0) - bbox.minX;
        const acy = (obj.cy || 0) - bbox.minY;
        const r = Math.abs(obj.radius || 0);
        if (r > 0) {
            const sa = obj.startAngle ?? 0;
            const ea = obj.endAngle ?? (2 * Math.PI);
            const { sweep, dir } = N.computeArcSweepDir(sa, ea, obj.direction);
            const tolerance = 0.5;
            const segs = N.safeArcSegments(sweep, r, tolerance);
            const d = dir;
            const step = sweep / segs;

            for (let i = 0; i < segs; i++) {
                const a1 = sa + d * step * i;
                const a2 = sa + d * step * (i + 1);
                const x1 = (acx + Math.cos(a1) * r) / gridSize;
                const y1 = (acy + Math.sin(a1) * r) / gridSize;
                const x2 = (acx + Math.cos(a2) * r) / gridSize;
                const y2 = (acy + Math.sin(a2) * r) / gridSize;
                const dx = x2 - x1, dy = y2 - y1;
                const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
                const sx = dx / steps, sy = dy / steps;

                for (let j = 0; j <= steps; j++) {
                    const cgx = Math.round(x1 + sx * j);
                    const cgy = Math.round(y1 + sy * j);
                    for (let dy2 = -expandBy; dy2 <= expandBy; dy2++) {
                        for (let dx2 = -expandBy; dx2 <= expandBy; dx2++) {
                            const gx = cgx + dx2, gy = cgy + dy2;
                            if (gx >= 0 && gx < gw && gy >= 0 && gy < gh) {
                                grid[gy * gw + gx] = 1;
                            }
                        }
                    }
                }
            }
        }
    } else if (objType === 'polyline' || objType === 'lwpolyline') {
        const pts = obj.points || obj.vertices || [];
        if (pts.length >= 3 && fillPolygons) {
            // Заполнение полигона
            let pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
            for (const p of pts) {
                if (p.x < pMinX) pMinX = p.x;
                if (p.y < pMinY) pMinY = p.y;
                if (p.x > pMaxX) pMaxX = p.x;
                if (p.y > pMaxY) pMaxY = p.y;
            }
            const normPts = pts.map(p => ({ x: p.x - bbox.minX, y: p.y - bbox.minY }));
            const px1 = Math.max(0, Math.floor(pMinX / gridSize));
            const py1 = Math.max(0, Math.floor(pMinY / gridSize));
            const px2 = Math.min(gw, Math.ceil(pMaxX / gridSize));
            const py2 = Math.min(gh, Math.ceil(pMaxY / gridSize));
            for (let gy = py1; gy < py2; gy++) {
                for (let gx = px1; gx < px2; gx++) {
                    if (N.isPointInPolygon({ x: (gx + 0.5) * gridSize, y: (gy + 0.5) * gridSize }, normPts)) {
                        grid[gy * gw + gx] = 1;
                    }
                }
            }
        } else if (pts.length >= 2) {
            // Контур полилинии (или отрезок из 2 точек)
            

            

            const isClosedPoly = obj.closed === true || obj.isClosed === true;
            const segCount = isClosedPoly && pts.length >= 3 ? pts.length : pts.length - 1;
            for (let i = 0; i < segCount; i++) {
                const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
                const lx1 = (p1.x - bbox.minX) / gridSize;
                const ly1 = (p1.y - bbox.minY) / gridSize;
                const lx2 = (p2.x - bbox.minX) / gridSize;
                const ly2 = (p2.y - bbox.minY) / gridSize;
                const dx = lx2 - lx1, dy = ly2 - ly1;
                const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
                const sx = dx / steps, sy = dy / steps;

                for (let j = 0; j <= steps; j++) {
                    const cgx = Math.round(lx1 + sx * j);
                    const cgy = Math.round(ly1 + sy * j);
                    for (let dy2 = -expandBy; dy2 <= expandBy; dy2++) {
                        for (let dx2 = -expandBy; dx2 <= expandBy; dx2++) {
                            const gx = cgx + dx2, gy = cgy + dy2;
                            if (gx >= 0 && gx < gw && gy >= 0 && gy < gh) {
                                grid[gy * gw + gx] = 1;
                            }
                        }
                    }
                }
            }
        }
    }

    return grid;
}

N.rasterizeCircleToGrid = function rasterizeCircleToGrid(obj, bbox, grid, gw, gh, gridSize) {
    const cx = (obj.cx - bbox.minX) / gridSize;
    const cy = (obj.cy - bbox.minY) / gridSize;
    const r = obj.radius / gridSize;
    const r2 = r * r;
    const gxMin = Math.max(0, Math.floor(cx - r));
    const gxMax = Math.min(gw, Math.ceil(cx + r));
    const gyMin = Math.max(0, Math.floor(cy - r));
    const gyMax = Math.min(gh, Math.ceil(cy + r));
    for (let gy = gyMin; gy < gyMax; gy++) {
        for (let gx = gxMin; gx < gxMax; gx++) {
            if ((gx + 0.5 - cx) ** 2 + (gy + 0.5 - cy) ** 2 <= r2) {
                grid[gy * gw + gx] = 1;
            }
        }
    }
}

N.rasterizeRectToGrid = function rasterizeRectToGrid(obj, bbox, grid, gw, gh, gridSize) {
    const x1 = Math.max(0, Math.floor((obj.x - bbox.minX) / gridSize));
    const y1 = Math.max(0, Math.floor((obj.y - bbox.minY) / gridSize));
    const x2 = Math.min(gw, Math.ceil((obj.x - bbox.minX + obj.width) / gridSize));
    const y2 = Math.min(gh, Math.ceil((obj.y - bbox.minY + obj.height) / gridSize));
    for (let gy = y1; gy < y2; gy++) {
        for (let gx = x1; gx < x2; gx++) {
            grid[gy * gw + gx] = 1;
        }
    }
}

N.getPartOccupancyGrid = function getPartOccupancyGrid(part, gridSize = 10) {
    const key = N.getPartHullCacheKey(part) + ':grid:' + gridSize;
    if (N.partGridCache.has(key)) return N.partGridCache.get(key);

    // FIX #11: используем общую rasterizePartToGrid вместо дублирования
    const { grid, gw, gh } = N.rasterizePartToGrid(part, gridSize);
    const result = { grid, gw, gh, gridSize };
    N.partGridCache.set(key, result);
    return result;
}

N.getFilledOccupancyGrid = function getFilledOccupancyGrid(part, gridSize = 10) {
    const key = N.getPartHullCacheKey(part) + ':filled:' + gridSize;
    if (N.filledGridCache.has(key)) return N.filledGridCache.get(key);

    const bbox = part.bounds;
    if (!bbox || bbox.width < 2 || bbox.height < 2) {
        const result = { grid: new Uint8Array(0), gw: 0, gh: 0, gridSize };
        N.filledGridCache.set(key, result);
        return result;
    }

    const gw = Math.ceil(bbox.width / gridSize);
    const gh = Math.ceil(bbox.height / gridSize);
    // Используем Uint8Array: 0=неизвестно, 1=граница(линия), 2=exterior, 3=interior
    const grid = new Uint8Array(gw * gh);

    // Шаг 1: Растеризуем объекты — тонкие линии (без 3x3 расширения)
    

    

    

    for (const obj of part.objects || []) {
        const objType = N.getShapeType(obj);
        if (objType === 'line' || objType === 'arc' || objType === 'polyline' || objType === 'lwpolyline') {
            // v3.60: Общая функция растеризации (expandBy=0 для тонких линий)
            N.rasterizeLineObjectToGrid(obj, bbox, grid, gw, gh, gridSize, {
                fillPolygons: true,
                expandBy: 0  

            });
        } else if (objType === 'rect') {
            N.rasterizeRectToGrid(obj, bbox, grid, gw, gh, gridSize);
        } else if (objType === 'circle') {
            N.rasterizeCircleToGrid(obj, bbox, grid, gw, gh, gridSize);
        }
    }

    // Шаг 1.5: Dilation контура — расширяем границы на 1 ячейку
    

    // предотвращая утечку flood-fill через разрывы контура.
    

    // вместо правильных ≈80%, что приводит к ложным пересечениям
    

    const dilated = new Uint8Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
            if (grid[gy * gw + gx] === 1) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const ny = gy + dy, nx = gx + dx;
                        if (ny >= 0 && ny < gh && nx >= 0 && nx < gw) {
                            dilated[ny * gw + nx] = 1;
                        }
                    }
                }
            }
        }
    }
    // Копируем dilation обратно в grid
    for (let i = 0; i < grid.length; i++) {
        if (dilated[i] === 1) grid[i] = 1;
    }

    // Шаг 2: Flood-fill от краёв сетки — помечаем exterior (2)
    

    

    const visited = new Uint8Array(gw * gh);
    const queue = [];

    // Добавляем все краевые ячейки, не занятые контуром
    for (let gx = 0; gx < gw; gx++) {
        const topIdx = gx;
        if (grid[topIdx] !== 1 && !visited[topIdx]) { visited[topIdx] = 1; queue.push(topIdx); }
        const botIdx = (gh - 1) * gw + gx;
        if (grid[botIdx] !== 1 && !visited[botIdx]) { visited[botIdx] = 1; queue.push(botIdx); }
    }
    for (let gy = 1; gy < gh - 1; gy++) {
        const leftIdx = gy * gw;
        if (grid[leftIdx] !== 1 && !visited[leftIdx]) { visited[leftIdx] = 1; queue.push(leftIdx); }
        const rightIdx = gy * gw + gw - 1;
        if (grid[rightIdx] !== 1 && !visited[rightIdx]) { visited[rightIdx] = 1; queue.push(rightIdx); }
    }

    let head = 0;
    while (head < queue.length) {
        const idx = queue[head++];
        const gx = idx % gw, gy = (idx - gx) / gw;
        if (grid[idx] === 1) continue; // Наткнулись на границу — стоп

        grid[idx] = 2; // exterior

        

        const neighbors = [
            gy > 0 ? idx - gw : -1,
            gy < gh - 1 ? idx + gw : -1,
            gx > 0 ? idx - 1 : -1,
            gx < gw - 1 ? idx + 1 : -1
        ];
        for (const ni of neighbors) {
            if (ni < 0 || visited[ni]) continue;
            visited[ni] = 1;
            queue.push(ni);
        }
    }

    // ═══════════════════════════════════════════════════
    

    // Раньше: 2.5 → 2.6 → 2.7 (hull patch после hole detection)
    

    

    

    

    

    

    

    


    

    

    

    // внутренние ячейки ошибочно помечаются как exterior (2).
    

    

    

    {
        const hullPts = N.getPartBoundingHull(part);
        if (hullPts && hullPts.length >= 3) {
            const hullArea = Math.abs(N.polygonArea(hullPts));
            const bboxArea2 = bbox.width * bbox.height;
            const expectedFillRate = hullArea / bboxArea2;

            // Считаем текущий fillRate (ячеек не-exterior)
            let currentMaterial = 0;
            for (let i = 0; i < grid.length; i++) {
                if (grid[i] !== 2) currentMaterial++;
            }
            const currentFillRate = currentMaterial / (gw * gh);

            // Если текущий fillRate < 60% от ожидаемого → flood-fill протёк
            if (currentFillRate < expectedFillRate * 0.60) {
                let patchedCount = 0;
                for (let gy = 0; gy < gh; gy++) {
                    for (let gx = 0; gx < gw; gx++) {
                        const idx = gy * gw + gx;
                        if (grid[idx] === 2) { // помечено как exterior
                            const px = (gx + 0.5) * gridSize;
                            const py = (gy + 0.5) * gridSize;
                            if (N.isPointInPolygon({ x: px, y: py }, hullPts)) {
                                grid[idx] = 0; // восстанавливаем как interior
                                patchedCount++;
                            }
                        }
                    }
                }
                if (patchedCount > 0) {
                    // Hull patch restored ${patchedCount} cells
                }
            }
        }
    }

    // Шаг 2.5: v3.41 Обработка концентрических кругов (колец/фланцев).
    

    

    

    

    

    

    

    

    const fCircles = (part.objects || []).filter(o => N.getShapeType(o) === 'circle');
    // v3.87: Убран verbose debug log — слишком шумный при многих деталях
    if (fCircles.length >= 2) {
        let concentricCleared = 0;
        for (let i = 0; i < fCircles.length; i++) {
            for (let j = 0; j < fCircles.length; j++) {
                if (i === j) continue;
                const outer = fCircles[i], inner = fCircles[j];
                const dist = Math.hypot((inner.cx||0)-(outer.cx||0), (inner.cy||0)-(outer.cy||0));
                if (dist + (inner.radius||0) < (outer.radius||0) - 1) {
                    // inner внутри outer → очищаем inner circle area
                    const icx = (inner.cx - bbox.minX) / gridSize;
                    const icy = (inner.cy - bbox.minY) / gridSize;
                    const ir = inner.radius / gridSize;
                    const ir2 = ir * ir;
                    const gxMin = Math.max(0, Math.floor(icx - ir));
                    const gxMax = Math.min(gw, Math.ceil(icx + ir));
                    const gyMin = Math.max(0, Math.floor(icy - ir));
                    const gyMax = Math.min(gh, Math.ceil(icy + ir));
                    for (let gy = gyMin; gy < gyMax; gy++) {
                        for (let gx = gxMin; gx < gxMax; gx++) {
                            if ((gx + 0.5 - icx) ** 2 + (gy + 0.5 - icy) ** 2 <= ir2) {
                                grid[gy * gw + gx] = 2; // exterior → будет 0 на шаге 3
                                concentricCleared++;
                            }
                        }
                    }
                }
            }
        }
        if (concentricCleared > 0) {
            // concentric circles cleared ${concentricCleared} cells
        }
    }

    // Шаг 2.5b: v3.67 Круг внутри прямоугольника = отверстие (дыра).
    

    // rasterizeCircleToGrid заполняет круг как МАТЕРИАЛ (1), а не
    

    

    

    

    {
        const fRects = (part.objects || []).filter(o => N.getShapeType(o) === 'rect');
        if (fRects.length > 0 && fCircles.length > 0) {
            let rectCircleCleared = 0;
            for (const circ of fCircles) {
                const ccx = circ.cx || 0, ccy = circ.cy || 0, cr = circ.radius || 0;
                // Проверяем: круг полностью внутри какого-либо rect?
                const isInsideRect = fRects.some(r =>
                    ccx - cr >= (r.x || 0) && ccy - cr >= (r.y || 0) &&
                    ccx + cr <= (r.x || 0) + (r.width || 0) && ccy + cr <= (r.y || 0) + (r.height || 0)
                );
                if (isInsideRect) {
                    const icx = (ccx - bbox.minX) / gridSize;
                    const icy = (ccy - bbox.minY) / gridSize;
                    const ir = cr / gridSize;
                    const ir2 = ir * ir;
                    const gxMin = Math.max(0, Math.floor(icx - ir));
                    const gxMax = Math.min(gw, Math.ceil(icx + ir));
                    const gyMin = Math.max(0, Math.floor(icy - ir));
                    const gyMax = Math.min(gh, Math.ceil(icy + ir));
                    for (let gy = gyMin; gy < gyMax; gy++) {
                        for (let gx = gxMin; gx < gxMax; gx++) {
                            if ((gx + 0.5 - icx) ** 2 + (gy + 0.5 - icy) ** 2 <= ir2) {
                                grid[gy * gw + gx] = 2; // exterior → будет 0 на шаге 3
                                rectCircleCleared++;
                            }
                        }
                    }
                }
            }
            if (rectCircleCleared > 0) {
                // circle-in-rect holes cleared ${rectCircleCleared} cells
            }
        }
    }

    // Шаг 2.6: v3.53 Inner hole detection для линейных контуров.
    

    

    

    

    

    

    

    // Алгоритм:
    // 1. Находим «material seeds» — 0-ячейки, соседствующие с
    

    

    

    

    

    {
        const materialVisited = new Uint8Array(gw * gh);
        const materialQueue = [];

        for (let gy = 1; gy < gh - 1; gy++) {
            for (let gx = 1; gx < gw - 1; gx++) {
                const idx = gy * gw + gx;
                if (grid[idx] !== 0) continue; // Только 0-ячейки

                

                // у которой есть 2-сосед (exterior)?
                let isMaterialSeed = false;
                const neighbors4 = [idx - gw, idx + gw, idx - 1, idx + 1];
                for (const ni of neighbors4) {
                    if (ni < 0 || ni >= gw * gh) continue;
                    if (grid[ni] !== 1) continue;
                    // Эта 1-ячейка — граница. Проверяем её соседей на exterior (2)
                    const bny = Math.floor(ni / gw), bnx = ni % gw;
                    const bNeighbors = [];
                    if (bny > 0) bNeighbors.push(ni - gw);
                    if (bny < gh - 1) bNeighbors.push(ni + gw);
                    if (bnx > 0) bNeighbors.push(ni - 1);
                    if (bnx < gw - 1) bNeighbors.push(ni + 1);
                    for (const bni of bNeighbors) {
                        if (grid[bni] === 2) {
                            isMaterialSeed = true;
                            break;
                        }
                    }
                    if (isMaterialSeed) break;
                }

                if (isMaterialSeed) {
                    materialVisited[idx] = 1;
                    materialQueue.push(idx);
                }
            }
        }

        if (materialQueue.length > 0) {
            // Flood-fill от material seeds через 0-ячейки
            let mHead = 0;
            while (mHead < materialQueue.length) {
                const idx = materialQueue[mHead++];
                const gx = idx % gw, gy = (idx - gx) / gw;
                const neighbors4 = [
                    gy > 0 ? idx - gw : -1,
                    gy < gh - 1 ? idx + gw : -1,
                    gx > 0 ? idx - 1 : -1,
                    gx < gw - 1 ? idx + 1 : -1
                ];
                for (const ni of neighbors4) {
                    if (ni < 0 || materialVisited[ni]) continue;
                    if (grid[ni] === 0) {
                        materialVisited[ni] = 1;
                        materialQueue.push(ni);
                    }
                }
            }

            // Оставшиеся 0-ячейки = дыры → помечаем как 4
            let holeCellCount = 0;
            for (let i = 0; i < grid.length; i++) {
                if (grid[i] === 0 && !materialVisited[i]) {
                    grid[i] = 4; // hole — станет 0 (пусто) на шаге 3
                    holeCellCount++;
                }
            }
            if (holeCellCount > 0) {
                // Inner holes: detected ${holeCellCount} hole cells
            }
        }
    }

    // Шаг 3: Финализация — всё что НЕ exterior/hole = материал (1)
    

    let materialCells = 0;
    let emptyCells = 0;
    for (let i = 0; i < grid.length; i++) {
        if (grid[i] === 2 || grid[i] === 4) {
            grid[i] = 0; // exterior или hole = пусто
            emptyCells++;
        } else {
            grid[i] = 1; // boundary или interior = материал
            materialCells++;
        }
    }

    // Проверка: если материала слишком мало (< 10% сетки),
    // вероятно контур не замкнут и flood-fill «протёк».
    

    

    

    

    

    const totalCells = gw * gh;
    // v3.87: Убран verbose debug log fillRate
    const lineCount = (part.objects || []).filter(o => N.getShapeType(o) === 'line').length;
    if (materialCells < totalCells * 0.10 && lineCount > 5) {
        // Fallback: просто тонкие линии (без заливки interior)
        const thinGrid = new Uint8Array(gw * gh);
        // v3.60: Используем rasterizeLineObjectToGrid для line/arc/polyline
        for (const obj of part.objects || []) {
            const objType = N.getShapeType(obj);
            if (objType === 'line' || objType === 'arc' || objType === 'polyline' || objType === 'lwpolyline') {
                N.rasterizeLineObjectToGrid(obj, bbox, thinGrid, gw, gh, gridSize, {
                    fillPolygons: false,  // Только контур
                    expandBy: 0
                });
            } else if (objType === 'rect') {
                N.rasterizeRectToGrid(obj, bbox, thinGrid, gw, gh, gridSize);
            } else if (objType === 'circle') {
                N.rasterizeCircleToGrid(obj, bbox, thinGrid, gw, gh, gridSize);
            }
        }
        const result = { grid: thinGrid, gw, gh, gridSize, fillRate: thinGrid.reduce((s, v) => s + v, 0) / (gw * gh) };
        N.filledGridCache.set(key, result);
        return result;
    }

    const result = { grid, gw, gh, gridSize, fillRate: materialCells / totalCells };
    // v4.01: Кешируем fillRate на объекте part для getAdaptiveGridSize
    if (part && typeof part === 'object') part._cachedFillRate = materialCells / totalCells;
    N.filledGridCache.set(key, result);
    return result;
}

N.dilateOccupancyGrid = function dilateOccupancyGrid(grid, gw, gh, radius) {
    if (radius <= 0) return grid;
    const dilated = new Uint8Array(gw * gh);
    const r2 = radius * radius;
    for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
            if (grid[gy * gw + gx] !== 1) continue;
            // Расширяем ячейку на radius во всех направлениях
            const dyMin = Math.max(0, gy - radius);
            const dyMax = Math.min(gh - 1, gy + radius);
            const dxMin = Math.max(0, gx - radius);
            const dxMax = Math.min(gw - 1, gx + radius);
            for (let dy = dyMin; dy <= dyMax; dy++) {
                for (let dx = dxMin; dx <= dxMax; dx++) {
                    // Используем круговую дилатацию (не квадратную)
                    if ((dx - gx) * (dx - gx) + (dy - gy) * (dy - gy) <= r2) {
                        dilated[dy * gw + dx] = 1;
                    }
                }
            }
        }
    }
    return dilated;
}
})(window.Nesting = window.Nesting || {});