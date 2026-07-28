// ════════════════════════════════════════════════════════════════




(function(N) {
    'use strict';
    
N.getPartHullCacheKey = function getPartHullCacheKey(part) {
    const b = part.bounds || {};
    // Включаем хеш объектов с точностью 4 знака для инвалидации при изменении геометрии
    const r4 = v => (v || 0).toFixed(4);
    // v3.65: Используем N.getShapeType() вместо o.type — canvas-классы не имеют .type
    const objHash = (part.objects || []).map(o => {
        const oType = N.getShapeType(o);
        // Для polyline/lwpolyline — хешируем первые и последние точки (чтобы не раздувать ключ)
        if (oType === 'polyline' || oType === 'lwpolyline') {
            const pts = o.points || o.vertices || [];
            const n = pts.length;
            const first = pts[0] || {};
            const last = pts[n - 1] || {};
            return `${oType}:n=${n}:${r4(first.x)}:${r4(first.y)}:${r4(last.x)}:${r4(last.y)}`;
        }
        // Для arc — хешируем ключевые параметры
        if (oType === 'arc') {
            return `${oType}:${r4(o.cx)}:${r4(o.cy)}:${r4(o.radius)}:${r4(o.startAngle)}:${r4(o.endAngle)}:${o.direction}`;
        }
        // v4.36 FIX #46/#18: для circle и polygon используем правильные поля.
        

        

        

        

        if (oType === 'circle') {
            return `${oType}:${r4(o.cx)}:${r4(o.cy)}:${r4(o.radius)}`;
        }
        if (oType === 'polygon') {
            // polygon: cx, cy, radius, sides
            return `${oType}:${r4(o.cx)}:${r4(o.cy)}:${r4(o.radius)}:${o.sides || 0}`;
        }
        // Для rect/line/text — fallback (поля x/y/width/height определены)
        return `${oType}:${r4(o.x)}:${r4(o.y)}:${r4(o.width||o.radius)}:${r4(o.height)}`;
    }).join('|');
    return `${part.id}:${r4(b.width)}:${r4(b.height)}:${r4(b.minX)}:${r4(b.minY)}:${objHash}`;
}

// ─────────────────────────────────────────────────────────────





N.computeConvexHull = function computeConvexHull(points) {
    if (points.length < 3) return points.slice();

    // Находим нижнюю точку (минимальный y, при равенстве — минимальный x)
    let lowest = 0;
    for (let i = 1; i < points.length; i++) {
        if (points[i].y < points[lowest].y ||
            (points[i].y === points[lowest].y && points[i].x < points[lowest].x)) {
            lowest = i;
        }
    }
    const pivot = points[lowest];

    // Сортируем по полярному углу относительно pivot
    const sorted = points.slice().sort((a, b) => {
        const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
        const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
        if (Math.abs(angleA - angleB) > 1e-10) return angleA - angleB;
        // При равных углах — ближняя точка первой
        const distA = (a.x - pivot.x) ** 2 + (a.y - pivot.y) ** 2;
        const distB = (b.x - pivot.x) ** 2 + (b.y - pivot.y) ** 2;
        return distA - distB;
    });

    // Graham Scan
    const hull = [sorted[0], sorted[1]];
    for (let i = 2; i < sorted.length; i++) {
        while (hull.length > 1) {
            const a = hull[hull.length - 2];
            const b = hull[hull.length - 1];
            const c = sorted[i];
            const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
            if (cross <= 0) hull.pop(); // Правый поворот или коллинеарны — убираем
            else break;
        }
        hull.push(sorted[i]);
    }
    return hull;
}

N.extractPartVertices = function extractPartVertices(part) {
    const vertices = [];
    const bbox = part.bounds;
    if (!bbox) return vertices;

    for (const obj of part.objects || []) {
        const objType = N.getShapeType(obj);
        if (objType === 'rect') {
            const x1 = obj.x - bbox.minX, y1 = obj.y - bbox.minY;
            const x2 = x1 + obj.width, y2 = y1 + obj.height;
            vertices.push({ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 });
        } else if (objType === 'polygon') {
            const sides = obj.sides || 6;
            const r = obj.radius || 50;
            const cx = (obj.cx || 0) - bbox.minX;
            const cy = (obj.cy || 0) - bbox.minY;
            const step = (Math.PI * 2) / sides;
            for (let i = 0; i < sides; i++) {
                const ang = step * i - Math.PI / 2;
                vertices.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
            }
        } else if (objType === 'circle') {
            // v3.39: Адаптивное количество сегментов для кругов
            

            const cx = (obj.cx || 0) - bbox.minX;
            const cy = (obj.cy || 0) - bbox.minY;
            const r = obj.radius || 50;
            const segs = Math.max(16, Math.ceil(r * 0.4));
            for (let i = 0; i < segs; i++) {
                const ang = (2 * Math.PI * i) / segs;
                vertices.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
            }
        } else if (objType === 'line') {
            vertices.push({ x: obj.x1 - bbox.minX, y: obj.y1 - bbox.minY });
            vertices.push({ x: obj.x2 - bbox.minX, y: obj.y2 - bbox.minY });
        } else if (objType === 'arc') {
            // v3.39: Адаптивное количество сегментов для дуг
            

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
                for (let i = 0; i <= segs; i++) {
                    const a = sa + d * step * i;
                    vertices.push({ x: acx + Math.cos(a) * r, y: acy + Math.sin(a) * r });
                }
            }
        } else if (objType === 'polyline' || objType === 'lwpolyline') {
            const pts = obj.points || obj.vertices || [];
            pts.forEach(p => vertices.push({ x: p.x - bbox.minX, y: p.y - bbox.minY }));
        } else if (objType === 'spline') {
            // v4.57: Сплайн — используем fitPoints (на кривой), не controlPoints (hull)
            const pts = obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [];
            pts.forEach(p => vertices.push({ x: p.x - bbox.minX, y: p.y - bbox.minY }));
        } else if (objType === 'ellipse') {
            // v4.57: Эллипс — аппроксимируем 36 точками
            const ecx = (obj.cx || 0) - bbox.minX;
            const ecy = (obj.cy || 0) - bbox.minY;
            const rx = Math.abs(obj.rx || 0);
            const ry = Math.abs(obj.ry || 0);
            if (rx > 0 && ry > 0) {
                for (let i = 0; i < 36; i++) {
                    const a = (2 * Math.PI * i) / 36;
                    vertices.push({ x: ecx + Math.cos(a) * rx, y: ecy + Math.sin(a) * ry });
                }
            }
        }
    }
    return vertices;
}

N.extractConcaveOutline = function extractConcaveOutline(part) {
    const bbox = part.bounds;
    if (!bbox) return null;
    const objects = part.objects || [];

    // 1) Проверяем: есть ли замкнутая полилиния?
    for (const obj of objects) {
        const objType = N.getShapeType(obj);
        if (objType === 'polyline' || objType === 'lwpolyline') {
            const pts = (obj.points || obj.vertices || []).map(p => ({ x: p.x - bbox.minX, y: p.y - bbox.minY }));
            if (pts.length >= 3) {
                // v3.67: Проверяем флаги замкнутости — removeDuplicateVertices
                

                

                

                const isClosedByFlag = obj.closed === true || obj.isClosed === true;
                const d = Math.hypot(pts[0].x - pts[pts.length-1].x, pts[0].y - pts[pts.length-1].y);
                // v3.79: Упрощена логика — убран мёртвый код.
                

                // а при isClosedByFlag && d>=eps — return pts был
                

                if (d < N.MERGE_EPS * 2) {
                    // Последняя ≈ первая → удаляем дубликат
                    return pts.slice(0, -1);
                }
                if (isClosedByFlag) {
                    // Замкнута по флагу, но замыкающая вершина уже удалена
                    

                    return pts;
                }
                return pts;
            }
        }
    }

    // 2) Собираем линии и дуги в контур через chain-linking
    

    

    

    

    const segments = [];

    // Линии
    for (const o of objects) {
        if (N.getShapeType(o) === 'line') {
            segments.push({
                type: 'line',
                x1: o.x1 - bbox.minX, y1: o.y1 - bbox.minY,
                x2: o.x2 - bbox.minX, y2: o.y2 - bbox.minY
            });
        }
    }

    // v3.65: Прямоугольники (rect) — преобразуем в 4 линии для chain-linking.
    

    // и для canvas-прямоугольников (из shapes.js) функция возвращала null.
    

    

    

    

    

    

    for (const o of objects) {
        if (N.getShapeType(o) === 'rect') {
            const rx = (o.x || 0) - bbox.minX;
            const ry = (o.y || 0) - bbox.minY;
            const rw = o.width || 0;
            const rh = o.height || 0;
            // 4 стороны прямоугольника (по часовой стрелке)
            segments.push({ type: 'line', x1: rx,      y1: ry,      x2: rx + rw, y2: ry });      // top
            segments.push({ type: 'line', x1: rx + rw, y1: ry,      x2: rx + rw, y2: ry + rh }); // right
            segments.push({ type: 'line', x1: rx + rw, y1: ry + rh, x2: rx,      y2: ry + rh }); // bottom
            segments.push({ type: 'line', x1: rx,      y1: ry + rh, x2: rx,      y2: ry });      // left
        }
    }

    // Дуги — добавляем как сегменты с начальной/конечной точками
    for (const o of objects) {
        const oType = N.getShapeType(o);
        if (oType === 'arc') {
            const acx = (o.cx || 0) - bbox.minX;
            const acy = (o.cy || 0) - bbox.minY;
            const r = Math.abs(o.radius || 0);
            if (r <= 0) continue;

            const sa = o.startAngle ?? 0;
            const ea = o.endAngle ?? (2 * Math.PI);
            const { sweep, dir } = N.computeArcSweepDir(sa, ea, o.direction);

            const sx = acx + Math.cos(sa) * r;
            const sy = acy + Math.sin(sa) * r;
            const endAng = sa + dir * sweep;
            const ex = acx + Math.cos(endAng) * r;
            const ey = acy + Math.sin(endAng) * r;

            // Генерируем промежуточные точки для более точного полигона
            const arcPts = [];
            const arcSegs = N.computeArcSegments(r, sweep, 5); // 5мм шаг для контура
            for (let k = 0; k <= arcSegs; k++) {
                const a = sa + dir * sweep * (k / arcSegs);
                arcPts.push({ x: acx + Math.cos(a) * r, y: acy + Math.sin(a) * r });
            }

            segments.push({
                type: 'arc',
                x1: sx, y1: sy,
                x2: ex, y2: ey,
                _arcPts: arcPts 

            });
        }
    }

    const lines = segments; // для совместимости с кодом ниже
    

    

    const hasArcSegs = segments.some(s => s.type === 'arc');
    if (hasArcSegs ? lines.length < 2 : lines.length < 3) return null;

    // ВАЖНО: Находим ВНЕШНИЙ контур — начинаем с сегмента, максимально
    

    

    const cx = bbox.width / 2;
    const cy = bbox.height / 2;
    let startIdx = 0;
    let maxDist = -1;
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const mx = (l.x1 + l.x2) / 2;
        const my = (l.y1 + l.y2) / 2;
        const dist = Math.hypot(mx - cx, my - cy);
        if (dist > maxDist) {
            maxDist = dist;
            startIdx = i;
        }
    }

    // v3.59: Сборка основного контура через единый chainLinkSegments.
    

    

    

    const { chains: mainChains, usedIndices } = N.chainLinkSegments(lines, {
        includeArcPoints: true,
        maxChains: 1,
        startFrom: startIdx
    });
    const chain = mainChains.length > 0 ? mainChains[0].points : [];
    const used = new Set(usedIndices);

    // Проверяем, что контур покрывает значительную часть bbox.
    

    

    if (chain.length >= 4) {
        const isClosed = Math.hypot(chain[0].x - chain[chain.length-1].x, chain[0].y - chain[chain.length-1].y) < N.CHAIN_TOLERANCE;
        const contourArea = Math.abs(N.polygonArea(isClosed ? chain.slice(0, -1) : chain));
        const bboxArea = bbox.width * bbox.height;
        // v3.67: Guard от деления на ноль для вырожденных деталей (width=0 или height=0)
        if (bboxArea <= 0) return null;
        const coverage = contourArea / bboxArea;
        const unusedSegs = lines.length - used.size;
        const arcCount = lines.filter(l => l.type === 'arc').length;
        const lineCount = lines.length - arcCount;
        // CONCAVE: ${chain.length} pts, coverage=${(coverage*100).toFixed(1)}%

        // v3.43: Если есть неиспользованные сегменты (внутренние отверстия),
        // помечаем деталь флагом _hasHoles для grid-based collision detection.
        

        

        

        

        

        

        if (unusedSegs > 0 && isClosed) {
            // v3.59: Собираем неиспользованные сегменты и пытаемся построить
            

            const uLines = [];
            for (let i = 0; i < lines.length; i++) {
                if (!used.has(i)) uLines.push(lines[i]);
            }

            let isSecondShape = false;
            if (uLines.length >= 3) {
                const { chains: secondChains } = N.chainLinkSegments(uLines, {
                    includeArcPoints: true,
                    maxChains: 1
                });
                const uChain = secondChains.length > 0 ? secondChains[0].points : [];
                // Если второй контур замкнут и его площадь > 50% основного —
                

                if (uChain.length >= 4) {
                    const uClosed = Math.hypot(uChain[0].x - uChain[uChain.length-1].x, uChain[0].y - uChain[uChain.length-1].y) < N.CHAIN_TOLERANCE;
                    const uArea = Math.abs(N.polygonArea(uClosed ? uChain.slice(0, -1) : uChain));
                    const mainArea = Math.abs(N.polygonArea(isClosed ? chain.slice(0, -1) : chain));
                    if (uArea > mainArea * 0.5) {
                        isSecondShape = true;
                        // unused segments form parallel contour → not holes
                    }
                }
            }

            if (!isSecondShape) {
                part._hasHoles = true;
                // inner contours detected → _hasHoles=true

                

                const holeLines = [];
                for (let i = 0; i < lines.length; i++) {
                    if (!used.has(i)) {
                        holeLines.push(lines[i]);
                    }
                }
                if (holeLines.length > 0) {
                    part._holeLines = holeLines;
                }
            }
        }

        // v3.48→v3.52: Проверяем арки и полилинии на внутренние отверстия.
        

        

        

        

        // то дуга — часть контура, НЕ отверстие.
        if (!part._hasHoles && isClosed) {
            const arcObjs = objects.filter(o => N.getShapeType(o) === 'arc');
            const polyObjs = objects.filter(o => N.getShapeType(o) === 'polyline' || N.getShapeType(o) === 'lwpolyline');
            if (arcObjs.length > 0 || polyObjs.length > 0) {
                let innerArcCount = 0;
                for (const arc of arcObjs) {
                    const acx = (arc.cx || 0) - bbox.minX;
                    const acy = (arc.cy || 0) - bbox.minY;
                    // Пропускаем дуги, чьи конечные точки на контуре
                    const sa = arc.startAngle ?? 0;
                    const ea = arc.endAngle ?? (2 * Math.PI);
                    const r = Math.abs(arc.radius || 0);
                    const { sweep, dir } = N.computeArcSweepDir(sa, ea, arc.direction);
                    const endAng = sa + dir * sweep;
                    const startX = acx + Math.cos(sa) * r;
                    const startY = acy + Math.sin(sa) * r;
                    const endX = acx + Math.cos(endAng) * r;
                    const endY = acy + Math.sin(endAng) * r;

                    // Проверяем: обе конечные точки близки к цепочке?
                    let startOnChain = false, endOnChain = false;
                    for (const cp of chain) {
                        if (Math.hypot(startX - cp.x, startY - cp.y) < N.CHAIN_TOLERANCE) { startOnChain = true; }
                        if (Math.hypot(endX - cp.x, endY - cp.y) < N.CHAIN_TOLERANCE) { endOnChain = true; }
                        if (startOnChain && endOnChain) break;
                    }
                    if (startOnChain && endOnChain) continue; // дуга на контуре

                    

                    if (N.isPointInPolygon({ x: acx, y: acy }, chain)) {
                        innerArcCount++;
                    }
                }
                let innerPolyCount = 0;
                for (const poly of polyObjs) {
                    const pts = (poly.points || poly.vertices || []);
                    if (pts.length > 0) {
                        const pcx = pts.reduce((s, p) => s + (p.x || 0), 0) / pts.length - bbox.minX;
                        const pcy = pts.reduce((s, p) => s + (p.y || 0), 0) / pts.length - bbox.minY;
                        if (N.isPointInPolygon({ x: pcx, y: pcy }, chain)) {
                            innerPolyCount++;
                        }
                    }
                }
                if (innerArcCount > 0 || innerPolyCount > 0) {
                    part._hasHoles = true;
                    // inner arcs/polylines detected → _hasHoles=true
                }
            }
        }

        // v3.67: Проверяем circle-объекты на внутренние отверстия.
        

        // а не 'arc'/'polyline', поэтому предыдущая проверка их не находила.
        

        

        

        

        if (isClosed) {
            const circleObjs = objects.filter(o => N.getShapeType(o) === 'circle');
            if (circleObjs.length > 0) {
                let innerCircleCount = 0;
                // v3.68: Собираем внутренние круги для _holeCircles
                

                

                const innerCircles = [];
                for (const circ of circleObjs) {
                    const ccx = (circ.cx || 0) - bbox.minX;
                    const ccy = (circ.cy || 0) - bbox.minY;
                    const cr = Math.abs(circ.radius || 0);
                    // Если центр круга внутри замкнутого контура — это отверстие
                    if (N.isPointInPolygon({ x: ccx, y: ccy }, chain)) {
                        innerCircleCount++;
                        innerCircles.push({ cx: ccx, cy: ccy, r: cr });
                    }
                }
                if (innerCircleCount > 0) {
                    part._hasHoles = true;
                    // v3.68: Сохраняем геометрию круговых отверстий для usedArea
                    if (!part._holeLines || part._holeLines.length === 0) {
                        part._holeCircles = innerCircles;
                    }
                    // inner circles detected → _hasHoles=true
                }
            }
        }

        if (coverage < 0.3) {
            // coverage too low, fallback to convex hull
            return null;
        }
        if (isClosed) return chain.slice(0, -1);
        return chain;
    }

    return null;
}

