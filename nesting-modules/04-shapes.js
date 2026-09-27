// ════════════════════════════════════════════════════════════════




(function(N) {
    'use strict';
    
N.isCircularPart = function isCircularPart(part) {
    if (!part?.objects?.length) return false;
    // v3.54: N.getShapeType() вместо o.type — Circle из shapes.js
    

    const hasCircles = part.objects.some(o => N.getShapeType(o) === 'circle');
    const hasHighPoly = part.objects.some(o => N.getShapeType(o) === 'polygon' && o.sides >= 16);
    if (!hasCircles && !hasHighPoly) return false;
    return part.objects.every(o =>
        N.getShapeType(o) === 'circle' ||
        (N.getShapeType(o) === 'polygon' && o.sides >= 16) ||
        N.getShapeType(o) === 'text'
    );
}

N.getCircleDiameter = function getCircleDiameter(part) {
    let d = 0;
    if (part.objects) {
        for (const o of part.objects) {
            // v3.54: N.getShapeType() вместо o.type
            if (N.getShapeType(o) === 'circle' || (N.getShapeType(o) === 'polygon' && o.sides >= 16)) {
                d = Math.max(d, (o.radius || 0) * 2);
            }
        }
    }
    return d || Math.max(part.bounds?.width || 0, part.bounds?.height || 0);
}

N.hasSolidFill = function hasSolidFill(part) {
    // v3.72: Расширенная проверка — деталь считается «заполненной» если:
    // 1) Есть rect/polygon объекты (оригинальная проверка), ИЛИ
    

    

    

    //    хотя у них реальные отверстия (28 кругов r=2..3).
    if ((part.objects || []).some(o => {
        const t = N.getShapeType(o);
        return t === 'rect' || t === 'polygon';
    })) return true;
    // Fallback: проверяем fillRate из occupancy grid
    const fg = N.getFilledOccupancyGrid(part, N.getAdaptiveGridSize(part, 3));
    return fg.fillRate > 0.3;
}

N.isLineHeavyPart = function isLineHeavyPart(part) {
    const objects = part.objects || [];
    if (objects.length === 0) return false;
    // v3.44: Детали с отверстиями всегда считаются «сложными»
    

    if (part._hasHoles === true) return true;
    // FIX: используем N.getShapeType() вместо прямого o.type — классы из
    

    const lineCount = objects.filter(o => N.getShapeType(o) === 'line').length;
    const arcCount = objects.filter(o => N.getShapeType(o) === 'arc').length;
    const polyCount = objects.filter(o => { const t = N.getShapeType(o); return t === 'polyline' || t === 'lwpolyline'; }).length;
    const solidCount = objects.filter(o => { const t = N.getShapeType(o); return t === 'rect' || t === 'polygon'; }).length;
    // FIX: для polyline/arc деталей учитываем количество ТОЧЕК, а не только объектов.
    

    

    

    let pointWeight = 0;
    for (const o of objects) {
        const t = N.getShapeType(o);
        if (t === 'polyline' || t === 'lwpolyline') {
            const pts = o.points || o.vertices || [];
            pointWeight += Math.max(1, Math.floor(pts.length / 10)); // 10 точек ≈ 1 "линия"
        }
        if (t === 'arc') {
            pointWeight += 3; // arc аппроксимируется 16 точками ≈ 3 "линии"
        }
    }
    const totalWeight = lineCount + arcCount + polyCount + pointWeight;
    // Много линий/дуг/полилиний и нет заполненных форм → криволинейная
    

    

    

    

    

    

    const threshold = arcCount > 0 ? 5 : 20;
    return totalWeight >= threshold && solidCount === 0;
}

N.isTrueLShaped = function isTrueLShaped(part) {
    // Quick-reject: сильно вытянутые детали — не Г-образные
    

    

    const bbox = part.bounds;
    if (bbox && bbox.width > 0 && bbox.height > 0) {
        const ar = Math.max(bbox.width, bbox.height) / Math.min(bbox.width, bbox.height);
        // FIX #4: AR > 2.5 слишком агрессивный — отбрасывает длинные
        

        

        if (ar > 4.5) {
            // v3.94: Диагностика AR-reject
            const partName = part.name || part.id || '?';
            if (!N._isTrueLShapedLogged) N._isTrueLShapedLogged = {};
            if (!N._isTrueLShapedLogged[partName]) {
                N._isTrueLShapedLogged[partName] = true;
                N.debug(`[isTrueLShaped] "${partName}": НЕ Г-образная (AR=${ar.toFixed(1)} > 4.5)`);
            }
            return false;
        }
    }

    // FIX #11: Адаптивный gridSize вместо фиксированного 5
    const fg = N.getFilledOccupancyGrid(part, N.getAdaptiveGridSize(part, 3));
    if (!fg || fg.gw < 4 || fg.gh < 4) return false;

    const { grid, gw, gh } = fg;
    const totalCells = gw * gh;
    const materialCells = grid.reduce((s, v) => s + v, 0);
    const emptyCells = totalCells - materialCells;

    // Если пустых ячеек мало — не Г-образная
    if (emptyCells < totalCells * 0.15) {
        // v3.94: Диагностика empty-reject
        const partName = part.name || part.id || '?';
        if (!N._isTrueLShapedLogged) N._isTrueLShapedLogged = {};
        if (!N._isTrueLShapedLogged[partName]) {
            N._isTrueLShapedLogged[partName] = true;
            N.debug(`[isTrueLShaped] "${partName}": НЕ Г-образная (мало пустот: ${emptyCells}/${totalCells} = ${(emptyCells/totalCells*100).toFixed(0)}% < 15%)`);
        }
        return false;
    }

    // Делим grid на 4 квадранта и считаем пустые ячейки в каждом
    const midX = Math.floor(gw / 2);
    const midY = Math.floor(gh / 2);

    // Квадранты: [BL, BR, TL, TR] — bottom-left, bottom-right, top-left, top-right
    const quads = [
        { name: 'BL', empty: 0, total: 0 },  // gx < midX, gy < midY
        { name: 'BR', empty: 0, total: 0 },  // gx >= midX, gy < midY
        { name: 'TL', empty: 0, total: 0 },  // gx < midX, gy >= midY
        { name: 'TR', empty: 0, total: 0 },  // gx >= midX, gy >= midY
    ];

    for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
            const qi = (gy < midY ? 0 : 2) + (gx < midX ? 0 : 1);
            quads[qi].total++;
            if (grid[gy * gw + gx] === 0) {
                quads[qi].empty++;
            }
        }
    }

    // Считаем empty ratio для каждого квадранта
    const ratios = quads.map(q => q.total > 0 ? q.empty / q.total : 0);
    const maxRatio = Math.max(...ratios);
    const minRatio = Math.min(...ratios);
    const sortedRatios = [...ratios].sort((a, b) => a - b);
    const medianRatio = (sortedRatios[1] + sortedRatios[2]) / 2; // среднее двух средних

    

    

    

    

    //       но полностью пустой квадрант — явный признак Г-формы.
    

    

    

    const ratio = maxRatio / Math.max(medianRatio, 0.01);
    const isL = (maxRatio > 0.55 && ratio > 1.8) ||
                (maxRatio > 0.90 && ratio > 1.3);

    const maxIdx = ratios.indexOf(maxRatio);
    const quadInfo = quads.map((q, i) =>
        `${q.name}:${(ratios[i]*100).toFixed(0)}%(${q.empty}/${q.total})`
    ).join(' ');

    // v3.94: Диагностика — логируем один раз на имя детали
    const partName = part.name || part.id || '?';
    if (!N._isTrueLShapedLogged) N._isTrueLShapedLogged = {};
    if (!N._isTrueLShapedLogged[partName]) {
        N._isTrueLShapedLogged[partName] = true;
        const ar = bbox ? (Math.max(bbox.width, bbox.height) / Math.min(bbox.width, bbox.height)).toFixed(1) : '?';
        const reason = isL ? (maxRatio > 0.90 && ratio > 1.3 ? 'thin-L(>90%,r>1.3)' : 'classic(r>1.8)') : `ratio=${ratio.toFixed(2)}`;
        N.debug(`[isTrueLShaped] "${partName}": ${isL ? 'Г-образная' : 'НЕ Г-образная'}`,
            `AR=${ar} fillRate=${(materialCells/totalCells*100).toFixed(0)}%`,
            `maxRatio=${maxRatio.toFixed(2)} ratio=${ratio.toFixed(2)}(${reason})`,
            `quads=[${quadInfo}]`);
    }

    return isL;
}

