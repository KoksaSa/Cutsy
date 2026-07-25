// ════════════════════════════════════════════════════════════════
// SilikinK Nesting Engine — Candidate Generation & Checking (Module 13)
// ════════════════════════════════════════════════════════════════
(function(N) {
    'use strict';
    
N.generateCandidates = function generateCandidates(placedParts, bboxWidth, bboxHeight, sheetWidth, sheetHeight, minGap, edgeGap, newPart = null) {
    const MAX_CANDIDATES = N.getMaxCandidates(placedParts.length); // v3.40: адаптивный лимит
    const candidates = [];
    const seen = new Set();

    // ─── PRE-FILTER ДЛЯ ОСТАТКА ЛИСТА ─────────────────────────
    // Для остатков с вогнутым контуром большинство позиций на сетке
    // ВНЕ контура → generateCandidates добавляет тысячи позиций,
    // которые потом отклоняются в isPolygonInsideSheet.
    // Предварительная проверка центра позиции по контуру остатка
    // отсекает ~70-90% невалидных кандидатов, ускоряя раскладку в 5-10 раз.
    // v4.60 FIX: Поддержка Web Worker — self.sheetRemnant вместо window.sheetRemnant
    let _remnantRef = null;
    if (typeof sheetRemnant !== 'undefined') _remnantRef = sheetRemnant;
    else if (typeof self !== 'undefined' && self.sheetRemnant) _remnantRef = self.sheetRemnant;
    else if (typeof window !== 'undefined' && window.sheetRemnant) _remnantRef = window.sheetRemnant;

    let _useRemnantFlag = false;
    if (typeof useRemnant !== 'undefined') _useRemnantFlag = useRemnant;
    else if (typeof self !== 'undefined' && typeof self.useRemnant !== 'undefined') _useRemnantFlag = self.useRemnant;
    else if (typeof window !== 'undefined' && typeof window.useRemnant !== 'undefined') _useRemnantFlag = window.useRemnant;

    const _isRemnantActive = _useRemnantFlag && _remnantRef?.outerContour?.length > 0;
    const _remnantContour = _isRemnantActive ? _remnantRef.outerContour : null;

    // v4.60 FIX: isPointInsideContour может быть self.isPointInsideContour в Worker
    let _isPointInsideContour = null;
    if (typeof isPointInsideContour === 'function') _isPointInsideContour = isPointInsideContour;
    else if (typeof self !== 'undefined' && typeof self.isPointInsideContour === 'function') _isPointInsideContour = self.isPointInsideContour;
    else if (typeof window !== 'undefined' && typeof window.isPointInsideContour === 'function') _isPointInsideContour = window.isPointInsideContour;

    const _canCheckContour = _isRemnantActive && (_isPointInsideContour !== null);

    const add = (x, y) => {
        if (candidates.length >= MAX_CANDIDATES) return; // Лимит!
        const k = `${(x * 10) | 0},${(y * 10) | 0}`; // FIX: точность 0.1мм вместо 1мм
        if (seen.has(k)) return;
        if (x >= edgeGap && x + bboxWidth <= sheetWidth - edgeGap &&
            y >= edgeGap && y + bboxHeight <= sheetHeight - edgeGap) {
            // PRE-FILTER: для остатка — проверяем центр позиции по контуру.
            // Если центр ВНЕ контура — деталь точно не поместится.
            // Для прямоугольного листа эта проверка пропускается.
            if (_canCheckContour) {
                const cx = x + bboxWidth / 2;
                const cy = y + bboxHeight / 2;
                if (!_isPointInsideContour(cx, cy, _remnantContour)) return;
            }
            seen.add(k);
            candidates.push({ x, y });
        }
    };

    if (placedParts.length === 0) {
        add(edgeGap, edgeGap);
        // Для остатка листа (useRemnant=true) одной позиции недостаточно —
        // остаток может иметь неправильную форму, и (edgeGap, edgeGap) может быть
        // вне контура. Генерируем сетку кандидатов внутри bounding box остатка.
        // Для прямоугольного листа это не нужно — (edgeGap, edgeGap) всегда внутри.
        if (_isRemnantActive) {
            const step = Math.max(Math.min(bboxWidth, bboxHeight) / 4, 5);
            for (let ry = edgeGap; ry + bboxHeight <= sheetHeight - edgeGap; ry += step) {
                for (let rx = edgeGap; rx + bboxWidth <= sheetWidth - edgeGap; rx += step) {
                    add(rx, ry);
                }
            }
        }
        return candidates;
    }

    // v3.6: Для криволинейных деталей (много линий) — ослабляем
    // bbox-проверку в isOverlapping. Такие детали могут иметь
    // пересекающиеся bbox, но НЕ пересекающийся материал
    // (параболы вкладываются вогнутыми сторонами).
    const newIsLineHeavy = newPart && N.isLineHeavyPart(newPart);

    const usedX = new Set([edgeGap]);
    const usedY = new Set([edgeGap]);
    for (const p of placedParts) {
        const pw = p.width || p.bboxWidth || 0;
        const ph = p.height || p.bboxHeight || 0;
        const nx = p.x + pw + minGap;
        const ny = p.y + ph + minGap;
        if (nx + bboxWidth <= sheetWidth - edgeGap) usedX.add(nx);
        if (ny + bboxHeight <= sheetHeight - edgeGap) usedY.add(ny);
        // v3.6: Для кривых деталей добавляем дополнительные Y-уровни
        // внутри bbox уже размещённых деталей (т.к. они могут
        // вкладываться вогнутыми сторонами)
        if (newIsLineHeavy && p.part && N.isLineHeavyPart(p.part)) {
            // Добавляем позиции с шагом внутри высоты размещённой детали
            const stepY = Math.max(bboxHeight + minGap, 10);
            for (let iy = p.y + stepY; iy + bboxHeight <= p.y + ph; iy += stepY) {
                if (iy >= edgeGap && iy + bboxHeight <= sheetHeight - edgeGap) usedY.add(iy);
            }
        }
    }

    // Вспомогательная: быстрая проверка — позиция (x,y) с размером bboxWidth×bboxHeight
    // точно пересекается с какой-то размещённой деталью (bbox + minGap)
    // v3.6: Для криволинейных деталей — ослабляем проверку,
    // разрешаем перекрытие bbox с другими кривыми деталями
    // (точная проверка будет в checkCandidates через gridsOverlap)
    // v3.82: Для круглых деталей — используем расстояние между
    // центрами кругов вместо bbox. Bbox слишком консервативен:
    // два круга могут иметь пересекающиеся bbox, но не касаться
    // друг друга. Это позволяет generateCandidates найти позиции
    // рядом с большими кольцами, где bbox перекрывается.
    const newIsCircular = newPart && N.isCircularPart(newPart);
    const newCircleR = newIsCircular ? N.getCircleDiameter(newPart) / 2 : 0;

    const isOverlapping = (x, y) => {
        for (const p of placedParts) {
            const pw = p.width || p.bboxWidth || 0;
            const ph = p.height || p.bboxHeight || 0;

            // v3.82: Для двух круглых деталей — проверяем расстояние
            // между центрами вместо bbox. Это менее консервативно
            // и позволяет находить позиции вплотную к большим кольцам.
            if (newIsCircular && p.part && N.isCircularPart(p.part)) {
                const pR = N.getCircleDiameter(p.part) / 2;
                const pCx = (p.x || 0) + pw / 2;
                const pCy = (p.y || 0) + ph / 2;
                const nCx = x + bboxWidth / 2;
                const nCy = y + bboxHeight / 2;
                const dist = Math.hypot(nCx - pCx, nCy - pCy);
                if (dist < newCircleR + pR + minGap) return true;
                continue; // Не проверяем bbox для круг-круг
            }

            if (x < p.x + pw + minGap && x + bboxWidth + minGap > p.x &&
                y < p.y + ph + minGap && y + bboxHeight + minGap > p.y) {
                // v3.6: Если обе детали криволинейные — не считаем это
                // перекрытием на этапе генерации кандидатов.
                // Точная grid-проверка будет в checkCandidates.
                if (newIsLineHeavy && p.part && N.isLineHeavyPart(p.part)) continue;
                return true;
            }
        }
        return false;
    };

    for (const sx of usedX) {
        if (candidates.length >= MAX_CANDIDATES) break;
        const step = bboxHeight + minGap;
        if (step > 0) for (let y = edgeGap; y <= sheetHeight - bboxHeight - edgeGap; y += step) {
            if (!isOverlapping(sx, y)) add(sx, y);
            if (candidates.length >= MAX_CANDIDATES) break;
        }
        else { if (!isOverlapping(sx, edgeGap)) add(sx, edgeGap); }
    }
    for (const sy of usedY) {
        if (candidates.length >= MAX_CANDIDATES) break;
        const step = bboxWidth + minGap;
        if (step > 0) for (let x = edgeGap; x <= sheetWidth - bboxWidth - edgeGap; x += step) {
            if (!isOverlapping(x, sy)) add(x, sy);
            if (candidates.length >= MAX_CANDIDATES) break;
        }
        else { if (!isOverlapping(edgeGap, sy)) add(edgeGap, sy); }
    }

    // ═══════════════════════════════════════════════════
    // КОНТАКТНЫЕ КАНДИДАТЫ (slide-till-touch):
    // Позиции вплотную к каждой размещённой детали —
    // справа, слева, сверху, снизу + по Y-уровням
    // ═══════════════════════════════════════════════════
    if (candidates.length < MAX_CANDIDATES) {
        for (const p of placedParts) {
            if (candidates.length >= MAX_CANDIDATES) break;
            const pw = p.width || p.bboxWidth || 0;
            const ph = p.height || p.bboxHeight || 0;

            // Справа от p — новая деталь вплотную к правому краю
            const rightX = p.x + pw + minGap;
            if (rightX + bboxWidth <= sheetWidth - edgeGap) {
                const yPositions = [p.y, p.y + ph - bboxHeight, p.y + Math.round((ph - bboxHeight) / 2)];
                for (const yy of yPositions) {
                    if (yy >= edgeGap && yy + bboxHeight <= sheetHeight - edgeGap && !isOverlapping(rightX, yy)) add(rightX, yy);
                }
            }

            // Слева от p — новая деталь вплотную к левому краю
            const leftX = p.x - bboxWidth - minGap;
            if (leftX >= edgeGap) {
                const yPositions = [p.y, p.y + ph - bboxHeight, p.y + Math.round((ph - bboxHeight) / 2)];
                for (const yy of yPositions) {
                    if (yy >= edgeGap && yy + bboxHeight <= sheetHeight - edgeGap && !isOverlapping(leftX, yy)) add(leftX, yy);
                }
            }

            // Под p — новая деталь вплотную к нижнему краю
            const bottomY = p.y + ph + minGap;
            if (bottomY + bboxHeight <= sheetHeight - edgeGap) {
                const xPositions = [p.x, p.x + pw - bboxWidth, p.x + Math.round((pw - bboxWidth) / 2)];
                for (const xx of xPositions) {
                    if (xx >= edgeGap && xx + bboxWidth <= sheetWidth - edgeGap && !isOverlapping(xx, bottomY)) add(xx, bottomY);
                }
            }

            // Над p — новая деталь вплотную к верхнему краю
            const topY = p.y - bboxHeight - minGap;
            if (topY >= edgeGap) {
                const xPositions = [p.x, p.x + pw - bboxWidth, p.x + Math.round((pw - bboxWidth) / 2)];
                for (const xx of xPositions) {
                    if (xx >= edgeGap && xx + bboxWidth <= sheetWidth - edgeGap && !isOverlapping(xx, topY)) add(xx, topY);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════
    // КАНДИДАТЫ В ДЫРКАХ: угловые позиции между парами деталей
    // ═══════════════════════════════════════════════════
    if (candidates.length < MAX_CANDIDATES) {
        for (let i = 0; i < placedParts.length; i++) {
            if (candidates.length >= MAX_CANDIDATES) break;
            const p1 = placedParts[i];
            const p1w = p1.width || p1.bboxWidth || 0;
            const p1h = p1.height || p1.bboxHeight || 0;

            for (let j = 0; j < placedParts.length; j++) {
                if (i === j || candidates.length >= MAX_CANDIDATES) break;
                const p2 = placedParts[j];
                const p2w = p2.width || p2.bboxWidth || 0;
                const p2h = p2.height || p2.bboxHeight || 0;

                // Справа от p1, на уровне y от p2
                const cx = p1.x + p1w + minGap;
                const cy = p2.y;
                if (cx + bboxWidth <= sheetWidth - edgeGap && cy >= edgeGap && cy + bboxHeight <= sheetHeight - edgeGap) {
                    add(cx, cy);
                }

                // Под p1, на уровне x от p2
                const bx = p2.x;
                const by = p1.y + p1h + minGap;
                if (bx >= edgeGap && bx + bboxWidth <= sheetWidth - edgeGap && by + bboxHeight <= sheetHeight - edgeGap) {
                    add(bx, by);
                }

                // Угловая позиция: справа от p1 + под p2
                const rx = p1.x + p1w + minGap;
                const ry = p2.y + p2h + minGap;
                if (rx + bboxWidth <= sheetWidth - edgeGap && ry + bboxHeight <= sheetHeight - edgeGap) {
                    add(rx, ry);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════
    // HOLE-FILLING КАНДИДАТЫ: позиции внутри пустот
    // (дыр) уже размещённых деталей. Маленькие детали
    // могут поместиться в пустотах больших.
    // Используем occupancy grid для точной проверки.
    // ═══════════════════════════════════════════════════
    if (candidates.length < MAX_CANDIDATES) {
        for (const p of placedParts) {
            if (candidates.length >= MAX_CANDIDATES) break;
            const pw = p.width || p.bboxWidth || 0;
            const ph = p.height || p.bboxHeight || 0;

            // Пропускаем, если новая деталь не поместится внутри bbox
            if (bboxWidth >= pw || bboxHeight >= ph) continue;

            // Получаем дыры из кеша
            const partRef = p.part;
            if (!partRef) continue;
            const holes = N.getPartHoles(partRef);
            if (holes.length === 0) continue;

            // v3.52: Для повёрнутых деталей координаты дыры нужно
            // трансформировать (вращать вокруг центра детали).
            // Без этого hole-fill работает только для 0° ориентации.
            const pAngle = p.angle || 0;
            const pW = p.width || p.bboxWidth || 0;
            const pH = p.height || p.bboxHeight || 0;
            // v4.39 FIX #48: оригинальные размеры детали (до поворота).
            // pW/pH — rotated bbox (swap при 90°/270°). Для центра вращения
            // нужны оригинальные размеры.
            const origPW = p.baseWidth || (p.part && p.part.bounds && p.part.bounds.width) || pW;
            const origPH = p.baseHeight || (p.part && p.part.bounds && p.part.bounds.height) || pH;
            const pCx = (p.x || 0) + pW / 2; // Центр bbox на листе (rotated)
            const pCy = (p.y || 0) + pH / 2;

            // Для каждой дыры — генерируем кандидаты внутри (BLF-сетка)
            for (const hole of holes) {
                if (candidates.length >= MAX_CANDIDATES) break;
                // v3.38: Пропускаем подозрительно большие дыры — через них
                // hole-fill небезопасен (occupancy grid не отражает материал)
                if (hole.isSuspicious) continue;

                // Переводим координаты дыры на лист с учётом поворота
                let holeSheetX, holeSheetY, holeW, holeH;
                if (Math.abs(pAngle) > 0.01) {
                    // Вращаем центр отверстия вокруг центра детали
                    // v4.39 FIX #48: используем ОРИГИНАЛЬНЫЕ размеры (origPW/origPH),
                    // не rotated bbox (pW/pH) — иначе при 90°/270° центр смещается.
                    const holeCx = hole.x + hole.width / 2;
                    const holeCy = hole.y + hole.height / 2;
                    const rotPt = N.rotatePoint(holeCx, holeCy, pAngle, origPW / 2, origPH / 2);
                    holeW = hole.width; // При повороте на 90° ширина/высота меняются
                    holeH = hole.height;
                    // Для 90°/270° — swap width/height
                    const angleDeg = Math.abs(Math.round(pAngle * 180 / Math.PI) % 360);
                    if (angleDeg === 90 || angleDeg === 270) {
                        holeW = hole.height;
                        holeH = hole.width;
                    }
                    holeSheetX = (p.x || 0) + rotPt.x - holeW / 2;
                    holeSheetY = (p.y || 0) + rotPt.y - holeH / 2;
                } else {
                    holeSheetX = (p.x || 0) + hole.x;
                    holeSheetY = (p.y || 0) + hole.y;
                    holeW = hole.width;
                    holeH = hole.height;
                }

                // Проверяем: помещается ли новая деталь в дыру?
                if (bboxWidth + minGap * 2 > holeW || bboxHeight + minGap * 2 > holeH) continue;

                // Сетка позиций внутри дыры
                const stepX = bboxWidth + minGap;
                const stepY = bboxHeight + minGap;
                for (let hy = holeSheetY + minGap; hy + bboxHeight <= holeSheetY + holeH - minGap && candidates.length < MAX_CANDIDATES; hy += stepY) {
                    for (let hx = holeSheetX + minGap; hx + bboxWidth <= holeSheetX + holeW - minGap && candidates.length < MAX_CANDIDATES; hx += stepX) {
                        if (hx >= edgeGap && hx + bboxWidth <= sheetWidth - edgeGap &&
                            hy >= edgeGap && hy + bboxHeight <= sheetHeight - edgeGap) {
                            // v3.53: Проверяем через occupancy grid
                            // Конвертируем координаты листа → локальные с учётом поворота хоста
                            // FIX: pAngle уже объявлен выше (строка 3389), не переобъявляем
                            const localPt = N.sheetToLocal(hx, hy, p.x || 0, p.y || 0, pAngle, pw, ph, origPW, origPH);
                            if (N.isRectInPartHole(partRef, localPt.x, localPt.y, bboxWidth, bboxHeight, minGap)) {
                                const k = `${(hx * 10) | 0},${(hy * 10) | 0}`; // FIX: точность 0.1мм
                                if (!seen.has(k)) {
                                    seen.add(k);
                                    candidates.push({ x: hx, y: hy, isHoleCandidate: true, holePartId: p.partId });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    // Фаза 1: грубый скан (шаг ~50px) — находим лучший регион
    // Фаза 2: мелкий скан вокруг лучших позиций (шаг ~5px)
    // FAST-PATH: если деталей ≤3 — пропускаем coarse/fine,
    // т.к. usedX/usedY + контактные кандидаты уже достаточны
    // ═══════════════════════════════════════════════════
    const FAST_PATH_LIMIT = 3;
    if (placedParts.length <= FAST_PATH_LIMIT) {
        candidates.sort((a, b) => (a.y * sheetWidth + a.x) - (b.y * sheetWidth + b.x));
        // generateCandidates (fast): ${candidates.length} позиций
        return candidates;
    }

    const minDimension = Math.min(bboxWidth, bboxHeight);
    // Грубый шаг: 2-5% от листа, но не мельче 20 и не крупнее 80
    const coarseStep = Math.max(20, Math.min(80, Math.round(Math.min(sheetWidth, sheetHeight) * 0.03)));
    // Точный шаг: 1-3% от minDimension, но не мельче 3 и не крупнее 15
    const fineStep = Math.max(3, Math.min(15, Math.round(minDimension * 0.02)));
    const FINE_RADIUS = coarseStep; // Радиус уточнения вокруг лучшей грубой позиции
    const MAX_FINE_CANDIDATES = 800;

    // --- Фаза 1: грубый скан ---
    const coarseCandidates = [];
    const coarseSeen = new Set();
    const coarseAdd = (x, y) => {
        if (coarseCandidates.length >= MAX_CANDIDATES) return;
        const k = `${(x * 10) | 0},${(y * 10) | 0}`; // FIX: точность 0.1мм вместо 1мм
        if (coarseSeen.has(k)) return;
        if (x >= edgeGap && x + bboxWidth <= sheetWidth - edgeGap &&
            y >= edgeGap && y + bboxHeight <= sheetHeight - edgeGap) {
            coarseSeen.add(k);
            coarseCandidates.push({ x, y });
        }
    };

    if (coarseStep > 0 && candidates.length < MAX_CANDIDATES) {
        for (let y = edgeGap; y <= sheetHeight - bboxHeight - edgeGap; y += coarseStep) {
            if (coarseCandidates.length >= MAX_CANDIDATES) break;
            for (let x = edgeGap; x <= sheetWidth - bboxWidth - edgeGap; x += coarseStep) {
                if (coarseCandidates.length >= MAX_CANDIDATES) break;
                if (minGap > 0) {
                    let tooClose = false;
                    for (const p of placedParts) {
                        const pw = p.width || p.bboxWidth || 0;
                        const ph = p.height || p.bboxHeight || 0;
                        // v3.82: Для круглых деталей — проверяем по расстоянию
                        // между центрами, а не по bbox
                        if (newIsCircular && p.part && N.isCircularPart(p.part)) {
                            const pR = N.getCircleDiameter(p.part) / 2;
                            const pCx = (p.x || 0) + pw / 2;
                            const pCy = (p.y || 0) + ph / 2;
                            const nCx = x + bboxWidth / 2;
                            const nCy = y + bboxHeight / 2;
                            const dist = Math.hypot(nCx - pCx, nCy - pCy);
                            if (dist < newCircleR + pR + minGap) { tooClose = true; break; }
                            continue;
                        }
                        if (x < p.x + pw + minGap && x + bboxWidth + minGap > p.x &&
                            y < p.y + ph + minGap && y + bboxHeight + minGap > p.y) {
                            tooClose = true; break;
                        }
                    }
                    if (tooClose) continue;
                }
                coarseAdd(x, y);
            }
        }
    }

    // Сортируем грубые по BLF
    coarseCandidates.sort((a, b) => (a.y * sheetWidth + a.x) - (b.y * sheetWidth + b.x));

    // Добавляем грубые в основной список (они тоже валидные позиции)
    for (const c of coarseCandidates) {
        add(c.x, c.y);
    }

    // --- Фаза 2: точное уточнение вокруг лучших грубых позиций ---
    // Берём топ-N лучших BLF позиций и уточняем с мелким шагом
    const topN = Math.min(20, coarseCandidates.length);
    let fineAdded = 0;
    for (let ti = 0; ti < topN && fineAdded < MAX_FINE_CANDIDATES; ti++) {
        const center = coarseCandidates[ti];
        const xMin = Math.max(edgeGap, center.x - FINE_RADIUS);
        const xMax = Math.min(sheetWidth - bboxWidth - edgeGap, center.x + FINE_RADIUS);
        const yMin = Math.max(edgeGap, center.y - FINE_RADIUS);
        const yMax = Math.min(sheetHeight - bboxHeight - edgeGap, center.y + FINE_RADIUS);

        for (let fy = yMin; fy <= yMax; fy += fineStep) {
            if (fineAdded >= MAX_FINE_CANDIDATES) break;
            for (let fx = xMin; fx <= xMax; fx += fineStep) {
                if (fineAdded >= MAX_FINE_CANDIDATES) break;
                if (minGap > 0) {
                    let tooClose = false;
                    for (const p of placedParts) {
                        const pw = p.width || p.bboxWidth || 0;
                        const ph = p.height || p.bboxHeight || 0;
                        // v3.82: Для круглых деталей — проверяем по расстоянию
                        if (newIsCircular && p.part && N.isCircularPart(p.part)) {
                            const pR = N.getCircleDiameter(p.part) / 2;
                            const pCx = (p.x || 0) + pw / 2;
                            const pCy = (p.y || 0) + ph / 2;
                            const nCx = fx + bboxWidth / 2;
                            const nCy = fy + bboxHeight / 2;
                            const dist = Math.hypot(nCx - pCx, nCy - pCy);
                            if (dist < newCircleR + pR + minGap) { tooClose = true; break; }
                            continue;
                        }
                        if (fx < p.x + pw + minGap && fx + bboxWidth + minGap > p.x &&
                            fy < p.y + ph + minGap && fy + bboxHeight + minGap > p.y) {
                            tooClose = true; break;
                        }
                    }
                    if (tooClose) continue;
                }
                const beforeAdd = candidates.length;
                add(fx, fy);
                if (candidates.length > beforeAdd) fineAdded++;
            }
        }
    }

    // BLF-сортировка (Bottom-Left-Fill): приоритет позициям ближе к началу координат
    // Метрика: y * sheetWidth + x — сначала самые нижние, затем самые левые
    candidates.sort((a, b) => (a.y * sheetWidth + a.x) - (b.y * sheetWidth + b.x));
    // generateCandidates (full): ${candidates.length} позиций
    return candidates;
}

N.checkCandidates = async function checkCandidates(candidates, normalizedHull, refPoint, bbox, placedParts, sheetWidth, sheetHeight, minGap, edgeGap, angle, rotation, cancelCallback, newPart, spatialGrid) {
    const isCircular = N.isCircularPart(newPart);
    const newRadius = isCircular ? N.getCircleDiameter(newPart) / 2 : 0;

    for (let i = 0; i < candidates.length; i++) {
        if (cancelCallback?.()) return null;
        if (i % 200 === 0) await new Promise(r => setTimeout(r, 0));

        const { x, y, isHoleCandidate, holePartId } = candidates[i];
        const positionedHull = N.translatePolygon(normalizedHull, x, y);
        if (!N.isPolygonInsideSheet(positionedHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;

        let canPlace = true;
        const toCheck = spatialGrid
            ? N.getNearbyParts(spatialGrid, x - minGap, y - minGap, bbox.width + minGap * 2, bbox.height + minGap * 2)
            : placedParts;

        for (const placed of toCheck) {
            if (cancelCallback?.()) return null;
            const pw = placed.width || placed.bboxWidth || 0;
            const ph = placed.height || placed.bboxHeight || 0;

            // ═══════════════════════════════════════════════════
            // HOLE-FILLING: если кандидат внутри дыры детали,
            // проверяем через occupancy grid (не convex hull
            // и не positionedPolygons — оба дают ложные
            // срабатывания для круглых деталей).
            // ═══════════════════════════════════════════════════
            const isHoleHost = isHoleCandidate && placed.partId === holePartId;

            if (isHoleHost) {
                const partRef = placed.part;
                if (partRef) {
                    // v3.53: Конвертируем координаты листа → локальные с учётом поворота хоста
                    const placedAngle = placed.angle || 0;
                    const placedW = placed.width || placed.bboxWidth || 0;
                    const placedH = placed.height || placed.bboxHeight || 0;
                    // v4.39 FIX #48: оригинальные размеры для центра вращения
                    const origPlacedW = placed.baseWidth || (partRef.bounds && partRef.bounds.width) || placedW;
                    const origPlacedH = placed.baseHeight || (partRef.bounds && partRef.bounds.height) || placedH;
                    const localPt = N.sheetToLocal(x, y, placed.x || 0, placed.y || 0, placedAngle, placedW, placedH, origPlacedW, origPlacedH);
                    if (!N.isRectInPartHole(partRef, localPt.x, localPt.y, bbox.width, bbox.height, minGap)) {
                        canPlace = false; break;
                    }
                    // v3.42→v3.69: SAFETY NET — polygon-based collision check.
                    // isRectInPartHole использует occupancy grid, который
                    // может быть ненадёжен (flood-fill протёк, тонкий
                    // контур, крупный gridSize). Проверяем hull хоста:
                    // если positionedHull новой детали пересекает hull
                    // хоста — значит деталь НА материале хоста, не в дыре.
                    //
                    // ВАЖНО: Пропускаем hull-check если:
                    // 1) Концентрические круги (кольца) — hull покрывает
                    //    отверстие, но это реальная дыра
                    // 2) Hull хоста — выпуклый прямоугольник (4 вершины) —
                    //    он покрывает все внутренние вырезы, и hull-check
                    //    заблокирует легальные размещения в вырезах.
                    //
                    // v3.69: Для деталей с _hasHoles — БОЛЬШЕ НЕ пропускаем
                    // hull-check полностью! Раньше hostHasHoles=true
                    // полностью обходило проверку, позволяя размещать
                    // детали внутри МАТЕРИАЛА хоста. Теперь: если hull-ы
                    // пересекаются, проверяем gridsOverlap — он точно
                    // определяет реальное перекрытие материала.
                    const hostHoles = N.getPartHoles(partRef);
                    // v3.53: Проверяем, находится ли кандидат конкретно в
                    // концентрическом отверстии (а не «есть ли вообще такие»).
                    // Раньше: isConcentric = hostHoles.some(h => h.isConcentricHole)
                    // — если хотя бы одна дыра концентрическая, hull-check
                    // пропускался для ВСЕХ дыр (небезопасно для не-концентрических).
                    const isConcentric = hostHoles.some(h =>
                        h.isConcentricHole &&
                        localPt.x + bbox.width > h.x && localPt.x < h.x + h.width &&
                        localPt.y + bbox.height > h.y && localPt.y < h.y + h.height
                    );
                    const hostHullVerts = placed.positionedHull?.length || 0;
                    const isConvexRect = hostHullVerts === 4; // Прямоугольный hull
                    const hostHasHoles = partRef._hasHoles === true || hostHoles.length > 0;
                    if (!isConcentric && !isConvexRect && !hostHasHoles && placed.positionedHull?.length >= 3 && positionedHull.length >= 3) {
                        // Хост без отверстий — стандартная hull-проверка
                        if (N.polygonsIntersect(positionedHull, placed.positionedHull, minGap)) {
                            // HOLE-FILL SAFETY: hull пересечение → ОТКАЗ
                            canPlace = false; break;
                        }
                    } else if ((hostHasHoles || isConvexRect || isConcentric) && placed.positionedHull?.length >= 3 && positionedHull.length >= 3) {
                        // v3.70: Хост с отверстиями, выпуклый прямоугольник
                        // или концентрические круги — hull-проверка
                        // ненадёжна (hull обёртывает отверстия/дыры).
                        // Раньше isConvexRect и isConcentric полностью
                        // обходили проверку → детали размещались НА
                        // материале хоста. Теперь: если hull-ы пересекаются,
                        // проверяем gridsOverlap — он точно определяет
                        // реальное перекрытие материала.
                        if (N.polygonsIntersect(positionedHull, placed.positionedHull, 0)) {
                            const gAngleDeg = Math.round((angle || 0) * 180 / Math.PI) % 360;
                            const gPlacedAngleDeg = Math.round((placed.angle || 0) * 180 / Math.PI) % 360;
                            // v3.84: minGap=0 для gridsOverlap при hole-fill!
                            // При minGap>0 дилатация сужает отверстие и расширяет
                            // деталь → ложное перекрытие → легальные размещения отклоняются
                            if (N.gridsOverlap(newPart, x, y, bbox.width, bbox.height, gAngleDeg,
                                partRef, placed.x || 0, placed.y || 0, pw, ph, gPlacedAngleDeg, 0)) {
                                console.warn(`🕳️ [HOLE-FILL v3.70] gridsOverlap: деталь на материале хоста → ОТКАЗ`,
                                    `"${newPart.name||newPart.id}" ↔ "${placed.partId}"`);
                                canPlace = false; break;
                            }
                        }
                    }
                }
                continue; // Не проверяем hull для хоста дыры (уже проверили выше)
            }

            // Обычная проверка (не hole-filling)
            const noOverlap = minGap >= 0
                ? (x + bbox.width + minGap <= placed.x || placed.x + pw + minGap <= x ||
                   y + bbox.height + minGap <= placed.y || placed.y + ph + minGap <= y)
                : (x + bbox.width <= placed.x || placed.x + pw <= x ||
                   y + bbox.height <= placed.y || placed.y + ph <= y);
            if (noOverlap) continue;

            let hit = false;
            let checkPath = ''; // v3.74: диагностика — какой путь проверки
            // v3.6: Для криволинейных деталей (много линий, нет заливки)
            // используем grid-проверку — она точно определяет
            // пересечение РЕАЛЬНОГО материала, а не bbox.
            // Параболы могут вкладываться вогнутыми сторонами.
            // v3.43: Также для деталей с отверстиями (_hasHoles),
            // чтобы другие детали не вкладывались в пустоты.
            const newIsLineHeavy = N.isLineHeavyPart(newPart);
            const placedIsLineHeavy = placed.part && N.isLineHeavyPart(placed.part);
            const newHasHoles = newPart._hasHoles === true;
            const placedHasHoles = placed.part && placed.part._hasHoles === true;
            // Grid-based проверка нужна если хотя бы одна деталь
            // криволинейная или имеет отверстия
            const needsGridCheck = newIsLineHeavy || placedIsLineHeavy || newHasHoles || placedHasHoles;

            if (newIsLineHeavy && placedIsLineHeavy) {
                // Grid-based overlap detection для криволинейных деталей
                // v3.7: передаём углы поворота для корректного отображения grid
                const newAngleDeg = Math.round((angle || 0) * 180 / Math.PI) % 360;
                const placedAngleDeg = Math.round((placed.angle || 0) * 180 / Math.PI) % 360;
                hit = N.gridsOverlap(newPart, x, y, bbox.width, bbox.height, newAngleDeg,
                    placed.part, placed.x, placed.y, pw, ph, placedAngleDeg, minGap);
                checkPath = 'both-LH:grid';
            } else if (newIsLineHeavy || placedIsLineHeavy) {
                // Одна деталь кривая, другая обычная — grid + hull
                checkPath = 'one-LH:hull+grid';
                if (placed.positionedHull?.length) {
                    if (N.polygonsIntersect(positionedHull, placed.positionedHull, minGap)) hit = true;
                } else {
                    if (x < placed.x + pw && x + bbox.width > placed.x && y < placed.y + ph && y + bbox.height > placed.y) hit = true;
                }
                // Если hull показывает пересечение, но одна деталь кривая —
                // проверяем grid (может быть ложное срабатывание hull)
                if (hit && (newIsLineHeavy || placedIsLineHeavy)) {
                    // FIX #12: Всегда передаём newPart как part1, placed.part как part2.
                    const a1Deg = Math.round((angle || 0) * 180 / Math.PI) % 360;
                    const a2Deg = Math.round((placed.angle || 0) * 180 / Math.PI) % 360;
                    hit = N.gridsOverlap(newPart, x, y, bbox.width, bbox.height, a1Deg,
                        placed.part, placed.x, placed.y, pw, ph, a2Deg, minGap);
                    if (!hit) checkPath += ':grid-refuted';
                }
                if (!hit) checkPath += ':no-hit';
            } else if (needsGridCheck) {
                // v3.43: Одна или обе детали имеют отверстия — grid + hull
                checkPath = 'hasHoles:hull+grid';
                if (placed.positionedHull?.length) {
                    if (N.polygonsIntersect(positionedHull, placed.positionedHull, minGap)) hit = true;
                } else {
                    if (x < placed.x + pw && x + bbox.width > placed.x && y < placed.y + ph && y + bbox.height > placed.y) hit = true;
                }
                if (hit) {
                    const a1Deg = Math.round((angle || 0) * 180 / Math.PI) % 360;
                    const a2Deg = Math.round((placed.angle || 0) * 180 / Math.PI) % 360;
                    hit = N.gridsOverlap(newPart, x, y, bbox.width, bbox.height, a1Deg,
                        placed.part, placed.x, placed.y, pw, ph, a2Deg, minGap);
                    if (!hit) checkPath += ':grid-refuted';
                }
                if (!hit) checkPath += ':no-hit';
            } else if (isCircular && placed.part && N.isCircularPart(placed.part)) {
                checkPath = 'both-circular';
                const pr = N.getCircleDiameter(placed.part) / 2;
                const dist = Math.hypot((x + newRadius) - (placed.x + pr), (y + newRadius) - (placed.y + pr));
                if (dist < newRadius + pr + minGap - 0.01) hit = true;
            } else if (placed.positionedHull?.length) {
                checkPath = 'hull-only';
                if (N.polygonsIntersect(positionedHull, placed.positionedHull, minGap)) hit = true;
            } else {
                checkPath = 'bbox-only';
                if (x < placed.x + pw && x + bbox.width > placed.x && y < placed.y + ph && y + bbox.height > placed.y) hit = true;
            }

            if (hit) { canPlace = false; break; }
            // v3.76: Убран шумный COLLISION-лог для каждого "нет наложения".
            // GRID-REFUTED предупреждения выше достаточно для диагностики.
        }

        if (canPlace) {
            if (isHoleCandidate) {
            // Hole-fill: деталь в дыру
            }
            return { x, y, rotation, angle, positionedHull, positionedPolygons: N.computePositionedPolygons(newPart, x, y, angle), refPoint, bboxWidth: bbox.width, bboxHeight: bbox.height };
        }
    }
    return null;
}

N.computePositionedPolygons = function computePositionedPolygons(part, x, y, angle) {
    const polygons = N.getPartPolygons(part);
    if (!angle || angle === 0) {
        // Без поворота — просто трансляция
        return polygons.map(poly => poly.map(p => ({ x: p.x + x, y: p.y + y })));
    }
    // v4.32 FIX: Вращаем ВСЕ полигоны вокруг ЦЕНТРА BBOX детали (как prepareRotatedHull),
    // а не вокруг центроида каждого полигона.
    //
    // ПРОБЛЕМА (v4.31 и ранее): каждый полигон вращался вокруг своего центроида
    // и нормализовался индивидуально (ref point + bbox → origin). Для детали
    // с отверстиями (круги внутри треугольника) это приводило к коллапсу:
    // — Круг r=2.25 при повороте 180° вокруг своего центра НЕ меняется
    // — Нормализация сдвигала его bbox в (0,0)
    // — Трансляция ставила все отверстия в позицию (x, y)
    // — 8 отверстий собирались в одну точку → ложное наложение в верификации
    //
    // РЕШЕНИЕ: используем ту же нормализацию, что и prepareRotatedHull —
    // вращение вокруг (W/2, H/2), затем сдвиг по ref point + bbox hull'а.
    // Это гарантирует, что positionedPolygons совпадают с positionedHull.
    const cx = part.bounds.width / 2;
    const cy = part.bounds.height / 2;
    const hull = N.getPartBoundingHull(part);
    const rotatedHull = N.rotatePolygon(hull, angle, cx, cy);
    const ref = N.getReferencePoint(rotatedHull);
    const shiftedHull = rotatedHull.map(p => ({ x: p.x - ref.x, y: p.y - ref.y }));
    const bb = N.getBoundingBox(shiftedHull);
    // Суммарный сдвиг: -ref - bbox.min (та же нормализация, что в prepareRotatedHull)
    const shiftX = -(ref.x + bb.minX);
    const shiftY = -(ref.y + bb.minY);

    return polygons.map(poly => {
        const rotated = N.rotatePolygon(poly, angle, cx, cy);
        return rotated.map(p => ({ x: p.x + shiftX + x, y: p.y + shiftY + y }));
    });
}
})(window.Nesting = window.Nesting || {});