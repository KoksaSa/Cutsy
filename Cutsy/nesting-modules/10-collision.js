// ════════════════════════════════════════════════════════════════
// SilikinK Nesting Engine — Grid-based Collision Detection (Module 10)
// ════════════════════════════════════════════════════════════════
(function(N) {
    'use strict';
    
N.gridsOverlap = function gridsOverlap(part1, x1, y1, w1, h1, angle1Deg, part2, x2, y2, w2, h2, angle2Deg, minGap = 3) {
    // v3.8: Для line-heavy деталей — filled grid (точная заливка)
    // v3.42: Для деталей с отверстиями (_hasHoles) — тоже filled grid
    // v3.58: При отрицательном minGap используем occupancy grid (контур)
    // вместо filled grid (заливка), т.к. filled grid считает внутренность
    // контура занятой → ложное перекрытие при отрицательном spacing.
    // v3.75: ЕСЛИ ОДНА деталь line-heavy, ВТОРАЯ тоже использует filled grid!
    // Раньше: "фланец" (кольцо, _hasHoles=false) использовал occupancy grid
    // (только контур) → не видел перекрытие с материалом кольца → детали
    // размещались внутри кольца НА материал.
    // v3.76: Для кольцеобразных деталей (концентрические круги) filled grid
    // корректно показывает материал по краям и пустоту в центре.
    // Occupancy grid (контур) не показывает заливку между кольцами.
    const lh1 = N.isLineHeavyPart(part1) || part1._hasHoles === true;
    const lh2 = N.isLineHeavyPart(part2) || part2._hasHoles === true;
    const useFilled = minGap >= 0; // только при положительном/нулевом gap
    // FIX #11: Адаптивный gridSize вместо фиксированного 5/10.
    const gs1 = N.getAdaptiveGridSize(part1, Math.max(minGap, 1));
    const gs2 = N.getAdaptiveGridSize(part2, Math.max(minGap, 1));

    // v3.76: Определяем, есть ли у детали концентрические отверстия (кольца).
    // Для таких деталей filled grid надёжен (fillRate корректно отражает
    // геометрию), а SAFETY NET не должен активироваться при нормальном
    // fillRate (30% для кольца — это нормально, не признак утечки flood-fill).
    const holes1 = (part1._hasHoles || lh1) ? N.getPartHoles(part1) : [];
    const holes2 = (part2._hasHoles || lh2) ? N.getPartHoles(part2) : [];
    const hasConcentric1 = holes1.some(h => h.isConcentricHole);
    const hasConcentric2 = holes2.some(h => h.isConcentricHole);

    // v3.75: Если ХОТЯ БЫ одна деталь line-heavy/has-holes — ОБЕ используют
    // filled grid. Occupancy grid (только контур) недостаточен для точного
    // определения перекрытия материала — особенно для кольцеобразных деталей
    // (фланец, кольцо), где контур не отражает реальную геометрию материала.
    const bothUseFilled = (lh1 || lh2) && useFilled;
    let g1 = bothUseFilled ? N.getFilledOccupancyGrid(part1, gs1) : N.getPartOccupancyGrid(part1, gs1);
    let g2 = bothUseFilled ? N.getFilledOccupancyGrid(part2, gs2) : N.getPartOccupancyGrid(part2, gs2);

    // v3.22→v4.02: Safety — if fill rate too low, fall back to occupancy grid.
    // НО: для line-heavy деталей (дуги, П-образные) filled grid ВСЕГДА
    // надёжнее occupancy grid, даже при низком fillRate (5-10% для
    // тонкостенных деталей — это нормально). Occupancy grid показывает
    // только контур, который слишком разрежен для обнаружения наложений.
    // Fallback оставляем только для не-line-heavy деталей (где низкий
    // fillRate = признак утечки flood-fill, а не тонких стенок).
    if (bothUseFilled && !lh1 && g1.fillRate !== undefined && g1.fillRate < 0.10) g1 = N.getPartOccupancyGrid(part1, gs1);
    if (bothUseFilled && !lh2 && g2.fillRate !== undefined && g2.fillRate < 0.10) g2 = N.getPartOccupancyGrid(part2, gs2);

    // FIX #13: Дилатация filled grid на minGap для учёта spacing
    // вокруг отверстий. Без дилатации детали могут размещаться
    // вплотную к краю отверстия (0мм от материала), нарушая minGap.
    // v3.98: Когда ОБЕ детали line-heavy (L-образные), дилатация
    // каждой на minGap создаёт двойной отступ (2*minGap вместо minGap).
    // Это блокирует размещение двух L-деталей на расстоянии minGap.
    // Фикс: при двух line-heavy дилатируем каждую на minGap/2.
    const bothLH = lh1 && lh2;
    const dilationGap1 = bothLH ? minGap / 2 : minGap;
    const dilationGap2 = bothLH ? minGap / 2 : minGap;
    if (minGap > 0 && bothUseFilled) {
        const dilationR1 = Math.max(1, Math.ceil(dilationGap1 / gs1));
        const dilationR2 = Math.max(1, Math.ceil(dilationGap2 / gs2));
        if (lh1) {
            const dilatedGrid1 = N.dilateOccupancyGrid(g1.grid, g1.gw, g1.gh, dilationR1);
            g1 = { grid: dilatedGrid1, gw: g1.gw, gh: g1.gh, gridSize: g1.gridSize, fillRate: g1.fillRate };
        }
        if (lh2) {
            const dilatedGrid2 = N.dilateOccupancyGrid(g2.grid, g2.gw, g2.gh, dilationR2);
            g2 = { grid: dilatedGrid2, gw: g2.gw, gh: g2.gh, gridSize: g2.gridSize, fillRate: g2.fillRate };
        }
    }

    const g1Valid = g1.gw > 0 && g1.gh > 0 && g1.grid.some(c => c === 1);
    const g2Valid = g2.gw > 0 && g2.gh > 0 && g2.grid.some(c => c === 1);

    // Область пересечения bbox двух деталей (+ gap)
    // v3.67: Используем max(minGap, 0) для расширения области пересечения.
    // При отрицательном minGap (перекрытие bboxes допустимо) расширение
    // области пересечения на minGap уменьшало её, пропуская реальные
    // перекрытия: overlapX1 > overlapX2 → bboxesOverlap=false → return false.
    const gapForOverlap = Math.max(minGap, 0);
    const overlapX1 = Math.max(x1 - gapForOverlap, x2 - gapForOverlap);
    const overlapY1 = Math.max(y1 - gapForOverlap, y2 - gapForOverlap);
    const overlapX2 = Math.min(x1 + w1 + gapForOverlap, x2 + w2 + gapForOverlap);
    const overlapY2 = Math.min(y1 + h1 + gapForOverlap, y2 + h2 + gapForOverlap);
    const bboxesOverlap = overlapX1 < overlapX2 && overlapY1 < overlapY2;

    if (bboxesOverlap && (!g1Valid || !g2Valid)) return true; // Can't verify → assume overlap
    if (!bboxesOverlap) return false;
    // Примечание: если дошли сюда, bboxesOverlap=true и оба grid валидны
    // (иначе один из двух return выше сработал бы), поэтому отдельная
    // проверка !g1Valid||!g2Valid здесь не нужна.

    // v3.22: Use finer scan step to catch thin overlaps
    const gs = Math.min(g1.gridSize, g2.gridSize);
    const checkStep = Math.max(1, Math.round(gs / 2));

    // v3.10: Преобразование координат для углов поворота
    const a1 = ((angle1Deg % 360) + 360) % 360;
    const a2 = ((angle2Deg % 360) + 360) % 360;

    // FIX #10: полноценная матрица поворота для произвольных углов.
    // Раньше для неортогональных углов (не 0/90/180/270) просто
    // использовался 0° fallback → неправильные координаты ячеек.
    // FIX #14 (v3.78): Используем g.gridSize вместо общей gsInv!
    // Раньше gsInv = 1/min(gs1,gs2) использовался для ОБЕИХ сеток.
    // Когда у деталей разные gridSize (боковина=10, Поперечина=2.35),
    // код смотрел в НЕПРАВИЛЬНЫЕ ячейки крупной сетки:
    //   lx = 30 * (1/2.35) = 12.77 вместо 30 * (1/10) = 3.0
    // → gridsOverlap не видел наложение → детали размещались внахлёст.
    function getCell(sx, sy, x, y, w, h, angleDeg, g, part) {
        const invGs = 1 / g.gridSize; // СВОЙ gridSize для каждой сетки!
        let lx, ly;
        if (angleDeg === 0) {
            lx = (sx - x) * invGs; ly = (sy - y) * invGs;
        } else if (angleDeg === 90) {
            lx = (y + h - sy) * invGs; ly = (sx - x) * invGs;
        } else if (angleDeg === 180) {
            lx = (x + w - sx) * invGs; ly = (y + h - sy) * invGs;
        } else if (angleDeg === 270) {
            lx = (sy - y) * invGs; ly = (x + w - sx) * invGs;
        } else {
            // FIX #10: произвольный угол — обратное вращение вокруг центра bbox
            // v4.39 FIX #48: используем ОРИГИНАЛЬНЫЕ размеры (part.bounds) для центра
            // вращения. w/h — rotated bbox (swap при 90°/270°), но для произвольного
            // угла нужен original bbox центр. Если part.bounds недоступен — fallback на w/h.
            const origW = (part && part.bounds && part.bounds.width) || w;
            const origH = (part && part.bounds && part.bounds.height) || h;
            const rad = -angleDeg * Math.PI / 180;
            const cosA = Math.cos(rad), sinA = Math.sin(rad);
            const cxLocal = origW / 2, cyLocal = origH / 2;
            const dx = sx - (x + w / 2), dy = sy - (y + h / 2);  // x+w/2 — центр rotated bbox на листе
            const rx = dx * cosA - dy * sinA + cxLocal;
            const ry = dx * sinA + dy * cosA + cyLocal;
            lx = rx * invGs; ly = ry * invGs;
        }
        // v3.22: Clamp to handle boundary (prevents false negatives at edges)
        const gx = Math.max(0, Math.min(Math.floor(lx), g.gw - 1));
        const gy = Math.max(0, Math.min(Math.floor(ly), g.gh - 1));
        return g.grid[gy * g.gw + gx];
    }

    // Pass 1: coarse scan
    for (let sy = overlapY1; sy < overlapY2; sy += checkStep) {
        for (let sx = overlapX1; sx < overlapX2; sx += checkStep) {
            if (getCell(sx, sy, x1, y1, w1, h1, a1, g1, part1) === 1 &&
                getCell(sx, sy, x2, y2, w2, h2, a2, g2, part2) === 1) return true;
        }
    }
    // Pass 2: precise scan with halfStep offset
    const halfStep = checkStep / 2;
    for (let sy = overlapY1 + halfStep; sy < overlapY2; sy += checkStep) {
        for (let sx = overlapX1 + halfStep; sx < overlapX2; sx += checkStep) {
            if (getCell(sx, sy, x1, y1, w1, h1, a1, g1, part1) === 1 &&
                getCell(sx, sy, x2, y2, w2, h2, a2, g2, part2) === 1) return true;
        }
    }
    // v4.01: Pass 3 — точный scan с шагом 1мм для тонкостенных деталей.
    // Для line-heavy деталей (дуги, П-образные) предыдущие 2 прохода
    // с checkStep=2-3мм могут пропустить тонкие наложения стенок.
    // Ограничиваем область сканирования чтобы не замедлять для крупных деталей.
    if (lh1 || lh2) {
        const maxScanArea = 200 * 200; // мм² — сканируем только до 200x200
        const area = (overlapX2 - overlapX1) * (overlapY2 - overlapY1);
        const fineStep = area > maxScanArea ? 2 : 1;
        for (let sy = overlapY1 + 0.5; sy < overlapY2; sy += fineStep) {
            for (let sx = overlapX1 + 0.5; sx < overlapX2; sx += fineStep) {
                if (getCell(sx, sy, x1, y1, w1, h1, a1, g1, part1) === 1 &&
                    getCell(sx, sy, x2, y2, w2, h2, a2, g2, part2) === 1) return true;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // v3.51→v3.76: SAFETY NET — grid-based false negative protection.
    //
    // ПРОБЛЕМА: N.getFilledOccupancyGrid() может дать ненадёжную сетку:
    // - Flood-fill «протекает» через щели/пазы, открытые к краю детали
    // - fillRate падает → внутренность помечена как exterior (пусто)
    // - N.gridsOverlap() не находит ячеек с материалом в обеих сетках
    // - Результат: false (нет наложения), хотя детали РЕАЛЬНО пересекаются
    //
    // ПРИМЕР: «Продольная сушилка» 937×556мм с 60 пазами 20×185мм.
    // Пазы открыты к краю → flood-fill протекает → fillRate ~20%
    // → gridsOverlap=false при реальном наложении → детали размещаются внахлёст.
    //
    // РЕШЕНИЕ: Если grid говорит «нет наложения», но fill rate низкий
    // (сетка ненадёжна), проверяем через hull (polygonsIntersect).
    // Если hull'ы пересекаются — значит это реальное наложение,
    // которое grid не смог обнаружить.
    //
    // v3.76: АДАПТИВНЫЙ ПОРОГ для кольцеобразных деталей.
    // Для деталей с концентрическими отверстиями (кольца, фланцы)
    // низкий fillRate (30%) — это НОРМА, не признак утечки flood-fill.
    // Filled grid для таких деталей НАДЁЖЕН: он корректно показывает
    // материал по краям и пустоту в центре.
    // Порог для concentric-hole деталей снижен до 0.15 (с 0.40),
    // чтобы SAFETY NET не блокировал легальные размещения внутри
    // отверстия кольца (где convex hull пересекается, но материала нет).
    //
    // ИСКЛЮЧЕНИЕ: Для настоящих Г-образных деталей (isTrueLShaped)
    // пересечение hull'ов ожидаемо и не означает наложения материала.
    // В этом случае доверяем grid-проверке.
    // ═══════════════════════════════════════════════════════════════
    // v3.76: Адаптивный порог — ниже для концентрических отверстий
    const threshold1 = hasConcentric1 ? 0.15 : 0.40;
    const threshold2 = hasConcentric2 ? 0.15 : 0.40;
    const lowFillRate1 = g1.fillRate !== undefined && g1.fillRate < threshold1;
    const lowFillRate2 = g2.fillRate !== undefined && g2.fillRate < threshold2;
    const gridMayBeUnreliable = lowFillRate1 || lowFillRate2;

    if (gridMayBeUnreliable) {
        // Проверяем hull — если hull'ы пересекаются при minGap=0,
        // это подозрительно. Для не-Г-образных деталей это реальное наложение.
        const hull1 = N.getPartBoundingHull(part1);
        const hull2 = N.getPartBoundingHull(part2);
        if (hull1.length >= 3 && hull2.length >= 3) {
            // Трансформируем hull в позицию на листе с учётом угла
            const cx1 = (part1.bounds?.width || w1) / 2;
            const cy1 = (part1.bounds?.height || h1) / 2;
            const cx2 = (part2.bounds?.width || w2) / 2;
            const cy2 = (part2.bounds?.height || h2) / 2;
            const a1Rad = a1 * Math.PI / 180;
            const a2Rad = a2 * Math.PI / 180;
            const posHull1 = N.translatePolygon(N.rotatePolygon(hull1, a1Rad, cx1, cy1), x1, y1);
            const posHull2 = N.translatePolygon(N.rotatePolygon(hull2, a2Rad, cx2, cy2), x2, y2);

            if (N.polygonsIntersect(posHull1, posHull2, 0)) {
                // Hull'ы пересекаются! Проверяем: это ожидаемое пересечение
                // или реальное наложение материала?
                const trulyL1 = N.isTrueLShaped(part1);
                const trulyL2 = N.isTrueLShaped(part2);

                // v3.94: Концентрические отверстия (кольцо) — пересечение
                // hull'ов ОЖИДАЕМО для любой детали внутри отверстия кольца.
                // Convex hull кольца обёртывает отверстие → hull-ы пересекаются,
                // даже когда реального наложения материала нет.
                // Filled grid для колец надёжен (v3.76), доверяем ему.
                if (hasConcentric1 || hasConcentric2) {
                    // Одна из деталей — кольцо → пересечение hull'ов нормально,
                    // доверяем grid-результату (нет наложения материала)
                } else if (!trulyL1 && !trulyL2) {
                    // Обе детали НЕ Г-образные и НЕ кольцо → пересечение hull'ов = реальное наложение
                    console.warn(`[gridsOverlap] SAFETY NET: grid=false but hulls intersect`,
                        `"${part1.name||part1.id}" ↔ "${part2.name||part2.id}"`);
                    return true;
                }
                // Хоть одна деталь Г-образная ИЛИ кольцо — доверяем grid-проверке
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // v4.04→v4.06: POLYGON-OUTLINE SAFETY NET для деталей с дугами.
    //
    // ПРОБЛЕМА: Даже при gridSize=1мм и Pass 3 scan с шагом 0.5мм,
    // grid-проверка может пропустить наложение тонких стенок дуг:
    // - Дуга = кривая линия ~5мм толщиной → 5 ячеек в grid
    // - При определённом взаимном расположении две дуги могут
    //   пересекаться в точке, которая попадает МЕЖДУ ячейками grid
    // - gridsOverlap() возвращает false → деталь размещается внахлёст
    //
    // РЕШЕНИЕ: Для деталей с дугами (arc) или line-heavy, чьи bbox
    // пересекаются, проверяем пересечение РЕАЛЬНЫХ контуров деталей
    // (computePositionedPolygons). Контур следует по геометрии дуги,
    // а не по дискретному grid → 100% точность обнаружения.
    //
    // v4.06: УБРАНА проверка !trulyL1 && !trulyL2!
    // Раньше polygon safety net пропускался для Г-образных деталей
    // («допускают вложение»). Но Г-образные детали могут РЕАЛЬНО
    // накладываться при размещении в разных рядах (y=355 и y=407),
    // а grid не видит тонкое наложение дуг. Без polygon safety net
    // такие наложения не обнаруживаются → детали размещаются внахлёст.
    //
    // БЕЗОПАСНОСТЬ: polygonsIntersect с minGap=0 проверяет пересечение
    // реальных контуров (computePositionedPolygons). Для легального
    // вложения Г⌐ контуры НЕ пересекаются (впадина одной детали
    // входит в выступ другой, но рёбра не пересекаются). Поэтому
    // polygon safety net корректно разрешает легальное вложение и
    // блокирует реальное наложение.
    //
    // v4.04: Используем computePositionedPolygons вместо ручного
    // rotate+translate. Старый код (v4.03) вращал вокруг bbox-центра
    // (width/2, height/2) и добавлял (x, y) без нормализации —
    // это давало неверные координаты для повёрнутых деталей
    // (bbox при повороте меняется, а центр оставался оригинальный).
    // computePositionedPolygons корректно обрабатывает поворот:
    // центроид → вращение → нормализация (ref point) → перевод.
    //
    // v4.05: Также для деталей с дугами (arc) — даже если они
    // не line-heavy (bothLH=false), arc-кривизна не видна в hull.
    // ═══════════════════════════════════════════════════════════════
    const hasArc1 = (part1.objects || []).some(o => N.getShapeType(o) === 'arc');
    const hasArc2 = (part2.objects || []).some(o => N.getShapeType(o) === 'arc');
    const bothNeedPolyNet = bothLH || (hasArc1 && hasArc2);

    // v4.12: POLYGON NET с точным измерением глубины проникновения.
    // v4.11 показал: gap=-3 БЛОКИРУЕТ (penetration > 3мм), хотя визуально
    // наложения нет. Полигоны от аппроксимации дуг сильно искажают геометрию.
    // Ставим gap=-10 (максимально разрешительный) + логируем ТОЧНУЮ глубину
    // для каждой полигональной пары, чтобы подобрать правильный порог.
    // Grid-проверка (1мм) уже обеспечивает точный контроль — POLYGON NET
    // нужен только для грубых промахов grid (>10мм проникновения).
    const POLYGON_NET_GAP = -10;

    if (bothNeedPolyNet && !hasConcentric1 && !hasConcentric2) {
        try {
            const a1Rad = a1 * Math.PI / 180;
            const a2Rad = a2 * Math.PI / 180;
            const posPolys1 = N.computePositionedPolygons(part1, x1, y1, a1Rad);
            const posPolys2 = N.computePositionedPolygons(part2, x2, y2, a2Rad);

            if (posPolys1.length > 0 && posPolys2.length > 0) {
                let maxDepth = 0; // максимальная глубина проникновения
                for (const pp1 of posPolys1) {
                    if (pp1.length < 3) continue;
                    for (const pp2 of posPolys2) {
                        if (pp2.length < 3) continue;
                        // Точное измерение глубины проникновения
                        if (N.polygonsIntersect(pp1, pp2, 0)) {
                            let depth = 1; // минимум 1мм (пересекаются при gap=0)
                            for (let tg = -2; tg >= -20; tg--) {
                                if (!N.polygonsIntersect(pp1, pp2, tg)) { depth = -tg; break; }
                            }
                            if (depth > maxDepth) maxDepth = depth;
                        }
                    }
                }
                if (maxDepth > -POLYGON_NET_GAP) {
                    N.warn(`[POLYGON NET] БЛОКИРОВКА "${part1.name||part1.id}" ↔ "${part2.name||part2.id}" | проникновение=${maxDepth}мм > порог=${-POLYGON_NET_GAP}мм`);
                    return true;
                } else if (maxDepth > 0) {
                    N.info(`[POLYGON NET] ПРОПУСК "${part1.name||part1.id}" ↔ "${part2.name||part2.id}" | проникновение=${maxDepth}мм ≤ порог=${-POLYGON_NET_GAP}мм`);
                }
            }
        } catch (e) {
        }
    }

    return false;
}
})(window.Nesting = window.Nesting || {});