N.getPartBoundingHull = function getPartBoundingHull(part) {
    const key = N.getPartHullCacheKey(part);
    if (N.partHullCache.has(key)) return N.partHullCache.get(key);

    const { width, height } = part.bounds || { width: 100, height: 100 };

    // v3.39: Для деталей с вогнутостями (Г-образных, с вырезами)
    

    

    const concaveOutline = N.extractConcaveOutline(part);
    const convexVertices = N.extractPartVertices(part);

    let hull;
    const hasArcs = (part.objects || []).some(o => N.getShapeType(o) === 'arc');
    if (concaveOutline && concaveOutline.length >= 4) {
        // Есть вогнутый контур — используем его вместо convex hull.
        hull = concaveOutline;
        const simplified = [hull[0]];
        for (let i = 1; i < hull.length; i++) {
            const prev = simplified[simplified.length - 1];
            const next = hull[(i + 1) % hull.length];
            const cross = (hull[i].x - prev.x) * (next.y - prev.y) - (hull[i].y - prev.y) * (next.x - prev.x);
            if (Math.abs(cross) > N.EPS * 10) {
                simplified.push(hull[i]);
            }
        }
        if (simplified.length >= 3) hull = simplified;
        // HULL: concave outline, ${hull.length} pts
    } else if (convexVertices.length >= 3) {
        hull = N.computeConvexHull(convexVertices);
        // Для деталей с дугами НЕ заменяем hull на bbox
        if (!hasArcs) {
            const hullArea = N.polygonArea(hull);
            const bboxArea = width * height;
            if (hullArea / bboxArea > 0.92) {
                hull = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
                // HULL: bbox (92% fallback)
            } else {
                // HULL: convex hull ${hull.length} pts
            }
        } else {
            // HULL: convex hull (arc part)
        }
    } else {
        // Мало вершин — используем bbox
        hull = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
        // HULL: bbox (few vertices)
    }

    N.partHullCache.set(key, hull);
    return hull;
}

