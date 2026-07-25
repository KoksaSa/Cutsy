// ════════════════════════════════════════════════════════════════
// SilikinK Nesting Engine — Sheet Optimizer & Compaction (Module 16)
// ════════════════════════════════════════════════════════════════
(function(N) {
    'use strict';
    
N.findOptimalSheet = function findOptimalSheet(partsToPlace) {
    if (!partsToPlace.length || typeof STANDARD_SHEETS === 'undefined') return null;
    const totalArea = partsToPlace.reduce((s, p) => s + (p.bounds.width * p.bounds.height * p.quantity), 0);
    const results = [];
    for (const sheet of STANDARD_SHEETS) {
        const area = sheet.width * sheet.height;
        const util = totalArea / area * 100;
        if (util <= 85) results.push({ sheet, waste: 100 - util });
    }
    results.sort((a, b) => a.waste - b.waste);
    if (!results.length) return null;
    const best = results[0];
    const totalQty = partsToPlace.reduce((s, p) => s + p.quantity, 0);
    return {
        sheet: best.sheet,
        utilization: (totalArea / (best.sheet.width * best.sheet.height) * 100),
        waste: best.waste,
        allPlaced: true,
        placed: totalQty,
        totalNeeded: totalQty
    };
}

N.compactNesting = function compactNesting(nestedParts, placedPolygons, sheetWidth, sheetHeight, minGap, edgeGap) {
    if (nestedParts.length <= 1) return { moved: 0 };

    // v3.58: GAP может быть отрицательным — для перекрытия bbox деталей.
    // Материал защищён через polygonsIntersect/gridsOverlap с Math.max(0, gap).
    const GAP = minGap;
    // EDGE всегда ≥ 0 — чтобы детали не выходили за край листа
    const EDGE = Math.max(edgeGap || GAP, 0);
    let totalMoved = 0;
    let fineMoved = 0;
    const compactStart = performance.now();

    // v3.35/v3.50: Вспомогательная функция для per-pair gap —
    // учитываем spacing каждой из двух деталей НЕЗАВИСИМО.
    // GAP используется только как fallback (когда spacing не задан).
    // v3.44: Если ОБЕ детали одного типа и у обеих oneCutEnabled=true,
    // используем gap=0 (в один рез). Иначе — максимум из их spacing.
    // v3.50: Убран Math.max(GAP, ...) — GAP больше не перекрывает per-part spacing.
    function getPairGap(i, j) {
        const n1 = nestedParts[i];
        const n2 = nestedParts[j];
        // «В один рез» — оба одной детали И обе с oneCutEnabled
        if (n1?.oneCutEnabled && n2?.oneCutEnabled && n1?.partId === n2?.partId) {
            return 0;
        }
        const sp1 = typeof n1?.spacing === 'number' ? n1.spacing : GAP;
        const sp2 = typeof n2?.spacing === 'number' ? n2.spacing : GAP;
        // v3.58: Убран minVisibleGap = 1 — отрицательный spacing теперь разрешён.
        // Защита материала (нельзя резать материал) обеспечивается
        // polygonsIntersect/gridsOverlap с Math.max(0, pairGap).
        // Fallback на GAP для деталей без spacing
        const pairGap = Math.max(sp1, sp2);
        return pairGap;
    }

    // Сортируем детали по позиции: сначала самые левые-нижние (они не двигаются)
    const order = nestedParts.map((n, i) => ({
        idx: i,
        sortKey: (n.y || 0) * sheetWidth + (n.x || 0)
    })).sort((a, b) => a.sortKey - b.sortKey);

    // Вспомогательная функция: пытаемся сдвинуть деталь на step в направлении
    function tryMoveStep(idx, axis, delta, step) {
        const nested = nestedParts[idx];
        const placed = placedPolygons[idx];
        if (!nested || !placed) return false;

        const newVal = nested[axis] + delta * step;
        const limit = EDGE;

        // Не выходить за край листа
        if (newVal < limit) return false;
        // Не выходить за противоположный край
        if (axis === 'x' && newVal + (nested.width || 0) > sheetWidth - EDGE) return false;
        if (axis === 'y' && newVal + (nested.height || 0) > sheetHeight - EDGE) return false;

        // Проверяем пересечения со всеми РАНЕЕ размещёнными деталями
        for (let j = 0; j < placedPolygons.length; j++) {
            if (j === idx) continue;
            const other = placedPolygons[j];

            // v3.35: Per-pair gap — учитываем spacing обеих деталей
            const pairGap = getPairGap(idx, j);

            // Быстрый отсев по bbox
            const pw = nested.width || 0, ph = nested.height || 0;
            const ow = other.width || other.bboxWidth || 0, oh = other.height || other.bboxHeight || 0;
            const nx = axis === 'x' ? newVal : nested.x;
            const ny = axis === 'y' ? newVal : nested.y;

            if (nx + pw + pairGap <= other.x || other.x + ow + pairGap <= nx ||
                ny + ph + pairGap <= other.y || other.y + oh + pairGap <= ny) continue;

            // ═══════════════════════════════════════════════════
            // v4.22: ПРЯМАЯ ПРОВЕРКА BBOX-ЗАЗОРА
            // polygonsIntersect(A, B, gap) проверяет только реальное
            // ПЕРЕСЕЧЕНИЕ полигонов, а не БЛИЗОСТЬ. Два прямоугольника
            // на расстоянии 5мм с pairGap=10мм — polygonsIntersect
            // вернёт false (нет пересечения), и деталь сдвинется.
            // Вычисляем минимальный bbox-зазор: если < pairGap → блокируем.
            // ═══════════════════════════════════════════════════
            {
                const gapRight = other.x - (nx + pw);   // other правее
                const gapLeft = nx - (other.x + ow);     // other левее
                const gapDown = other.y - (ny + ph);     // other ниже
                const gapUp = ny - (other.y + oh);       // other выше
                const hGap = Math.max(gapRight, gapLeft, 0);  // горизонтальный зазор
                const vGap = Math.max(gapDown, gapUp, 0);     // вертикальный зазор
                // Минимальное расстояние между bbox:
                // Если оба > 0 — диагональные соседи (sqrt)
                // Если один = 0 — соседи по одной оси (max)
                const minBboxGap = (hGap > 0 && vGap > 0)
                    ? Math.sqrt(hGap * hGap + vGap * vGap)
                    : Math.max(hGap, vGap);
                if (minBboxGap < pairGap) return false;  // Слишком близко!
            }

            // Детальная проверка через hull
            const testHull = N.translatePolygon(placed.positionedHull,
                axis === 'x' ? delta * step : 0,
                axis === 'y' ? delta * step : 0);

            // v3.6: Для криволинейных деталей — grid-проверка
            // v3.44: Также для деталей с отверстиями (_hasHoles)
            // ВАЖНО: _hasHoles проверяем и на part, и на nestedParts entry
            const nestedPart = placed.part || null;
            const otherPart = other.part || null;
            // v3.44: Проверяем _hasHoles из nestedParts entry (т.к. part._hasHoles
            // может быть уже удалён), а также из part (если ещё жив)
            const nestedHasHoles = nestedParts[idx]?._hasHoles === true || (nestedPart && nestedPart._hasHoles === true);
            const otherIdx = placedPolygons.indexOf(other);
            const otherHasHoles = (otherIdx >= 0 && nestedParts[otherIdx]?._hasHoles === true) || (otherPart && otherPart._hasHoles === true);
            const nestedIsLH = nestedPart && (N.isLineHeavyPart(nestedPart) || nestedHasHoles);
            const otherIsLH = otherPart && (N.isLineHeavyPart(otherPart) || otherHasHoles);

            if (nestedIsLH && otherIsLH) {
                // Grid-based: проверяем реальное перекрытие материала
                // v3.7: передаём углы поворота для корректного отображения grid
                const nestedAngleDeg = Math.round((placed.angle || 0) * 180 / Math.PI) % 360;
                const otherAngleDeg = Math.round((other.angle || 0) * 180 / Math.PI) % 360;
                if (N.gridsOverlap(nestedPart, nx, ny, pw, ph, nestedAngleDeg,
                    otherPart, other.x, other.y, ow, oh, otherAngleDeg, pairGap)) return false;
            } else if (other.positionedHull?.length) {
                if (N.polygonsIntersect(testHull, other.positionedHull, pairGap)) {
                    // Hull показал перекрытие, но если одна деталь кривая —
                    // перепроверяем через grid
                    if (nestedIsLH || otherIsLH) {
                        // FIX #12: Всегда передаём nestedPart как part1, otherPart как part2.
                        // Аналогичный баг — когда только одна деталь line-heavy,
                        // обе переменные ссылались на одну деталь.
                        const nestedAngleDeg2 = Math.round((placed.angle || 0) * 180 / Math.PI) % 360;
                        const otherAngleDeg2 = Math.round((other.angle || 0) * 180 / Math.PI) % 360;
                        if (N.gridsOverlap(nestedPart, nx, ny, pw, ph, nestedAngleDeg2,
                            otherPart, other.x, other.y, ow, oh, otherAngleDeg2, pairGap)) return false;
                    } else {
                        return false;
                    }
                }
            } else if (nx < other.x + ow + pairGap && nx + pw + pairGap > other.x &&
                       ny < other.y + oh + pairGap && ny + ph + pairGap > other.y) {
                return false;
            }
        }

        // Можно двигать — применяем сдвиг
        const dx = axis === 'x' ? delta * step : 0;
        const dy = axis === 'y' ? delta * step : 0;

        nested.x += dx;
        nested.y += dy;
        placed.x += dx;
        placed.y += dy;

        if (placed.positionedHull) {
            placed.positionedHull = N.translatePolygon(placed.positionedHull, dx, dy);
        }
        if (nested.polygon) {
            nested.polygon = N.translatePolygon(nested.polygon, dx, dy);
        }

        return true;
    }

    // ═══════════════════════════════════════════════════
    // ФАЗА 1: Грубая компакция (шаг = 5мм, не зависит от GAP)
    // FIX v3.50: Раньше шаг = GAP (до 10-20мм), что было слишком
    // грубо для деталей с меньшим spacing. Теперь фиксированный 5мм.
    // ═══════════════════════════════════════════════════
    const coarseStep = 5;
    const directions = [
        { axis: 'x', delta: -1 },
        { axis: 'y', delta: -1 }
    ];

    for (const { idx } of order) {
        for (const { axis, delta } of directions) {
            while (tryMoveStep(idx, axis, delta, coarseStep)) {
                totalMoved++;
            }
        }
    }

    // ═══════════════════════════════════════════════════
    // ФАЗА 2: Точная компакция (шаг = 1) — выжимаем последние пиксели
    // ═══════════════════════════════════════════════════
    for (const { idx } of order) {
        for (const { axis, delta } of directions) {
            while (tryMoveStep(idx, axis, delta, 1)) {
                fineMoved++;
                totalMoved++;
            }
        }
    }

    // ═══════════════════════════════════════════════════
    // FIX #9: ФАЗА 3 — Second pass compaction
    // Идём СПРАВА НАЛЕВО и СНИЗУ ВВЕРХ — детали,
    // которые были «заперты» правыми/нижними соседями
    // при проходе слева-направо, теперь могут сдвинуться.
    // Обычно даёт +2-7% fill rate почти бесплатно.
    // ═══════════════════════════════════════════════════
    const reverseOrder = [...order].reverse();
    for (const { idx } of reverseOrder) {
        for (const { axis, delta } of directions) {
            while (tryMoveStep(idx, axis, delta, coarseStep)) {
                totalMoved++;
            }
        }
    }
    for (const { idx } of reverseOrder) {
        for (const { axis, delta } of directions) {
            while (tryMoveStep(idx, axis, delta, 1)) {
                fineMoved++;
                totalMoved++;
            }
        }
    }

    // ═══════════════════════════════════════════════════
    // v4.21: ФИНАЛЬНАЯ КОРРЕКЦИЯ ЗАЗОРОВ (безопасная)
    // После компакции проверяем ВСЕ пары на соблюдение pairGap.
    // Если фактический зазор < pairGap — используем tryMoveStep
    // в обратном направлении (сдвигаем ВПРАВО/ВНИЗ), который
    // сам проверяет коллизии через hull/grid — не создаёт
    // новых пересечений.
    // ═══════════════════════════════════════════════════
    let correctionPass = 0;
    let corrected = true;
    while (corrected && correctionPass < 20) {
        corrected = false;
        correctionPass++;

        for (let i = 0; i < nestedParts.length; i++) {
            for (let j = i + 1; j < nestedParts.length; j++) {
                const ni = nestedParts[i], nj = nestedParts[j];
                const wi = ni.width || 0, hi = ni.height || 0;
                const wj = nj.width || 0, hj = nj.height || 0;

                const pairGap = getPairGap(i, j);

                // Вычисляем фактический bbox-зазор по каждой оси
                const gapX1 = nj.x - (ni.x + wi); // j правее i
                const gapX2 = ni.x - (nj.x + wj); // i правее j
                const gapY1 = nj.y - (ni.y + hi); // j ниже i
                const gapY2 = ni.y - (nj.y + hj); // i ниже j

                const minGapX = gapX1 >= 0 ? gapX1 : (gapX2 >= 0 ? gapX2 : -Infinity);
                const minGapY = gapY1 >= 0 ? gapY1 : (gapY2 >= 0 ? gapY2 : -Infinity);

                // Корректируем только если детали действительно рядом по данной оси
                // (минимальный зазор по другой оси < 0 — значит bbox пересекаются)
                const xAdjacent = minGapY < 0 && minGapY > -1000; // перекрытие по Y → рядом по X
                const yAdjacent = minGapX < 0 && minGapX > -1000; // перекрытие по X → рядом по Y

                // По X: зазор меньше pairGap (включая пересечение — отрицательный зазор)
                if (xAdjacent && minGapX < pairGap && minGapX > -1000) {
                    // Определяем какая деталь правее и сдвигаем её вправо через tryMoveStep
                    const rightIdx = gapX1 >= 0 ? j : i;  // j правее i → сдвигаем j; иначе i
                    const neededShift = pairGap - minGapX;
                    // Сдвигаем по 1мм через tryMoveStep — он проверит все коллизии
                    for (let s = 0; s < Math.ceil(neededShift); s++) {
                        if (!tryMoveStep(rightIdx, 'x', +1, 1)) break; // столкновение — стоп
                        corrected = true;
                    }
                }

                // По Y: зазор меньше pairGap
                if (yAdjacent && minGapY < pairGap && minGapY > -1000) {
                    const bottomIdx = gapY1 >= 0 ? j : i;
                    const neededShift = pairGap - minGapY;
                    for (let s = 0; s < Math.ceil(neededShift); s++) {
                        if (!tryMoveStep(bottomIdx, 'y', +1, 1)) break;
                        corrected = true;
                    }
                }
            }
        }
    }
    const compactTime = ((performance.now() - compactStart) / 1000).toFixed(3);
    // Вычисляем occupied bounding box после компакции
    let compactMaxX = 0, compactMaxY = 0;
    for (const n of nestedParts) {
        compactMaxX = Math.max(compactMaxX, (n.x || 0) + (n.width || 0));
        compactMaxY = Math.max(compactMaxY, (n.y || 0) + (n.height || 0));
    }
    N.info(`📐 Компакция за ${compactTime}с: ${totalMoved} сдвигов, занято=${Math.round(compactMaxX)}x${Math.round(compactMaxY)}`);
    return { moved: totalMoved, fineMoved };
}
})(window.Nesting = window.Nesting || {});
