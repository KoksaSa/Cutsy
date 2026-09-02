// ════════════════════════════════════════════════════════════════
// SilikinK Nesting Engine — Shape Detection & Part Classification (Module 04)
// ════════════════════════════════════════════════════════════════
(function(N) {
    'use strict';
    
N.isCircularPart = function isCircularPart(part) {
    if (!part?.objects?.length) return false;
    // v3.54: N.getShapeType() вместо o.type — Circle из shapes.js
    // может не иметь .type → isCircularPart неверно возвращал false
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
    // 2) fillRate > 30% — значит контур замкнут и материал есть.
    //    Раньше детали из линий + кругов (боковина: 87.7% fillRate)
    //    считались "не заполненными" → Hole Quick-Place их пропускал,
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
    // для grid-based collision detection (hull не отражает отверстия)
    if (part._hasHoles === true) return true;
    // FIX: используем N.getShapeType() вместо прямого o.type — классы из
    // shapes.js (Circle, Rect, Arc, Polygon) могут не иметь .type (v3.54)
    const lineCount = objects.filter(o => N.getShapeType(o) === 'line').length;
    const arcCount = objects.filter(o => N.getShapeType(o) === 'arc').length;
    const polyCount = objects.filter(o => { const t = N.getShapeType(o); return t === 'polyline' || t === 'lwpolyline'; }).length;
    const solidCount = objects.filter(o => { const t = N.getShapeType(o); return t === 'rect' || t === 'polygon'; }).length;
    // FIX: для polyline/arc деталей учитываем количество ТОЧЕК, а не только объектов.
    // Раньше порог >= 20 объектов — полилиния из 200 точек (1 объект) не попадала
    // в line-heavy, хотя по сути является сложным контуром.
    // Теперь: polyline с >= 10 точками считается эквивалентной нескольким линиям.
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
    // v4.05: Для деталей с дугами (arc) — снижаем порог с 20 до 5.
    // Дуги — криволинейные элементы, hull (convex) не отражает
    // их реальную геометрию → нужен grid-based collision detection.
    // Раньше порог >=20 пропускал детали с 4-6 дугами
    // (totalWeight=18) → isLineHeavyPart=false → Quick-Place
    // «вслед» использовал только bbox-проверку → наложения дуг.
    const threshold = arcCount > 0 ? 5 : 20;
    return totalWeight >= threshold && solidCount === 0;
}

N.isTrueLShaped = function isTrueLShaped(part) {
    // Quick-reject: сильно вытянутые детали — не Г-образные
    // Г-образная деталь по определению имеет сравнимые размеры
    // по обеим осям (иначе нет «угла» для взаимного вложения)
    const bbox = part.bounds;
    if (bbox && bbox.width > 0 && bbox.height > 0) {
        const ar = Math.max(bbox.width, bbox.height) / Math.min(bbox.width, bbox.height);
        // FIX #4: AR > 2.5 слишком агрессивный — отбрасывает длинные
        // Г-образные (┌────── │ └───────┘), которые реально вкладываются.
        // Порог 4.5 сохраняет их.
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

    // Г-образная: один квадрант значительно пустее остальных
    //   Условие 1 (классическое): maxRatio > 0.55 И ratio > 1.8
    //   Условие 2 (тонкостенные L): один квадрант >90% пустой И ratio > 1.3
    //     — для тонких L-деталей (5мм стенки) медиана высокая (60-70%),
    //       но полностью пустой квадрант — явный признак Г-формы.
    //     Пример: "Угол 5мм" → quads=[61%,67%,65%,100%], ratio=1.51<1.8
    //       но TR=100% → явно Г-образная.
    // Прямоугольная: все квадранты похожи → ratio ≈ 1.0
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
// v4.24: ТРЕУГОЛЬНАЯ ДЕТАЛЬ — детекция для interlocking 0°+180°
// ════════════════════════════════════════════════════════════════
// Треугольные детали при чередовании 0°/180° взаимно вкладываются
// друг в друга (вершина верх/низ), образуя плотный прямоугольный
// паттерн. Без interlocking — занимают bbox, теряя ~50% площади.
//
// Признаки треугольника:
//   1. fillRate ≈ 0.5 (площадь ≈ половина bbox)
//   2. Convex hull имеет 3 доминирующих направления рёбер
//   3. В каждом направлении — 1 длинное ребро (сторона) + 1 короткое (фаска)
//
// Отвергается: круги (fillRate≈0.785), прямоугольники (fillRate=1),
// Г-образные (детектируются isTrueLShaped), правильные 6-угольники
// (все рёбра равной длины → нет "фасок").
// ════════════════════════════════════════════════════════════════
N.isTrianglePart = function isTrianglePart(part) {
    const _pn = part ? (part.name || part.id || '?') : '?';
    if (!part || !part.bounds) { N.debug(`[isTrianglePart] "${_pn}": НЕТ (нет part/bounds)`); return false; }
    const bbox = part.bounds;
    if (!bbox || bbox.width <= 0 || bbox.height <= 0) { N.debug(`[isTrianglePart] "${_pn}": НЕТ (bbox нулевой: ${bbox.width}x${bbox.height})`); return false; }

    // Quick-reject 1: экстремальное aspect ratio — тонкие треугольники
    // не выигрывают от interlocking (узкий + узкий = узкий, не прямоугольник)
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
    // ВАЖНО: не вызываем N.isTrueLShaped() здесь, чтобы не нарушить
    // её логику однократного логирования. Вместо этого в 17-nesting.js
    // проверяем isTrianglePart ПЕРЕД isTrueLShaped — порядок гарантирует,
    // что L-образные детали не попадут в triangle-ветку.

    const partName = _pn;

    // ───────────────────────────────────────────────────────────
    // ОСНОВНАЯ ПРОВЕРКА: fillRate ≈ 0.5
    // ───────────────────────────────────────────────────────────
    const hull = N.getPartBoundingHull(part);
    if (!hull || hull.length < 3) { N.debug(`[isTrianglePart] "${partName}": НЕТ (hull=${hull ? hull.length : 0} точек)`); return false; }
    const hullArea = Math.abs(N.polygonArea(hull));
    const bboxArea = bbox.width * bbox.height;
    if (bboxArea <= 0) { N.debug(`[isTrianglePart] "${partName}": НЕТ (bboxArea=0)`); return false; }
    const fillRate = hullArea / bboxArea;
    // Треугольник: 0.5 ± допуск. С фасками — чуть меньше 0.5.
    // С тупоугольными треугольниками — может быть до 0.6.
    if (fillRate < 0.40 || fillRate > 0.62) { N.debug(`[isTrianglePart] "${partName}": НЕТ (fillRate=${(fillRate*100).toFixed(0)}% вне [40-62%], hull=${hull.length}pt, hullArea=${Math.round(hullArea)}, bboxArea=${Math.round(bboxArea)})`); return false; }

    // ───────────────────────────────────────────────────────────
    // ВТОРИЧНАЯ ПРОВЕРКА: 3 доминирующих направления рёбер
    // ───────────────────────────────────────────────────────────
    // Convex hull (убирает tessellated точки дуг, оставляет внешние вершины).
    // Для треугольника с фасками: 6 вершин (по 2 на каждый угол-фаску).
    // Для треугольника без фасок: 3 вершины.
    // v4.29: верхний порог поднят с 12 до 30 — реальный DXF с тесселяцией
    // дуг даёт 15-20 вершин на hull (микро-выпуклости на месте дуг).
    // Микрорёбра всё равно отфильтруются на этапе minEdgeThreshold ниже,
    // кластеризация направлений по-прежнему даст 3 кластера.
    const convexHull = N.computeConvexHull(hull);
    if (convexHull.length < 3 || convexHull.length > 30) { N.debug(`[isTrianglePart] "${partName}": НЕТ (convexHull=${convexHull.length} вершин, вне [3-30], fillRate=${(fillRate*100).toFixed(0)}%)`); return false; }

    // Случай 1: ровно 3 вершины → явный треугольник (без фасок)
    if (convexHull.length === 3) {
        N.debug(`[isTrianglePart] "${partName}": ДА (3 вершины, fillRate=${(fillRate*100).toFixed(0)}%)`);
        return true;
    }

    // Случай 2: 4-12 вершин → проверяем кластеризацию направлений
    // Собираем рёбра: направление (mod 180°) + длина
    // ВАЖНО: фильтруем микрорёбра (< 5мм или < 2% от max) — это tessellation
    // artifacts от дуг/фасок. Без фильтрации они создают лишние кластеры
    // направлений (например, перпендикулярные микрошаги на 90°).
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
    // (основную сторону треугольника). Фаски — короткие.
    // Это отличает треугольник от правильного 6-угольника (все рёбра равны).
    let clustersWithLongEdge = 0;
    for (const c of clusters) {
        if (c.lens.some(l => l > maxEdgeLen * 0.5)) clustersWithLongEdge++;
    }
    if (clustersWithLongEdge < 3) { N.debug(`[isTrianglePart] "${partName}": НЕТ (длинных рёбер в кластерах=${clustersWithLongEdge}/3, maxLen=${maxEdgeLen.toFixed(0)}мм, fillRate=${(fillRate*100).toFixed(0)}%)`); return false; }

    N.debug(`[isTrianglePart] "${partName}": ДА (${convexHull.length} вершин hull, ${clusters.length} направления, fillRate=${(fillRate*100).toFixed(0)}%)`);
    return true;
};

// ════════════════════════════════════════════════════════════════
// v4.30: N.findTriangleApexInfo(part) — возвращает информацию о
// вершине (apex) треугольника в 0° ориентации.
//
// Для interlocking 0°+180° нужно знать:
//   - rightApexX: x самой правой нижней точки (конец правого ребра)
//     → для расчёта ideal-позиции при 0°→180° размещении
//   - leftApexX: x самой левой нижней точки (начало левого ребра)
//     → для расчёта ideal-позиции при 180°→0° размещении
//   - width, height: bbox
//
// Для симметричного равнобедренного треугольника leftApexX ≈ rightApexX
// (одна точка-вершина). Для асимметричного (скошенная вершина с фасками)
// это две разные точки — между ними может быть малый "вырез" или фаска.
// ════════════════════════════════════════════════════════════════
N.findTriangleApexInfo = function findTriangleApexInfo(part) {
    if (!part || !part.bounds) return null;
    const hull = N.getPartBoundingHull(part);
    if (!hull || hull.length < 3) return null;
    const bbox = part.bounds;
    if (!bbox || bbox.width <= 0 || bbox.height <= 0) return null;

    // v4.33 FIX: Находим основание как самое длинное ребро hull.
    //
    // ПРОБЛЕМА (v4.31 и ранее): функция искала точки с минимальным Y
    // и считала их "основанием". Но если треугольник импортирован
    // перевёрнутым (основание вверху, вершина внизу), то minY — это
    // ВЕРШИНА, а не основание. rightApexX получался ≈ W/2 (центр),
    // а не ≈ W (правый край основания) → idealX рассчитывался
    // неправильно → interlocking 0°+180° ломался.
    //
    // v4.33 attempt 1 (поиск maxY) не сработал: hull перевёрнутого
    // треугольника содержит только 1 точку на maxY (угол), а не всё
    // основание.
    //
    // v4.33 attempt 2 (строго горизонтальное ребро) не сработал:
    // основание может быть слегка наклонным (dy=7.6мм на 554мм) из-за
    // дуг на углах — не проходит tolerance=2мм.
    //
    // РЕШЕНИЕ: основание треугольника — самое ДЛИННОЕ ребро hull.
    // У равнобедренного треугольника основание длиннее наклонных
    // (при угле при вершине < 90°). У прямоугольного — основание
    // (гипотенуза) тоже самое длинное. Это работает независимо от
    // ориентации (основание внизу/вверху) и наклона.
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