N.getPartPolygons = function getPartPolygons(part) {
    const polygons = [];
    const bbox = part.bounds;
    const circles = [], rects = [], polys = [];

    // v3.58: Собираем линии и дуги как сегменты для chain-linking
    

    

    const segments = [];

    for (const obj of part.objects || []) {
        const objType = N.getShapeType(obj);
        // v3.67: Добавлены || 0 guards — как в N.extractPartVertices(),
        // иначе undefined свойства дают NaN в координатах.
        if (objType === 'circle') {
            circles.push({ cx: (obj.cx || 0) - bbox.minX, cy: (obj.cy || 0) - bbox.minY, radius: obj.radius || 0 });
        } else if (objType === 'line') {
            // v4.50: Фильтруем нулевые линии (start ≈ end) — они ломают chain-linking
            const lx1 = (obj.x1 || 0) - bbox.minX, ly1 = (obj.y1 || 0) - bbox.minY;
            const lx2 = (obj.x2 || 0) - bbox.minX, ly2 = (obj.y2 || 0) - bbox.minY;
            if (Math.hypot(lx2 - lx1, ly2 - ly1) > 0.01) {
                segments.push({ type: 'line', x1: lx1, y1: ly1, x2: lx2, y2: ly2 });
            }
        } else if (objType === 'rect') {
            const x1 = (obj.x || 0) - bbox.minX, y1 = (obj.y || 0) - bbox.minY;
            const rw = obj.width || 0, rh = obj.height || 0;
            rects.push({ x1, y1, x2: x1 + rw, y2: y1 + rh });
            // v3.67: Добавляем рёбра rect как line-сегменты для chain-linking,
            // как в N.extractConcaveOutline(). Без этого rect+line+arc детали
            

            

            segments.push({ type: 'line', x1: x1, y1: y1, x2: x1 + rw, y2: y1, _isRectEdge: true });
            segments.push({ type: 'line', x1: x1 + rw, y1: y1, x2: x1 + rw, y2: y1 + rh, _isRectEdge: true });
            segments.push({ type: 'line', x1: x1 + rw, y1: y1 + rh, x2: x1, y2: y1 + rh, _isRectEdge: true });
            segments.push({ type: 'line', x1: x1, y1: y1 + rh, x2: x1, y2: y1, _isRectEdge: true });
        } else if (objType === 'polygon') {
            const v = [];
            const sides = obj.sides || 6;
            const r = obj.radius || 50;
            const cx = (obj.cx || 0) - bbox.minX;
            const cy = (obj.cy || 0) - bbox.minY;
            const step = (Math.PI * 2) / sides;
            for (let i = 0; i < sides; i++) {
                const ang = step * i - Math.PI / 2;
                v.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
            }
            polys.push(v);
        } else if (objType === 'arc') {
            const acx = (obj.cx || 0) - bbox.minX;
            const acy = (obj.cy || 0) - bbox.minY;
            const r = Math.abs(obj.radius || 0);
            if (r > 0) {
                const sa = obj.startAngle ?? 0;
                const ea = obj.endAngle ?? (2 * Math.PI);
                const { sweep, dir } = N.computeArcSweepDir(sa, ea, obj.direction);
                const endAng = sa + dir * sweep;
                const sx = acx + Math.cos(sa) * r;
                const sy = acy + Math.sin(sa) * r;
                const ex = acx + Math.cos(endAng) * r;
                const ey = acy + Math.sin(endAng) * r;

                // Промежуточные точки дуги
                const arcSegs = N.safeArcSegments(sweep, r, 0.5);
                const arcPts = [];
                const arcStep = sweep / arcSegs;
                for (let k = 0; k <= arcSegs; k++) {
                    const a = sa + dir * arcStep * k;
                    arcPts.push({ x: acx + Math.cos(a) * r, y: acy + Math.sin(a) * r });
                }

                segments.push({
                    type: 'arc',
                    x1: sx, y1: sy, x2: ex, y2: ey,
                    _arcPts: arcPts
                });
            }
        } else if (objType === 'polyline' || objType === 'lwpolyline') {
            const pts = (obj.points || obj.vertices || []).map(p => ({ x: p.x - bbox.minX, y: p.y - bbox.minY }));
            // v3.67: Для замкнутых полилиний добавляем замыкающий сегмент
            

            

            if (pts.length >= 2) {
                const isClosedPoly = obj.closed === true || obj.isClosed === true;
                if (isClosedPoly && pts.length >= 3) {
                    // Добавляем замыкающую точку (копию первой), чтобы
                    

                    const d = Math.hypot(pts[0].x - pts[pts.length-1].x, pts[0].y - pts[pts.length-1].y);
                    if (d > N.MERGE_EPS * 2) {
                        pts.push({ x: pts[0].x, y: pts[0].y });
                    }
                }
                polys.push(pts);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    

    

    

    

    if (segments.length > 0) {
        const { chains: segChains, usedIndices } = N.chainLinkSegments(segments, {
            tolerance: Math.max(N.MERGE_EPS * 2, 2.0),  // v4.50: 2мм для лучшего chain-linking дуг с линиями
            includeArcPoints: true,
            maxChains: Infinity
        });
        for (const ch of segChains) {
            if (ch.points.length >= 2) {
                polygons.push(ch.points);
            }
        }
    }

    // v3.67: Rect-рёбра уже добавлены в segments[] для chain-linking.
    

    // chain-linking уже объединил rect-рёбра с другими сегментами
    

    

    // поэтому добавляем rect-полигон явно.
    const rectEdgesInSegments = rects.length > 0 && segments.some(s => s._isRectEdge);
    if (!rectEdgesInSegments) {
        rects.forEach(r => polygons.push([
            { x: r.x1, y: r.y1 }, { x: r.x2, y: r.y1 },
            { x: r.x2, y: r.y2 }, { x: r.x1, y: r.y2 }
        ]));
    }
    polys.forEach(p => polygons.push(p));

    if (segments.length === 0 && !rects.length && !polys.length && circles.length) {
        polygons.push([
            { x: 0, y: 0 }, { x: bbox.width, y: 0 },
            { x: bbox.width, y: bbox.height }, { x: 0, y: bbox.height }
        ]);
    }

    circles.forEach(c => {
        const segs = Math.max(16, Math.ceil(c.radius * 0.4)), ring = [];
        for (let i = 0; i < segs; i++) {
            const ang = (2 * Math.PI * i) / segs;
            ring.push({ x: c.cx + Math.cos(ang) * c.radius, y: c.cy + Math.sin(ang) * c.radius });
        }
        polygons.push(ring);
    });

    return polygons;
}
})(window.Nesting = window.Nesting || {});