// ════════════════════════════════════════════════════════════════












// Признаки треугольника:
//   1. fillRate ≈ 0.5 (площадь ≈ половина bbox)






// Отвергается: круги (fillRate≈0.785), прямоугольники (fillRate=1),
// Г-образные (детектируются isTrueLShaped), правильные 6-угольники




N.isTrianglePart = function isTrianglePart(part) {
    const _pn = part ? (part.name || part.id || '?') : '?';
    if (!part || !part.bounds) { N.debug(`[isTrianglePart] "${_pn}": НЕТ (нет part/bounds)`); return false; }
    const bbox = part.bounds;
    if (!bbox || bbox.width <= 0 || bbox.height <= 0) { N.debug(`[isTrianglePart] "${_pn}": НЕТ (bbox нулевой: ${bbox.width}x${bbox.height})`); return false; }

    // Quick-reject 1: экстремальное aspect ratio — тонкие треугольники
    

    const ar = Math.max(bbox.width, bbox.height) / Math.min(bbox.width, bbox.height);
    if (ar > 5) { N.debug(`[isTrianglePart] "${_pn}": НЕТ (AR=${ar.toFixed(1)} > 5, слишком вытянутая)`); return false; }

    // Quick-reject 2: должна быть линейная/полилинейная/дуговая геометрия
    const objects = part.objects || [];
    if (objects.length === 0) { N.debug(`[isTrianglePart] "${_pn}": НЕТ (objects пуст)`); return false; }
    const hasLineGeom = objects.some(o => {
        const t = N.getShapeType(o);
        return t === 'line' || t === 'polyline' || t === 'lwpolyline' || t === 'arc';
    });
    if (!hasLineGeom) { N.debug(`[isTrianglePart] "${_pn}": НЕТ (нет line/polyline/arc геометрии, только ${objects.length} др.)`); return false; }

    // Quick-reject 3: круглые детали — не треугольники
    if (typeof N.isCircularPart === 'function' && N.isCircularPart(part)) { N.debug(`[isTrianglePart] "${_pn}": НЕТ (isCircularPart=true)`); return false; }

    // Quick-reject 4: не должна быть Г-образной.
    

    

    

    // что L-образные детали не попадут в triangle-ветку.

    const partName = _pn;

    // ───────────────────────────────────────────────────────────
    

    

    const hull = N.getPartBoundingHull(part);
    if (!hull || hull.length < 3) { N.debug(`[isTrianglePart] "${partName}": НЕТ (hull=${hull ? hull.length : 0} точек)`); return false; }
    const hullArea = Math.abs(N.polygonArea(hull));
    const bboxArea = bbox.width * bbox.height;
    if (bboxArea <= 0) { N.debug(`[isTrianglePart] "${partName}": НЕТ (bboxArea=0)`); return false; }
    const fillRate = hullArea / bboxArea;
    // Треугольник: 0.5 ± допуск. С фасками — чуть меньше 0.5.
    

    if (fillRate < 0.40 || fillRate > 0.62) { N.debug(`[isTrianglePart] "${partName}": НЕТ (fillRate=${(fillRate*100).toFixed(0)}% вне [40-62%], hull=${hull.length}pt, hullArea=${Math.round(hullArea)}, bboxArea=${Math.round(bboxArea)})`); return false; }

    // ───────────────────────────────────────────────────────────
    

    

    

    

    

    

    

    

    // кластеризация направлений по-прежнему даст 3 кластера.
    const convexHull = N.computeConvexHull(hull);
    if (convexHull.length < 3 || convexHull.length > 30) { N.debug(`[isTrianglePart] "${partName}": НЕТ (convexHull=${convexHull.length} вершин, вне [3-30], fillRate=${(fillRate*100).toFixed(0)}%)`); return false; }

    // Случай 1: ровно 3 вершины → явный треугольник (без фасок)
    if (convexHull.length === 3) {
        N.debug(`[isTrianglePart] "${partName}": ДА (3 вершины, fillRate=${(fillRate*100).toFixed(0)}%)`);
        return true;
    }

    // Случай 2: 4-12 вершин → проверяем кластеризацию направлений
    

    

    

    

    const allEdges = [];
    const n = convexHull.length;
    for (let i = 0; i < n; i++) {
        const a = convexHull[i];
        const b = convexHull[(i + 1) % n];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.5) continue;
        let dir = Math.atan2(dy, dx) * 180 / Math.PI;
        if (dir < 0) dir += 180; // mod 180° (AB и BA — одно направление)
        allEdges.push({ dir, len });
    }
    if (allEdges.length < 3) { N.debug(`[isTrianglePart] "${partName}": НЕТ (всего ${allEdges.length} рёбер после отсева <0.5мм)`); return false; }

    // Фильтр микрорёбер: абсолютный порог 5мм ИЛИ относительный 2% от max
    const maxEdgeLen = Math.max(...allEdges.map(e => e.len));
    const minEdgeThreshold = Math.max(5, maxEdgeLen * 0.02);
    const edges = allEdges.filter(e => e.len >= minEdgeThreshold);
    if (edges.length < 3) { N.debug(`[isTrianglePart] "${partName}": НЕТ (после фильтра микрорёбер <${minEdgeThreshold.toFixed(1)}мм осталось ${edges.length}, всего было ${allEdges.length}, fillRate=${(fillRate*100).toFixed(0)}%)`); return false; }

    // Сортируем по направлению и кластеризуем (допуск 15°)
    edges.sort((a, b) => a.dir - b.dir);
    const clusters = [];
    for (const e of edges) {
        if (clusters.length === 0) {
            clusters.push({ dirSum: e.dir, count: 1, lens: [e.len] });
        } else {
            const last = clusters[clusters.length - 1];
            const avgDir = last.dirSum / last.count;
            let diff = Math.abs(e.dir - avgDir);
            if (diff > 90) diff = 180 - diff; // wraparound
            if (diff < 15) {
                last.dirSum += e.dir;
                last.count++;
                last.lens.push(e.len);
            } else {
                clusters.push({ dirSum: e.dir, count: 1, lens: [e.len] });
            }
        }
    }
    // Merge wraparound (первый и последний кластер могут быть одним направлением)
    if (clusters.length >= 2) {
        const first = clusters[0], lastC = clusters[clusters.length - 1];
        const firstDir = first.dirSum / first.count;
        const lastDir = lastC.dirSum / lastC.count;
        let diff = Math.abs(firstDir - lastDir);
        if (diff > 90) diff = 180 - diff;
        if (diff < 15) {
            first.dirSum += lastC.dirSum;
            first.count += lastC.count;
            first.lens = first.lens.concat(lastC.lens);
            clusters.pop();
        }
    }

    // Треугольник → ровно 3 направления
    if (clusters.length !== 3) {
        const dirList = clusters.map(c => `${(c.dirSum/c.count).toFixed(0)}°(${c.count})`).join(', ');
        N.debug(`[isTrianglePart] "${partName}": НЕТ (кластеров=${clusters.length}, нужно 3, направления=[${dirList}], fillRate=${(fillRate*100).toFixed(0)}%, hull=${convexHull.length}верш.)`);
        return false;
    }

    // Каждое направление должно иметь хотя бы одно "длинное" ребро
    

    

    let clustersWithLongEdge = 0;
    for (const c of clusters) {
        if (c.lens.some(l => l > maxEdgeLen * 0.5)) clustersWithLongEdge++;
    }
    if (clustersWithLongEdge < 3) { N.debug(`[isTrianglePart] "${partName}": НЕТ (длинных рёбер в кластерах=${clustersWithLongEdge}/3, maxLen=${maxEdgeLen.toFixed(0)}мм, fillRate=${(fillRate*100).toFixed(0)}%)`); return false; }

    N.debug(`[isTrianglePart] "${partName}": ДА (${convexHull.length} вершин hull, ${clusters.length} направления, fillRate=${(fillRate*100).toFixed(0)}%)`);
    return true;
};

