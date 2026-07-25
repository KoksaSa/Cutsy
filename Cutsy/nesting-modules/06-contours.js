// ════════════════════════════════════════════════════════════════
// SilikinK Nesting Engine — Contour Counting & Pierce Counting (Module 06)
// ════════════════════════════════════════════════════════════════
(function(N) {
    'use strict';
    
N.countContoursFromSegments = function countContoursFromSegments(part) {
    const bbox = part.bounds;
    if (!bbox) return 0;
    const objects = part.objects || [];

    // Собираем line и arc как сегменты с начальной/конечной точками
    const segments = [];
    for (const o of objects) {
        const t = N.getShapeType(o);
        if (t === 'line') {
            segments.push({
                x1: o.x1 - bbox.minX, y1: o.y1 - bbox.minY,
                x2: o.x2 - bbox.minX, y2: o.y2 - bbox.minY
            });
        } else if (t === 'arc') {
            const acx = (o.cx || 0) - bbox.minX;
            const acy = (o.cy || 0) - bbox.minY;
            const r = Math.abs(o.radius || 0);
            if (r <= 0) continue;
            const sa = o.startAngle ?? 0;
            const ea = o.endAngle ?? (2 * Math.PI);
            const { sweep, dir } = N.computeArcSweepDir(sa, ea, o.direction);
            const endAng = sa + dir * sweep;
            segments.push({
                x1: acx + Math.cos(sa) * r, y1: acy + Math.sin(sa) * r,
                x2: acx + Math.cos(endAng) * r, y2: acy + Math.sin(endAng) * r
            });
        }
    }
    if (segments.length < 2) return 0;

    // v3.60: Используем chainLinkSegments вместо inline-копии
    // N.CHAIN_TOLERANCE already defined in module 01
    const { chains } = N.chainLinkSegments(segments, {
        tolerance: N.CHAIN_TOLERANCE,
        includeArcPoints: false  // Только конечные точки для подсчёта контуров
    });

    // Считаем замкнутые цепочки
    let contourCount = 0;
    for (const chain of chains) {
        if (chain.points.length >= 3 && chain.isClosed) {
            contourCount++;
        }
    }
    return contourCount;
}

N.countClosedContours = function countClosedContours(segments) {
    // v3.57: Подсчёт замкнутых контуров из готовых сегментов {x1,y1,x2,y2}.
    // Используется для holeLines (уже нормализованных).
    // v3.60: Рефакторинг — используется chainLinkSegments
    if (!segments || segments.length < 2) return 0;

    // N.CHAIN_TOLERANCE already defined in module 01
    const { chains } = N.chainLinkSegments(segments, {
        tolerance: N.CHAIN_TOLERANCE,
        includeArcPoints: false
    });

    let contourCount = 0;
    for (const chain of chains) {
        if (chain.points.length >= 3 && chain.isClosed) {
            contourCount++;
        }
    }
    return contourCount;
}

N.countPierces = function countPierces(part) {
    // v3.57: Считаем только замкнутые режущие контуры (проколы).
    // Каждый замкнутый контур = 1 прокол лазера.
    // Текст, размеры и отдельные линии НЕ считаются проколами.
    if (!part || !part.objects) return 0;
    let count = 0;
    let hasPolylineContour = false;
    const remainingSegments = []; // line и arc для chain-linking

    for (const obj of part.objects) {
        const t = N.getShapeType(obj);
        if (t === 'circle' || t === 'rect' || t === 'polygon') {
            count++; // Замкнутый контур = 1 прокол
        } else if (t === 'ellipse') {
            count++; // Эллипс — всегда замкнутый контур
        } else if (t === 'path' && obj.d) {
            count++; // SVG path — считаем как замкнутый контур
        } else if (t === 'polyline' || t === 'lwpolyline') {
            // Полилиния: прокол только если она замкнута
            const pts = obj.points || obj.vertices || [];
            if (pts.length >= 3) {
                const closed = obj.closed === true || obj.isClosed === true;
                const first = pts[0];
                const last = pts[pts.length - 1];
                const dist = Math.hypot((first.x || 0) - (last.x || 0), (first.y || 0) - (last.y || 0));
                if (closed || dist < 1.0) {
                    count++;
                    hasPolylineContour = true;
                }
            }
        } else if (t === 'spline') {
            // Сплайн: прокол если замкнутый
            const pts = obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [];
            if (pts.length >= 3) {
                const closed = obj.closed === true || obj.isClosed === true;
                const first = pts[0];
                const last = pts[pts.length - 1];
                const dist = Math.hypot((first.x || 0) - (last.x || 0), (first.y || 0) - (last.y || 0));
                if (closed || dist < 1.0) {
                    count++;
                    hasPolylineContour = true;
                }
            }
        } else if (t === 'arc') {
            // Дуга: прокол если она полная окружность
            const r = Math.abs(obj.radius || 0);
            if (r > 0) {
                // v3.67: Используем N.computeArcSweepDir() вместо ручного вычисления,
                // чтобы правильно обрабатывать нулевые дуги (startAngle≈endAngle)
                const sa = obj.startAngle ?? 0;
                const ea = obj.endAngle ?? (2 * Math.PI);
                const { sweep } = N.computeArcSweepDir(sa, ea, obj.direction);
                // Почти полная окружность (> 350°) = замкнутый контур
                if (sweep > Math.PI * 1.95) {
                    count++;
                } else {
                    // Неполная дуга — возможно часть контура из сегментов
                    remainingSegments.push(obj);
                }
            }
        } else if (t === 'line') {
            // Отдельная линия — возможно часть контура из сегментов
            remainingSegments.push(obj);
        }
        // 'text', 'dimension', 'dim', 'dimLine', 'autoDimension', 'autoSize' — НЕ проколы
    }

    // Для line/arc сегментов: если нет явного polyline-контура,
    // используем extractConcaveOutline — она находит контур даже
    // с микрозазорами в DXF (closed=false, но контур существует).
    if (remainingSegments.length > 0 && !hasPolylineContour) {
        const concaveOutline = N.extractConcaveOutline(part);
        if (concaveOutline && concaveOutline.length >= 3) {
            // Найден внешний контур из line/arc — +1 прокол
            // (даже если не идеально замкнут — DXF может иметь микрозазоры)
            count++;
            // Если есть внутренние контуры из сегментов (отверстия)
            if (part._hasHoles && part._holeLines && part._holeLines.length > 0) {
                const holeSegments = part._holeLines.map(l => ({
                    x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2
                }));
                count += N.countClosedContours(holeSegments);
            }
        } else {
            // Fallback: chain-linking для remaining сегментов
            const contourCount = N.countContoursFromSegments({ objects: remainingSegments, bounds: part.bounds });
            count += contourCount;
        }
    } else if (remainingSegments.length > 0) {
        // Есть polyline-контур, но остались line/arc — возможно отверстия из сегментов
        const contourCount = N.countContoursFromSegments({ objects: remainingSegments, bounds: part.bounds });
        count += contourCount;
    }

    return count;
}
})(window.Nesting = window.Nesting || {});
