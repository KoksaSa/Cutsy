// ════════════════════════════════════════════════════════════════




(function(N) {
    'use strict';
    
N.almostEqual = function almostEqual(a, b, eps = N.EPS) {
    return Math.abs(a - b) < eps;
}

N.almostZero = function almostZero(a, eps = N.EPS) {
    return Math.abs(a) < eps;
}

/**
 * Вычислить sweep и нормализованный direction для дуги.
 * Устраняет дублирование парсинга 'CW'/'CCW'/1/-1/undefined.
 * @param {number} startAngle
 * @param {number} endAngle
 * @param {number|string|undefined} direction — 'CW', 'CCW', 1, -1, undefined
 * @returns {{sweep: number, dir: number}} — sweep > 0, dir ∈ {1, -1}
 */
N.computeArcSweepDir = function computeArcSweepDir(startAngle, endAngle, direction) {
    let dir;
    if (direction === 'CW') dir = -1;
    else if (direction === 'CCW') dir = 1;
    else dir = direction !== undefined ? (direction >= 0 ? 1 : -1) : 1;

    let sweep;
    // v3.67: Различаем полную окружность (start≈end по DXF-конвенции)
    // от вырожденной нулевой дуги (точки). Раньше любая дуга с
    // startAngle≈endAngle превращалась в полный круг (sweep=2π),
    // что добавляло ложные вершины в hull и счетчик проколов.
    if (dir >= 0) {
        sweep = endAngle - startAngle;
        if (sweep <= 0) {
            if (N.almostEqual(startAngle, endAngle, N.EPS)) {
                // DXF-конвенция: start=end означает полный круг
                sweep = 2 * Math.PI;
            } else {
                sweep += 2 * Math.PI;
            }
        }
    } else {
        sweep = startAngle - endAngle;
        if (sweep <= 0) {
            if (N.almostEqual(startAngle, endAngle, N.EPS)) {
                sweep = 2 * Math.PI;
            } else {
                sweep += 2 * Math.PI;
            }
        }
    }

    return { sweep, dir };
}

N.polygonArea = function polygonArea(polygon) {
    if (polygon.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        area += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
    }
    return Math.abs(area / 2);
}

N.getBoundingBox = function getBoundingBox(polygon) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of polygon) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// Кешированный bounding box — WeakMap привязан к ссылке объекта.



N.getCachedBoundingBox = function getCachedBoundingBox(poly) {
    let box = N.polygonBBoxCache.get(poly);
    if (!box) {
        box = N.getBoundingBox(poly);
        N.polygonBBoxCache.set(poly, box);
    }
    return box;
}

N.rotatePoint = function rotatePoint(x, y, angle, cx, cy) {
    if (angle === 0) return { x, y };
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const dx = x - cx, dy = y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

N.rotatePolygon = function rotatePolygon(polygon, angle, cx, cy) {
    if (angle === 0) return polygon.map(p => ({ ...p }));
    return polygon.map(p => N.rotatePoint(p.x, p.y, angle, cx, cy));
}

N.translatePolygon = function translatePolygon(polygon, dx, dy) {
    return polygon.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

N.segmentsIntersect = function segmentsIntersect(a1, a2, b1, b2) {
    const ccw = (a, b, c) => {
        const v = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
        return Math.abs(v) < 0.0001 ? 0 : (v > 0 ? 1 : -1);
    };
    const d1 = ccw(b1, b2, a1), d2 = ccw(b1, b2, a2);
    const d3 = ccw(a1, a2, b1), d4 = ccw(a1, a2, b2);

    // Строгая проверка пересечения (концы разных сторон)
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;

    // Коллинеарная проверка: сегменты на одной линии
    if (d1 === 0 && N.onSegment(b1, a1, b2)) return true;
    if (d2 === 0 && N.onSegment(b1, a2, b2)) return true;
    if (d3 === 0 && N.onSegment(a1, b1, a2)) return true;
    if (d4 === 0 && N.onSegment(a1, b2, a2)) return true;

    return false;
}

// Вспомогательная функция: точка q на отрезке pr?
N.onSegment = function onSegment(p, q, r) {
    return q.x <= Math.max(p.x, r.x) + 0.0001 && q.x >= Math.min(p.x, r.x) - 0.0001 &&
           q.y <= Math.max(p.y, r.y) + 0.0001 && q.y >= Math.min(p.y, r.y) - 0.0001;
}

N.isPointInPolygon = function isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
            (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
            inside = !inside;
        }
    }
    return inside;
}

// v3.49: Compute arc segment count based on chord tolerance.






// New formula: chord tolerance 0.5mm (same as extractPartVertices), capped at 360.
N.computeArcSegments = function computeArcSegments(r, sweep, gridSize) {
    const tolerance = 0.5; // мм — допустимая погрешность хорды
    let segs;
    if (r > tolerance) {
        const acosArg = 1 - tolerance / r;
        if (acosArg >= -1 && acosArg <= 1) {
            segs = Math.ceil(sweep / Math.acos(acosArg));
        } else {
            segs = 12;
        }
    } else {
        segs = 12;
    }
    return Math.max(12, Math.min(segs, 360));
}

// FIX: Безопасное вычисление сегментов дуги — предотвращает NaN




N.safeArcSegments = function safeArcSegments(sweep, r, tolerance = 0.5) {
    if (r <= tolerance) return 16; // Слишком малый радиус — минимальное кол-во сегментов
    const acosArg = Math.max(-1, Math.min(1, 1 - tolerance / r));
    const segs = Math.ceil(sweep / Math.acos(acosArg));
    return Math.max(16, Math.min(segs, 360));
}

N.pointToSegmentDistance = function pointToSegmentDistance(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ─────────────────────────────────────────────────────────────




//   - N.extractConcaveOutline (основной контур)












// Опции:
//   tolerance          — порог соединения концов (default N.CHAIN_TOLERANCE)




















// Возвращает: { chains, usedIndices }
//   chains       — Array<{ points: [{x,y},...], isClosed }>
//   usedIndices  — Array<number> индексов сегментов, вошедших в цепочки.




N.chainLinkSegments = function chainLinkSegments(segments, options = {}) {
    if (!segments || segments.length === 0) {
        return { chains: [], usedIndices: [] };
    }
    const {
        tolerance = N.CHAIN_TOLERANCE,
        includeArcPoints = false,
        maxChains = Infinity,
        startFrom = null
    } = options;
    const used = new Set();
    const chains = [];

    while (used.size < segments.length && chains.length < maxChains) {
        // Стартовый сегмент: первая цепочка может использовать startFrom,
        // все последующие — первый попавшийся неиспользованный.
        let startIdx = -1;
        if (chains.length === 0 && startFrom !== null &&
            startFrom >= 0 && startFrom < segments.length &&
            !used.has(startFrom)) {
            startIdx = startFrom;
        } else {
            for (let i = 0; i < segments.length; i++) {
                if (!used.has(i)) { startIdx = i; break; }
            }
        }
        if (startIdx < 0) break;

        const startSeg = segments[startIdx];
        const chain = [{ x: startSeg.x1, y: startSeg.y1 }];
        const hasArcPts = includeArcPoints &&
                          startSeg._arcPts &&
                          startSeg._arcPts.length > 2;

        // Если первый сегмент — дуга с промежуточными точками, кладём их.
        

        if (hasArcPts) {
            for (let k = 1; k < startSeg._arcPts.length; k++) {
                chain.push({ x: startSeg._arcPts[k].x, y: startSeg._arcPts[k].y });
            }
        }
        let current = { x: startSeg.x2, y: startSeg.y2 };
        used.add(startIdx);
        if (!hasArcPts) {
            chain.push({ x: current.x, y: current.y });
        }

        // Ищем следующий сегмент, конец которого рядом с current
        let maxIter = segments.length * 2;
        while (used.size < segments.length && maxIter-- > 0) {
            let found = false;
            for (let i = 0; i < segments.length; i++) {
                if (used.has(i)) continue;
                const l = segments[i];
                const arcPts = includeArcPoints && l._arcPts && l._arcPts.length > 2
                    ? l._arcPts : null;

                if (Math.hypot(current.x - l.x1, current.y - l.y1) < tolerance) {
                    if (arcPts) {
                        for (let k = 1; k < arcPts.length; k++) {
                            chain.push({ x: arcPts[k].x, y: arcPts[k].y });
                        }
                    } else {
                        chain.push({ x: l.x2, y: l.y2 });
                    }
                    current = { x: l.x2, y: l.y2 };
                    used.add(i);
                    found = true;
                    break;
                }
                if (Math.hypot(current.x - l.x2, current.y - l.y2) < tolerance) {
                    if (arcPts) {
                        // Обратный обход — от предпоследней к нулевой
                        for (let k = arcPts.length - 2; k >= 0; k--) {
                            chain.push({ x: arcPts[k].x, y: arcPts[k].y });
                        }
                    } else {
                        chain.push({ x: l.x1, y: l.y1 });
                    }
                    current = { x: l.x1, y: l.y1 };
                    used.add(i);
                    found = true;
                    break;
                }
            }
            if (!found) break;
        }

        const isClosed = chain.length >= 2 && Math.hypot(
            chain[0].x - chain[chain.length - 1].x,
            chain[0].y - chain[chain.length - 1].y
        ) < tolerance;
        chains.push({ points: chain, isClosed });
    }

    return { chains, usedIndices: [...used] };
}

// ─────────────────────────────────────────────────────────────






//            false = возможно пересекаются (нужна точная проверка).


N.satDisjoint = function satDisjoint(poly1, poly2, gap = 0) {
    // Проверяем оси от обоих полигонов
    for (const poly of [poly1, poly2]) {
        for (let i = 0; i < poly.length; i++) {
            const j = (i + 1) % poly.length;
            // Нормаль к ребру (перпендикуляр)
            const nx = -(poly[j].y - poly[i].y);
            const ny = poly[j].x - poly[i].x;
            if (N.almostZero(nx) && N.almostZero(ny)) continue;
            // Проецируем оба полигона на ось
            let min1 = Infinity, max1 = -Infinity;
            for (const p of poly1) { const d = p.x * nx + p.y * ny; min1 = Math.min(min1, d); max1 = Math.max(max1, d); }
            let min2 = Infinity, max2 = -Infinity;
            for (const p of poly2) { const d = p.x * nx + p.y * ny; min2 = Math.min(min2, d); max2 = Math.max(max2, d); }
            // С учётом gap: projection overlap < gap → disjoint
            const overlap = Math.min(max1, max2) - Math.max(min1, min2);
            if (overlap < -gap) return true; // Разделяющая ось найдена
        }
    }
    return false; // Разделяющая ось не найдена — возможно пересечение
}

// БАГ 4 FIX: оптимизированный gap-чек — быстрый путь для непересекающихся bbox


N.polygonsIntersect = function polygonsIntersect(poly1, poly2, minGap = 3) {
    const b1 = N.getCachedBoundingBox(poly1);
    const b2 = N.getCachedBoundingBox(poly2);
    const gap = Math.max(0, minGap);

    // Быстрый отсев по bounding box (с учётом gap)
    if (b1.maxX + gap <= b2.minX || b2.maxX + gap <= b1.minX ||
        b1.maxY + gap <= b2.minY || b2.maxY + gap <= b1.minY) {
        return false;
    }

    // v3.39: SAT — быстрый отсев для выпуклых полигонов.
    

    if (poly1.length <= 8 && poly2.length <= 8) {
        if (N.satDisjoint(poly1, poly2, gap)) return false;
    }

    // ═══════════════════════════════════════════════════════════
    

    // но глубина проникновения не должна превышать -minGap.
    

    

    

    if (minGap < 0) {
        // Проверяем пересечение рёбер
        let edgesCross = false;
        for (let i = 0; i < poly1.length; i++) {
            const a1 = poly1[i], a2 = poly1[(i + 1) % poly1.length];
            for (let j = 0; j < poly2.length; j++) {
                if (N.segmentsIntersect(a1, a2, poly2[j], poly2[(j + 1) % poly2.length])) {
                    edgesCross = true;
                    break;
                }
            }
            if (edgesCross) break;
        }

        // Проверяем вложенность вершин
        let hasContainment = false;
        if (!edgesCross) {
            for (const p of poly1) {
                if (N.isPointInPolygon(p, poly2)) { hasContainment = true; break; }
            }
            if (!hasContainment) {
                for (const p of poly2) {
                    if (N.isPointInPolygon(p, poly1)) { hasContainment = true; break; }
                }
            }
        }

        // Если нет пересечения — полигоны не мешают друг другу
        if (!edgesCross && !hasContainment) return false;

        // Есть пересечение/вложенность — проверяем глубину через SAT.
        

        

        

        

        //   overlap < -minGap → разделяющая ось → нет значительного проникновения → false
        

        

        

        const maxOverlap = -minGap; // допустимая глубина проникновения в мм

        if (poly1.length <= 8 && poly2.length <= 8) {
            // SAT для выпуклых — если SAT не нашёл разделяющую ось
            

            if (!N.satDisjoint(poly1, poly2, minGap)) return true;
            return false;
        }

        // Для невыпуклых — вычисляем минимальное vertex-to-edge расстояние
        

        

        const [outer, inner] = poly1.length <= poly2.length ? [poly1, poly2] : [poly2, poly1];
        for (let i = 0; i < outer.length; i++) {
            // Проверяем только внутренние вершины
            if (!N.isPointInPolygon(outer[i], inner)) continue;
            for (let j = 0; j < inner.length; j++) {
                const b = inner[j], b2p = inner[(j + 1) % inner.length];
                const dist = N.pointToSegmentDistance(outer[i], b, b2p);
                // dist — расстояние от внутренней вершины до ребра.
                

                if (dist > maxOverlap) return true;
            }
        }
        // Все проникновения в пределах допустимого
        return false;
    }

    // ═══════════════════════════════════════════════════════════
    

    


    

    for (let i = 0; i < poly1.length; i++) {
        const a1 = poly1[i], a2 = poly1[(i + 1) % poly1.length];
        for (let j = 0; j < poly2.length; j++) {
            if (N.segmentsIntersect(a1, a2, poly2[j], poly2[(j + 1) % poly2.length])) return true;
        }
    }

    // FIX #4: проверяем ВСЕ вершины, а не только центроид.
    for (const p of poly1) {
        if (N.isPointInPolygon(p, poly2)) return true;
    }
    for (const p of poly2) {
        if (N.isPointInPolygon(p, poly1)) return true;
    }

    // Gap violation — ОПТИМИЗАЦИЯ: быстрый путь через bbox расстояние
    if (minGap > 0) {
        const overlapX = Math.min(b1.maxX, b2.maxX) - Math.max(b1.minX, b2.minX);
        const overlapY = Math.min(b1.maxY, b2.maxY) - Math.max(b1.minY, b2.minY);

        if (overlapX <= 0 || overlapY <= 0) {
            const bboxGapX = overlapX <= 0 ? -overlapX : 0;
            const bboxGapY = overlapY <= 0 ? -overlapY : 0;
            const bboxGap = Math.sqrt(bboxGapX * bboxGapX + bboxGapY * bboxGapY);
            if (bboxGap >= minGap * 1.5) return false;
        }

        if (poly1.length <= 8 && poly2.length <= 8) {
            if (N.satDisjoint(poly1, poly2, minGap)) return false;
        }

        // v3.67: Проверяем gap в ОБЕИХ направлениях — вершины poly1
        

        

        

        

        for (let i = 0; i < poly1.length; i++) {
            for (let j = 0; j < poly2.length; j++) {
                const b = poly2[j], b2p = poly2[(j + 1) % poly2.length];
                if (N.pointToSegmentDistance(poly1[i], b, b2p) < minGap) return true;
            }
        }
        for (let i = 0; i < poly2.length; i++) {
            for (let j = 0; j < poly1.length; j++) {
                const b = poly1[j], b2p = poly1[(j + 1) % poly1.length];
                if (N.pointToSegmentDistance(poly2[i], b, b2p) < minGap) return true;
            }
        }
    }
    return false;
}
})(window.Nesting = window.Nesting || {});