// ════════════════════════════════════════════════════════════════






// Для interlocking 0°+180° нужно знать:
//   - rightApexX: x самой правой нижней точки (конец правого ребра)










// Для симметричного равнобедренного треугольника leftApexX ≈ rightApexX






N.findTriangleApexInfo = function findTriangleApexInfo(part) {
    if (!part || !part.bounds) return null;
    const hull = N.getPartBoundingHull(part);
    if (!hull || hull.length < 3) return null;
    const bbox = part.bounds;
    if (!bbox || bbox.width <= 0 || bbox.height <= 0) return null;

    // v4.33 FIX: Находим основание как самое длинное ребро hull.
    

    // ПРОБЛЕМА (v4.31 и ранее): функция искала точки с минимальным Y
    

    

    

    // а не ≈ W (правый край основания) → idealX рассчитывался
    

    

    // v4.33 attempt 1 (поиск maxY) не сработал: hull перевёрнутого
    

    

    

    // v4.33 attempt 2 (строго горизонтальное ребро) не сработал:
    // основание может быть слегка наклонным (dy=7.6мм на 554мм) из-за
    

    

    // РЕШЕНИЕ: основание треугольника — самое ДЛИННОЕ ребро hull.
    

    

    

    

    let bestEdge = null;
    let bestLen = 0;
    for (let i = 0; i < hull.length; i++) {
        const a = hull[i];
        const b = hull[(i + 1) % hull.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > bestLen) {
            bestLen = len;
            bestEdge = { a, b, len };
        }
    }

    if (bestEdge && bestLen > bbox.width * 0.4) {
        // Нашли длинное ребро — это основание
        const leftApexX = Math.min(bestEdge.a.x, bestEdge.b.x);
        const rightApexX = Math.max(bestEdge.a.x, bestEdge.b.x);
        return {
            leftApexX,
            rightApexX,
            width: bbox.width,
            height: bbox.height
        };
    }

    // Fallback: старая логика (минимальный Y) — для нестандартных случаев
    let minY = Infinity;
    for (const p of hull) if (p.y < minY) minY = p.y;
    const tolerance = 2;
    const bottomPts = hull.filter(p => p.y <= minY + tolerance);
    if (bottomPts.length === 0) return null;
    bottomPts.sort((a, b) => a.x - b.x);
    return {
        leftApexX: bottomPts[0].x,
        rightApexX: bottomPts[bottomPts.length - 1].x,
        width: bbox.width,
        height: bbox.height
    };
};
})(window.Nesting = window.Nesting || {});