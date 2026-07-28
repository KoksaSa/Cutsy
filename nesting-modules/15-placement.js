// ════════════════════════════════════════════════════════════════




(function(N) {
    'use strict';
    
N.findPositionWithNFP = async function findPositionWithNFP(placedParts, newPart, sheetWidth, sheetHeight, cancelCallback = null, spatialGrid = null) {
    // Resolve gaps from UI / part settings
    const uiSpacing = parseFloat(document.getElementById('contextPartSpacing')?.value);
    const uiEdgeGap = parseFloat(document.getElementById('edgeGap')?.value);
    let minGap, edgeGap;

    if (newPart.oneCutEnabled === true && placedParts.length > 0) {
        minGap = 0;
        edgeGap = uiEdgeGap || 3;
    } else if (window.allowOverlap === true) {
        minGap = -100;
        edgeGap = 0;
    } else {
        minGap = (typeof newPart.spacing === 'number') ? newPart.spacing : (!isNaN(uiSpacing) ? uiSpacing : 3);
        edgeGap = uiEdgeGap || 3;
        // v3.58: Убрана принудительная коррекция minGap < 1 → 1.
        

        

        

        

        minGap = Math.max(-100, Math.min(100, minGap));
    }

    // ═══════════════════════════════════════════════════
    

    

    {
        const partName = newPart.name || newPart.id || '?';
        const partSpacing = newPart.spacing;
        const spacingSource = (typeof partSpacing === 'number')
            ? `part.spacing=${partSpacing}мм`
            : (!isNaN(uiSpacing) ? `UI-поле=${uiSpacing}мм` : `default=3мм`);
        console.log(`[NESTING] "${partName}" → minGap=${minGap}мм | источник: ${spacingSource}, oneCut=${newPart.oneCutEnabled? 'ДА' : 'нет'}, allowOverlap=${window.allowOverlap? 'ДА' : 'нет'}`);
    }

    // ═══════════════════════════════════════════════════════
    

    

    {
        const partName = newPart.name || newPart.id || '?';
        const partSpacing = newPart.spacing;
        const spacingSource = (typeof partSpacing === 'number')
            ? `per-part (${partSpacing}мм)`
            : (!isNaN(uiSpacing) ? `UI-поле (${uiSpacing}мм)` : `default (3мм)`);
        console.log(`[SPACING] "${partName}" → minGap=${minGap}мм | источник: ${spacingSource}`);
    }

    const isCircular = N.isCircularPart(newPart);
    const partHull = N.getPartBoundingHull(newPart);
    const centerX = newPart.bounds.width / 2;
    const centerY = newPart.bounds.height / 2;

    // One-cut fast path
    if (newPart.oneCutEnabled === true && placedParts.length > 0 && !isCircular) {
        const pos = N.findPositionWithCommonEdge(placedParts, newPart, sheetWidth, sheetHeight, minGap, edgeGap);
        if (pos) {
            let bad = false;
            for (const placed of placedParts) {
                if (placed.positionedHull?.length) {
                    if (N.polygonsIntersect(pos.positionedHull, placed.positionedHull, minGap)) { bad = true; break; }
                } else {
                    const pw = placed.width || placed.bboxWidth || 0;
                    const ph = placed.height || placed.bboxHeight || 0;
                    if (pos.x < placed.x + pw + minGap && pos.x + pos.bboxWidth + minGap > placed.x &&
                        pos.y < placed.y + ph + minGap && pos.y + pos.bboxHeight + minGap > placed.y) {
                        bad = true; break;
                    }
                }
            }
            if (!bad) return pos;
        }
    }

    // ═══════════════════════════════════════════════════
    

    

    

    

    

    

    

    

    if (placedParts.length > 0 && !isCircular) {
        // Пробуем углы: batch-углы + 0° + перпендикулярный
        

        // а не только _batchAngles + слепо 0°
        const holeAngleDegs = [];
        if (newPart._batchAngles?.length) {
            for (const a of newPart._batchAngles) { if (!holeAngleDegs.includes(a)) holeAngleDegs.push(a); }
        } else {
            // Нет batchAngles — получаем углы из allowedAngles/getRotationAngles
            const rotAngles = N.getRotationAngles(newPart, placedParts.length === 0);
            for (const a of rotAngles) { if (!holeAngleDegs.includes(a)) holeAngleDegs.push(a); }
        }
        if (!holeAngleDegs.includes(0)) holeAngleDegs.push(0);
        // Добавляем 90° если деталь не квадратная
        const partAspect = newPart.bounds ? newPart.bounds.width / Math.max(1, newPart.bounds.height) : 1;
        if (Math.abs(partAspect - 1) > 0.1) {
            const perpDeg = ((holeAngleDegs[0] || 0) + 90) % 360;
            if (!holeAngleDegs.includes(perpDeg)) holeAngleDegs.push(perpDeg);
        }

        // v3.2: Предварительная фильтрация — собираем только те детали,
        // у которых есть дыры, достаточно большие для текущей детали.
        

        

        const minPartW = newPart.bounds ? newPart.bounds.width : 0;
        const minPartH = newPart.bounds ? newPart.bounds.height : 0;
        // Минимальный размер дыры: хотя бы minPartW × minPartH
        

        const minHoleDim = Math.min(minPartW, minPartH) + minGap * 2;

        // Собираем кандидаты: [{placed, holes}] с фильтрацией по размеру
        const holeCandidates = [];
        for (const placed of placedParts) {
            // v3.52: Убрана проверка placed.angle — повёрнутые детали
            

            

            

            const partRef = placed.part;
            if (!partRef) continue;

            // v3.73: Определяем, есть ли у детали отверстия для размещения.
            

            

            

            

            // не пропускаем, даже если нет solidFill и concentricCircles.
            const partObjs = partRef.objects || [];
            const hasSolid = N.hasSolidFill(partRef);
            // Проверяем концентрические круги (кольцо/фланец)
            let hasConcentricCircles = false;
            if (!hasSolid) {
                const pCircles = partObjs.filter(o => N.getShapeType(o) === 'circle');
                // v3.72: Логируем только ОДИН раз на имя детали
                

                if (pCircles.length >= 2) {
                    outerCheck: for (let i = 0; i < pCircles.length; i++) {
                        for (let j = 0; j < pCircles.length; j++) {
                            if (i === j) continue;
                            const dist = Math.hypot(
                                (pCircles[j].cx||0)-(pCircles[i].cx||0),
                                (pCircles[j].cy||0)-(pCircles[i].cy||0)
                            );
                            if (dist + (pCircles[j].radius||0) < (pCircles[i].radius||0) - 1) {
                                hasConcentricCircles = true;
                                break outerCheck;
                            }
                        }
                    }
                }
            }
            if (!hasSolid && !hasConcentricCircles) {
                // v3.73: Проверяем detectPartHoles — если нашёл отверстия, продолжаем
                const preHoles = N.getPartHoles(partRef);
                if (preHoles.length === 0) continue;
            }

            const allHoles = N.getPartHoles(partRef);
            if (allHoles.length === 0) continue;

            // Фильтруем дыры: оставляем только те, куда МОЖЕТ поместиться
            

            

            

            

            

            

            

            

            const partBbox = partRef.bounds;
            // v3.52: Используем реальный gridSize из getPartHoles вместо
            

            

            

            const actualGridSize = N.getAdaptiveGridSize(partRef, 3);
            const totalGridCells = partBbox ?
                Math.ceil(partBbox.width / actualGridSize) * Math.ceil(partBbox.height / actualGridSize) : 0;
            const bigEnoughHoles = allHoles.filter(h => {
                if (h.width < minHoleDim || h.height < minHoleDim) return false;
                // Концентрические круги — легальная большая дыра (кольцо)
                if (h.isConcentricHole) return true;
                // Пометка из detectPartHoles — ненадёжная дыра
                if (h.isSuspicious) return false;
                // Подозрительно большая дыра — скорее всего артефакт
                if (totalGridCells > 0 && h.cells / totalGridCells > 0.35) return false;
                return true;
            });

            if (bigEnoughHoles.length > 0) {
                // Сортируем дыры по убыванию площади (большие первые)
                bigEnoughHoles.sort((a, b) => (b.width * b.height) - (a.width * a.height));
                holeCandidates.push({ placed, holes: bigEnoughHoles });
            }
        }

        // v3.97: Сортируем кандидатов — приоритет отверстиям, где уже
        

        

        

        for (const hc of holeCandidates) {
            const hostX = hc.placed.x || 0;
            const hostY = hc.placed.y || 0;
            const hostW = hc.placed.width || hc.placed.bboxWidth || 0;
            const hostH = hc.placed.height || hc.placed.bboxHeight || 0;
            // Считаем сколько same-type деталей уже в этом хосте
            let sameTypeCount = 0;
            for (const p of placedParts) {
                if (p.partId === newPart.id && p.x >= hostX && p.y >= hostY &&
                    p.x < hostX + hostW && p.y < hostY + hostH) {
                    sameTypeCount++;
                }
            }
            hc._sameTypeCount = sameTypeCount;
        }
        holeCandidates.sort((a, b) => {
            // Сначала — отверстия с same-type деталями (дозаполнение)
            if (a._sameTypeCount > 0 && b._sameTypeCount === 0) return -1;
            if (b._sameTypeCount > 0 && a._sameTypeCount === 0) return 1;
            // Потом — по размеру (крупные первые)
            return (b.holes[0].width * b.holes[0].height) - (a.holes[0].width * a.holes[0].height);
        });

        // Ранний выход: нет деталей с достаточно большими дырами
        if (holeCandidates.length > 0) {
            // Находим самую большую дыру среди всех кандидатов
            

            let globalLargestW = 0, globalLargestH = 0;
            for (const hc of holeCandidates) {
                globalLargestW = Math.max(globalLargestW, hc.holes[0].width);
                globalLargestH = Math.max(globalLargestH, hc.holes[0].height);
            }

            for (const hAngleDeg of holeAngleDegs) {
                const hAngleRad = hAngleDeg * Math.PI / 180;
                const hRotation = (hAngleDeg % 360 >= 45 && hAngleDeg % 360 <= 135) ||
                                  (hAngleDeg % 360 >= 225 && hAngleDeg % 360 <= 315) ? 1 : 0;
                const hPrepared = N.prepareRotatedHull(partHull, hAngleRad, centerX, centerY);

                // Быстрая проверка: может ли деталь в этом угле вообще
                

                if (hPrepared.bbox.width + minGap * 2 > globalLargestW ||
                    hPrepared.bbox.height + minGap * 2 > globalLargestH) {
                    // Этот угол не помещается даже в самую большую дыру
                    continue;
                }

                for (const { placed, holes } of holeCandidates) {
                    // v3.52: Трансформация координат дыры для повёрнутых хостов
                    const placedAngle = placed.angle || 0;
                    const placedW = placed.width || placed.bboxWidth || 0;
                    const placedH = placed.height || placed.bboxHeight || 0;
                    // v4.39 FIX #47: оригинальные размеры детали (до поворота).
                    

                    

                    const origPlacedW = placed.baseWidth || (placed.part && placed.part.bounds && placed.part.bounds.width) || placedW;
                    const origPlacedH = placed.baseHeight || (placed.part && placed.part.bounds && placed.part.bounds.height) || placedH;
                    const placedAngleDeg = Math.abs(Math.round(placedAngle * 180 / Math.PI) % 360);
                    const isRotated90 = placedAngleDeg === 90 || placedAngleDeg === 270;

                    for (const hole of holes) {
                        // Вычисляем размеры дыры с учётом поворота хоста
                        const effectiveHoleW = isRotated90 ? hole.height : hole.width;
                        const effectiveHoleH = isRotated90 ? hole.width : hole.height;

                        // Проверяем: помещается ли деталь в эту дыру при текущем угле?
                        if (hPrepared.bbox.width + minGap * 2 > effectiveHoleW ||
                            hPrepared.bbox.height + minGap * 2 > effectiveHoleH) continue;

                        // Переводим координаты дыры на лист с учётом поворота хоста
                        let holeSheetX, holeSheetY;
                        if (Math.abs(placedAngle) > 0.01) {
                            // Вращаем центр отверстия вокруг центра детали
                            

                            // не rotated bbox (placedW/H) — иначе при 90°/270° центр смещается.
                            const holeCx = hole.x + hole.width / 2;
                            const holeCy = hole.y + hole.height / 2;
                            const rotPt = N.rotatePoint(holeCx, holeCy, placedAngle, origPlacedW / 2, origPlacedH / 2);
                            holeSheetX = (placed.x || 0) + rotPt.x - effectiveHoleW / 2;
                            holeSheetY = (placed.y || 0) + rotPt.y - effectiveHoleH / 2;
                        } else {
                            holeSheetX = (placed.x || 0) + hole.x;
                            holeSheetY = (placed.y || 0) + hole.y;
                        }

                        // Генерируем позиции внутри дыры (BLF-порядок: снизу-слева)
                        

                        // т.к. bbox включает пустой квадрант — реальные L-детали
                        

                        const isNewLShaped = N.isTrueLShaped(newPart);
                        const stepX = isNewLShaped
                            ? Math.max(minGap * 2, Math.round(hPrepared.bbox.width * 0.25))
                            : hPrepared.bbox.width + minGap;
                        const stepY = isNewLShaped
                            ? Math.max(minGap * 2, Math.round(hPrepared.bbox.height * 0.25))
                            : hPrepared.bbox.height + minGap;

                        // v3.98: Для L-деталей в концентрических отверстиях
                        

                        

                        

                        

                        const allowBboxOverflow = isNewLShaped && hole.isConcentricHole;
                        // Максимальный вынос bbox за пределы отверстия:
                        // ~25% bbox (размер пустого квадранта)
                        const overflowMargin = allowBboxOverflow
                            ? Math.round(Math.min(hPrepared.bbox.width, hPrepared.bbox.height) * 0.25)
                            : 0;

                        for (let hy = holeSheetY + minGap; hy + hPrepared.bbox.height <= holeSheetY + effectiveHoleH - minGap + overflowMargin; hy += stepY) {
                            for (let hx = holeSheetX + minGap; hx + hPrepared.bbox.width <= holeSheetX + effectiveHoleW - minGap + overflowMargin; hx += stepX) {
                                if (hx < edgeGap || hy < edgeGap ||
                                    hx + hPrepared.bbox.width > sheetWidth - edgeGap ||
                                    hy + hPrepared.bbox.height > sheetHeight - edgeGap) continue;

                                // v3.53: Проверяем через occupancy grid: деталь должна быть
                                

                                

                                

                                

                                

                                

                                const localPt = N.sheetToLocal(hx, hy, placed.x || 0, placed.y || 0, placedAngle, placedW, placedH, origPlacedW, origPlacedH);
                                if (allowBboxOverflow) {
                                    // L-деталь в кольце: проверяем через gridsOverlap
                                    

                                    const gPlacedAngleDeg = Math.abs(Math.round(placedAngle * 180 / Math.PI) % 360);
                                    if (N.gridsOverlap(newPart, hx, hy, hPrepared.bbox.width, hPrepared.bbox.height, hAngleDeg,
                                        placed.part, placed.x || 0, placed.y || 0, placedW, placedH, gPlacedAngleDeg, 0)) continue;
                                } else {
                                    if (!N.isRectInPartHole(placed.part, localPt.x, localPt.y, hPrepared.bbox.width, hPrepared.bbox.height, minGap)) continue;
                                }

                                // Проверяем столкновение с другими деталями на листе
                                const phull = N.translatePolygon(hPrepared.normalizedHull, hx, hy);
                                if (!N.isPolygonInsideSheet(phull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;

                                let canPlace = true;
                                const toCheck = spatialGrid
                                    ? N.getNearbyParts(spatialGrid, hx - minGap, hy - minGap, hPrepared.bbox.width + minGap * 2, hPrepared.bbox.height + minGap * 2)
                                    : placedParts;

                                for (const other of toCheck) {
                                    if (other === placed) {
                                        // v3.42→v3.69: SAFETY NET — проверяем hull хоста,
                                        // даже если isRectInPartHole вернул true.
                                        

                                        

                                        

                                        // v3.69: Для деталей с _hasHoles — БОЛЬШЕ НЕ
                                        

                                        

                                        const hostHoles2 = N.getPartHoles(placed.part);
                                        // v3.53: Проверяем конкретное отверстие, а не все
                                        const isConcentric2 = hostHoles2.some(h2 =>
                                            h2.isConcentricHole &&
                                            localPt.x + hPrepared.bbox.width > h2.x && localPt.x < h2.x + h2.width &&
                                            localPt.y + hPrepared.bbox.height > h2.y && localPt.y < h2.y + h2.height
                                        );
                                        const hostVerts2 = placed.positionedHull?.length || 0;
                                        const isConvexRect2 = hostVerts2 === 4;
                                        const hostHasHoles2 = (placed.part && placed.part._hasHoles === true) || hostHoles2.length > 0;
                                        if (!isConcentric2 && !isConvexRect2 && !hostHasHoles2 && placed.positionedHull?.length >= 3 && phull.length >= 3) {
                                            // Хост без отверстий — стандартная hull-проверка
                                            if (N.polygonsIntersect(phull, placed.positionedHull, minGap)) {
                                                canPlace = false; break;
                                            }
                                        } else if ((isConcentric2 || hostHasHoles2 || isConvexRect2) && placed.positionedHull?.length >= 3 && phull.length >= 3) {
                                            // v3.96: Концентрические круги, хост с отверстиями
                                            

                                            

                                            

                                            

                                            

                                            

                                            

                                            if (N.polygonsIntersect(phull, placed.positionedHull, 0)) {
                                                const gPlacedAngleDeg = Math.abs(Math.round(placedAngle * 180 / Math.PI) % 360);
                                                // v3.84: minGap=0 для gridsOverlap при hole-размещении!
                                                if (N.gridsOverlap(newPart, hx, hy, hPrepared.bbox.width, hPrepared.bbox.height, hAngleDeg,
                                                    placed.part, placed.x || 0, placed.y || 0, placedW, placedH, gPlacedAngleDeg, 0)) {
                                                    console.warn(`🕳️ [HOLE-PLACE SAFETY] gridsOverlap: деталь на материале хоста → ОТКАЗ`,
                                                        `часть="${newPart.name||newPart.id}" хост="${placed.partId}"`,
                                                        `isConcentric=${isConcentric2} isConvexRect=${isConvexRect2} hasHoles=${hostHasHoles2}`);
                                                    canPlace = false; break;
                                                }
                                            }
                                        }
                                        continue;
                                    }

                                    if (other.positionedHull?.length) {
                                        if (N.polygonsIntersect(phull, other.positionedHull, minGap)) { canPlace = false; break; }
                                    } else {
                                        const ow = other.width || other.bboxWidth || 0;
                                        const oh = other.height || other.bboxHeight || 0;
                                        if (hx < other.x + ow + minGap && hx + hPrepared.bbox.width + minGap > other.x &&
                                            hy < other.y + oh + minGap && hy + hPrepared.bbox.height + minGap > other.y) {
                                            canPlace = false; break;
                                        }
                                    }
                                }

                                if (canPlace) {
                                    // Hole-Place: в дыру
                                    newPart._holePlaceCount = (newPart._holePlaceCount || 0) + 1;
                                    return {
                                        x: hx, y: hy, rotation: hRotation, angle: hAngleRad,
                                        positionedHull: phull,
                                        positionedPolygons: N.computePositionedPolygons(newPart, hx, hy, hAngleRad),
                                        refPoint: hPrepared.refPoint,
                                        bboxWidth: hPrepared.bbox.width,
                                        bboxHeight: hPrepared.bbox.height
                                    };
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════
    

    

    

    if (placedParts.length > 0 && !isCircular) {
        let lastSame = [...placedParts].reverse().find(p => p.partId === newPart.id);
        N.debug(`[QP-ENTRY] "${newPart.name||newPart.id}": placedParts=${placedParts.length}, lastSame=${lastSame ? `@${Math.round(lastSame.angle*180/Math.PI)}°` : 'null'}, batchAngles=[${newPart._batchAngles||[]}]`);
        if (lastSame) {
            const lAngle = lastSame.angle || 0;
            const lAngleDeg = Math.round(lAngle * 180 / Math.PI) % 360;

            // v3.41: Проверяем, разрешён ли угол для Quick-Place.
            

            // и угол lastSame не входит в их число — Quick-Place
            

            

            

            const qpAllowedAngles = newPart._batchAngles || (newPart.allowedAngles && newPart.allowedAngles.length > 0 ? N.getRotationAngles(newPart, placedParts.length === 0) : null);
            if (qpAllowedAngles && qpAllowedAngles.length > 0) {
                const lNorm = ((lAngleDeg % 360) + 360) % 360;
                const isQPAngleAllowed = qpAllowedAngles.some(a => {
                    const aNorm = ((a % 360) + 360) % 360;
                    return Math.abs(aNorm - lNorm) < 1; // допуск 1°
                });
                if (!isQPAngleAllowed) {
                    // Quick-Place: угол не в разрешённых
                    N.debug(`[QP-ENTRY] skip: angle ${lAngleDeg}° not in [${qpAllowedAngles}]`);
                    lastSame = null; // Skip Quick-Place → fall through to Best-fit
                }
            }
        }
        if (lastSame) {
            const lAngle = lastSame.angle || 0;
            const lAngleDeg = Math.round(lAngle * 180 / Math.PI) % 360;
            const lW = lastSame.width || lastSame.bboxWidth || 0;
            const lH = lastSame.height || lastSame.bboxHeight || 0;
            const lRot = lastSame.rotation || 0;
            const qPrepared = N.prepareRotatedHull(partHull, lAngle, centerX, centerY);

            // ═══════════════════════════════════════════════════
            

            

            // 1) «вслед» — правее (тот же ряд)
            

            //    Y = макс. нижняя граница деталей в X-диапазоне нового ряда
            

            

            

            


            const isLH = N.isLineHeavyPart(newPart);

            // ═══════════════════════════════════════════════════
            

            

            

            //
            // 1) «вслед:вложение» — тот же угол, горизонтальное
            

            

            

            

            

            // 2) «вложение:прямо» — тот же угол, вертикальное
            

            

            

            // Выбираем вариант с минимальным BLF-score.
            

            

            

            

            

            

            const trulyLShaped = N.isTrueLShaped(newPart);
            const isTriangle = typeof N.isTrianglePart === 'function' && N.isTrianglePart(newPart);
            const fg = (isLH || isTriangle) ? N.getFilledOccupancyGrid(newPart, N.getAdaptiveGridSize(newPart, 3)) : null;
            const hasValidGrid = fg && fg.gw > 0 && fg.gh >= 2 && fg.grid.some(c => c === 1);

            // v3.51: Для НЕ Г-образных деталей с отверстиями (пазы, щели)
            

            

            

            // где выступ одной детали входит в пустоту другой.
            

            

            

            if (hasValidGrid && (trulyLShaped || isTriangle)) {
                const nestCandidates = [];
                const batchAngles = newPart._batchAngles || [];
                const hasInterlockingPair = batchAngles.includes(0) && batchAngles.includes(180);
                N.debug(`[PAIR-BRANCH] "${newPart.name||newPart.id}": isTriangle=${isTriangle}, trulyLShaped=${trulyLShaped}, hasValidGrid=${hasValidGrid}, batchAngles=[${batchAngles}], hasInterlockingPair=${hasInterlockingPair}`);

                // ═══════════════════════════════════════════════════════════
                

                

                

                // Логика:
                // 1) Считаем сколько деталей уже размещено при 0° и 180°
                

                

                

                

                


                if (hasInterlockingPair) {
                    // Считаем размещённые детали по углам
                    const sameTypePlaced = placedParts.filter(p => p.partId === newPart.id);
                    const count0 = sameTypePlaced.filter(p => {
                        const deg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                        return deg === 0;
                    }).length;
                    const count180 = sameTypePlaced.filter(p => {
                        const deg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                        return deg === 180;
                    }).length;

                    // Определяем целевой угол
                    let targetAngleDeg, targetReason;
                    if (count0 > count180) {
                        // Нужно 180° — завершаем пару, вкладываемся в последний 0°
                        targetAngleDeg = 180;
                        targetReason = 'пара:⌐вГ';
                    } else {
                        // Нужно 0° — начинаем новую пару, правее всех
                        targetAngleDeg = 0;
                        targetReason = 'пара:Г→';
                    }

                    const targetAngleRad = targetAngleDeg * Math.PI / 180;
                    const targetRotation = (targetAngleDeg % 360 >= 45 && targetAngleDeg % 360 <= 135) ||
                                          (targetAngleDeg % 360 >= 225 && targetAngleDeg % 360 <= 315) ? 1 : 0;
                    const targetPrepared = N.prepareRotatedHull(partHull, targetAngleRad, centerX, centerY);

                    if (targetAngleDeg === 180 && count0 > count180) {
                        // ─── Размещаем 180° вложением в последний 0° ───
                        const last0Part = [...sameTypePlaced].reverse().find(p => {
                            const deg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                            return deg === 0;
                        });

                        if (last0Part) {
                            const refX = last0Part.x || 0;
                            const refY = last0Part.y || 0;
                            const refW = last0Part.width || last0Part.bboxWidth || 0;
                            const refH = last0Part.height || last0Part.bboxHeight || 0;

                            // ═══════════════════════════════════════════════════════════
                            

                            

                            //   x = refX + refW/2, y = refY (same Y, shifted right by half-width)
                            

                            

                            

                            

                            if (isTriangle) {
                                // v4.31: Аналитическая ideal-позиция для interlocking 0°+180°.
                                

                                

                                

                                

                                // Формула: dx = rightApexX + minGap * sqrt(H² + (W-rightApexX)²) / H
                                

                                

                                

                                // ВНИМАНИЕ: это нижняя граница. Реальная позиция может быть
                                

                                

                                const apexInfo = (typeof N.findTriangleApexInfo === 'function') ? N.findTriangleApexInfo(newPart) : null;
                                let idealX;
                                if (apexInfo && apexInfo.height > 0) {
                                    const ax = apexInfo.rightApexX;
                                    const H = apexInfo.height;
                                    const W = apexInfo.width;
                                    const edgeLen = Math.sqrt(H * H + (W - ax) * (W - ax));
                                    idealX = refX + Math.round(ax + minGap * edgeLen / H);
                                    N.debug(`[PAIR-IDEAL] "${newPart.name||newPart.id}": apex ax=${ax.toFixed(1)}, H=${H.toFixed(1)}, W=${W.toFixed(1)}, edgeLen=${edgeLen.toFixed(1)}, idealX=${idealX} (was ${refX + Math.round(refW / 2) + minGap})`);
                                } else {
                                    // Fallback: старая симметричная формула
                                    idealX = refX + Math.round(refW / 2) + minGap;
                                }
                                const idealY = refY;
                                if (idealX + targetPrepared.bbox.width <= sheetWidth - edgeGap &&
                                    idealY + targetPrepared.bbox.height <= sheetHeight - edgeGap) {
                                    const idealHull = N.translatePolygon(targetPrepared.normalizedHull, idealX, idealY);
                                    if (N.isPolygonInsideSheet(idealHull, sheetWidth, sheetHeight, minGap, edgeGap)) {
                                        let idealCanPlace = true;
                                        const idealToCheck = spatialGrid
                                            ? N.getNearbyParts(spatialGrid, idealX - minGap, idealY - minGap, targetPrepared.bbox.width + minGap * 2, targetPrepared.bbox.height + minGap * 2)
                                            : placedParts;
                                        for (const p of idealToCheck) {
                                            const pw = p.width || p.bboxWidth || 0;
                                            const ph = p.height || p.bboxHeight || 0;
                                            if (idealX + targetPrepared.bbox.width + minGap <= p.x || p.x + pw + minGap <= idealX ||
                                                idealY + targetPrepared.bbox.height + minGap <= p.y || p.y + ph + minGap <= idealY) continue;
                                            // v4.24: Для interlocking треугольников используем ТОЧНУЮ
                                            

                                            

                                            

                                            

                                            if (p.positionedHull?.length >= 3) {
                                                if (N.polygonsIntersect(idealHull, p.positionedHull, minGap)) { idealCanPlace = false; break; }
                                            } else if (p.part && N.isLineHeavyPart(p.part)) {
                                                const pAngleDeg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                                                if (N.gridsOverlap(newPart, idealX, idealY, targetPrepared.bbox.width, targetPrepared.bbox.height, targetAngleDeg,
                                                    p.part, p.x, p.y, pw, ph, pAngleDeg, minGap)) { idealCanPlace = false; break; }
                                            } else { idealCanPlace = false; break; }
                                        }
                                        if (idealCanPlace) {
                                            nestCandidates.push({
                                                x: idealX, y: idealY, rotation: targetRotation, angle: targetAngleRad,
                                                positionedHull: idealHull,
                                                positionedPolygons: N.computePositionedPolygons(newPart, idealX, idealY, targetAngleRad),
                                                refPoint: targetPrepared.refPoint,
                                                bboxWidth: targetPrepared.bbox.width, bboxHeight: targetPrepared.bbox.height,
                                                reason: targetReason + ':interlock',
                                                blfScore: idealY * sheetWidth + idealX
                                            });
                                            // Перепрыгиваем сканирование — идеальная позиция найдена
                                            

                                        }
                                    }
                                }
                            }

                            // v4.24: Если идеальная interlocking-позиция для треугольника
                            

                            if (nestCandidates.length === 0) {
                            // v4.31: Тонкий скан начиная с позиции близко к analytical ideal.
                            

                            

                            //  но 325 отвергалось из-за micro-collision, бралось 348 или 394).
                            

                            

                            const sXMin = refX + Math.round(refW * 0.45);
                            const sXMax = refX + refW + minGap;
                            const sXStep = 3;
                            const sYStep = Math.max(3, Math.round(Math.min(targetPrepared.bbox.height * 0.04, 8)));
                            const sYMin = Math.max(edgeGap, refY);
                            const sYMax = refY + refH;

                            for (let tryX = sXMin; tryX <= sXMax; tryX += sXStep) {
                                if (tryX + targetPrepared.bbox.width > sheetWidth - edgeGap) continue;
                                for (let tryY = sYMin; tryY <= sYMax; tryY += sYStep) {
                                    if (tryY + targetPrepared.bbox.height > sheetHeight - edgeGap) continue;

                                    const testHull = N.translatePolygon(targetPrepared.normalizedHull, tryX, tryY);
                                    if (!N.isPolygonInsideSheet(testHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;

                                    let canPlace = true;
                                    const toCheck = spatialGrid
                                        ? N.getNearbyParts(spatialGrid, tryX - minGap, tryY - minGap, targetPrepared.bbox.width + minGap * 2, targetPrepared.bbox.height + minGap * 2)
                                        : placedParts;
                                    for (const p of toCheck) {
                                        const pw = p.width || p.bboxWidth || 0;
                                        const ph = p.height || p.bboxHeight || 0;
                                        if (tryX + targetPrepared.bbox.width + minGap <= p.x || p.x + pw + minGap <= tryX ||
                                            tryY + targetPrepared.bbox.height + minGap <= p.y || p.y + ph + minGap <= tryY) continue;
                                        // v4.35: Для Г-образных деталей с закруглёнными углами
                                        

                                        

                                        

                                        

                                        if (trulyLShaped && p.part) {
                                            // Polygon-based проверка для Г-образных
                                            const idealPolys = N.computePositionedPolygons(newPart, tryX, tryY, targetAngleRad);
                                            const placedPolys = p.positionedPolygons ||
                                                N.computePositionedPolygons(p.part, p.x, p.y, p.angle || 0);
                                            let polyOverlap = false;
                                            for (const ip of idealPolys) {
                                                if (ip.length < 3) continue;
                                                for (const pp of placedPolys) {
                                                    if (pp.length < 3) continue;
                                                    if (N.polygonsIntersect(ip, pp, minGap)) {
                                                        polyOverlap = true; break;
                                                    }
                                                }
                                                if (polyOverlap) break;
                                            }
                                            if (polyOverlap) { canPlace = false; break; }
                                        } else if (p.part && N.isLineHeavyPart(p.part)) {
                                            const pAngleDeg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                                            if (N.gridsOverlap(newPart, tryX, tryY, targetPrepared.bbox.width, targetPrepared.bbox.height, targetAngleDeg,
                                                p.part, p.x, p.y, pw, ph, pAngleDeg, minGap)) { canPlace = false; break; }
                                        } else if (p.positionedHull?.length) {
                                            if (N.polygonsIntersect(testHull, p.positionedHull, minGap)) { canPlace = false; break; }
                                        } else { canPlace = false; break; }
                                    }

                                    if (canPlace) {
                                        const overlapX = tryX < refX + refW && tryX + targetPrepared.bbox.width > refX;
                                        const overlapY = tryY < refY + refH && tryY + targetPrepared.bbox.height > refY;
                                        if (overlapX && overlapY) {
                                            nestCandidates.push({
                                                x: tryX, y: tryY, rotation: targetRotation, angle: targetAngleRad,
                                                positionedHull: testHull,
                                                positionedPolygons: N.computePositionedPolygons(newPart, tryX, tryY, targetAngleRad),
                                                refPoint: targetPrepared.refPoint,
                                                bboxWidth: targetPrepared.bbox.width, bboxHeight: targetPrepared.bbox.height,
                                                reason: targetReason,
                                                blfScore: tryY * sheetWidth + tryX
                                            });
                                            break;
                                        }
                                    }
                                }
                                if (nestCandidates.length > 0 && nestCandidates[nestCandidates.length-1].reason === targetReason) break;
                            }
                            } // end if (nestCandidates.length === 0) — scan skip guard
                        }
                    } else {
                        // ─── Размещаем 0° правее в текущем ряду (новая пара) ───
                        

                        // чтобы продолжать текущий ряд после заполнения предыдущего.
                        

                        

                        


                        

                        

                        

                        

                        

                        // позиции). Это позволяет создать цепочку 0°-180°-0°-180°
                        

                        

                        if (isTriangle) {
                            // Находим последний размещённый 180° элемент (для interlock)
                            const last180ForRow = [...sameTypePlaced].reverse().find(p => {
                                const deg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                                return deg === 180;
                            });

                            N.debug(`[CHAIN] "${newPart.name||newPart.id}": count0=${count0}, count180=${count180}, last180Found=${!!last180ForRow}`);

                            if (last180ForRow) {
                                const refX = last180ForRow.x || 0;
                                const refY = last180ForRow.y || 0;
                                const refW = last180ForRow.width || last180ForRow.bboxWidth || 0;
                                const refH = last180ForRow.height || last180ForRow.bboxHeight || 0;

                                // v4.31: Аналитическая ideal-позиция для 180°→0° interlock.
                                

                                

                                

                                // начинающейся в (W - leftApexX, H) и идущей вниз-вправо.
                                

                                // Для параллельных рёбер с зазором minGap:
                                //   dx = (W - leftApexX) + minGap * sqrt(H² + leftApexX²) / H
                                const apexInfo = (typeof N.findTriangleApexInfo === 'function') ? N.findTriangleApexInfo(newPart) : null;
                                let idealX;
                                if (apexInfo && apexInfo.height > 0) {
                                    const axL = apexInfo.leftApexX;
                                    const H = apexInfo.height;
                                    const W = apexInfo.width;
                                    const edgeLen = Math.sqrt(H * H + axL * axL);
                                    idealX = refX + Math.round((W - axL) + minGap * edgeLen / H);
                                    N.debug(`[CHAIN-IDEAL] "${newPart.name||newPart.id}": apex leftAx=${axL.toFixed(1)}, H=${H.toFixed(1)}, W=${W.toFixed(1)}, edgeLen=${edgeLen.toFixed(1)}, idealX=${idealX} (was ${refX + Math.round(refW / 2) + minGap})`);
                                } else {
                                    // Fallback: старая симметричная формула
                                    idealX = refX + Math.round(refW / 2) + minGap;
                                }
                                const idealY = refY;
                                let triangleChainFound = false;

                                N.debug(`[CHAIN] "${newPart.name||newPart.id}": last180 at (${refX},${refY}) ${refW}x${refH}, ideal=(${idealX},${idealY})`);

                                if (idealX + targetPrepared.bbox.width <= sheetWidth - edgeGap &&
                                    idealY + targetPrepared.bbox.height <= sheetHeight - edgeGap) {
                                    const idealHull = N.translatePolygon(targetPrepared.normalizedHull, idealX, idealY);
                                    if (N.isPolygonInsideSheet(idealHull, sheetWidth, sheetHeight, minGap, edgeGap)) {
                                        let idealCanPlace = true;
                                        let idealRejectReason = '';
                                        const idealToCheck = spatialGrid
                                            ? N.getNearbyParts(spatialGrid, idealX - minGap, idealY - minGap, targetPrepared.bbox.width + minGap * 2, targetPrepared.bbox.height + minGap * 2)
                                            : placedParts;
                                        for (const p of idealToCheck) {
                                            const pw = p.width || p.bboxWidth || 0;
                                            const ph = p.height || p.bboxHeight || 0;
                                            if (idealX + targetPrepared.bbox.width + minGap <= p.x || p.x + pw + minGap <= idealX ||
                                                idealY + targetPrepared.bbox.height + minGap <= p.y || p.y + ph + minGap <= idealY) continue;
                                            if (p.positionedHull?.length >= 3) {
                                                if (N.polygonsIntersect(idealHull, p.positionedHull, minGap)) { idealCanPlace = false; idealRejectReason = `polygonsIntersect@${Math.round(p.x)},${Math.round(p.y)}`; break; }
                                            } else if (p.part && N.isLineHeavyPart(p.part)) {
                                                const pAngleDeg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                                                if (N.gridsOverlap(newPart, idealX, idealY, targetPrepared.bbox.width, targetPrepared.bbox.height, targetAngleDeg,
                                                    p.part, p.x, p.y, pw, ph, pAngleDeg, minGap)) { idealCanPlace = false; idealRejectReason = `gridsOverlap@${Math.round(p.x)},${Math.round(p.y)}`; break; }
                                            } else { idealCanPlace = false; idealRejectReason = `noHull@${Math.round(p.x)},${Math.round(p.y)}`; break; }
                                        }
                                        N.debug(`[CHAIN] ideal(${idealX},${idealY}): canPlace=${idealCanPlace} ${idealRejectReason}`);
                                        if (idealCanPlace) {
                                            nestCandidates.push({
                                                x: idealX, y: idealY, rotation: targetRotation, angle: targetAngleRad,
                                                positionedHull: idealHull,
                                                positionedPolygons: N.computePositionedPolygons(newPart, idealX, idealY, targetAngleRad),
                                                refPoint: targetPrepared.refPoint,
                                                bboxWidth: targetPrepared.bbox.width, bboxHeight: targetPrepared.bbox.height,
                                                reason: targetReason + ':chain-ideal',
                                                blfScore: idealY * sheetWidth + idealX
                                            });
                                            triangleChainFound = true;
                                        }
                                    } else {
                                        N.debug(`[CHAIN] ideal(${idealX},${idealY}): not inside sheet`);
                                    }
                                } else {
                                    N.debug(`[CHAIN] ideal(${idealX},${idealY}): out of sheet (need ${idealX + targetPrepared.bbox.width}≤${sheetWidth - edgeGap})`);
                                }

                                // Если ideal не сработал (скошенная геометрия) —
                                

                                

                                

                                

                                if (!triangleChainFound) {
                                    const chainXMin = refX + Math.round(refW * 0.45);
                                    const chainXMax = refX + refW + minGap;
                                    const chainXStep = 3;
                                    const chainYStep = Math.max(3, Math.round(targetPrepared.bbox.height * 0.04));
                                    const chainYMin = Math.max(edgeGap, refY);
                                    const chainYMax = refY + refH;
                                    let scanAttempts = 0, scanAccepted = 0;

                                    N.debug(`[CHAIN] scan: X[${chainXMin}-${chainXMax}] step=${chainXStep}, bbox.w=${targetPrepared.bbox.width}, sheetMax=${sheetWidth - edgeGap}`);
                                    for (let tryX = chainXMin; tryX <= chainXMax; tryX += chainXStep) {
                                        if (tryX + targetPrepared.bbox.width > sheetWidth - edgeGap) continue;
                                        for (let tryY = chainYMin; tryY <= chainYMax; tryY += chainYStep) {
                                            if (tryY + targetPrepared.bbox.height > sheetHeight - edgeGap) continue;
                                            const testHull = N.translatePolygon(targetPrepared.normalizedHull, tryX, tryY);
                                            if (!N.isPolygonInsideSheet(testHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;
                                            scanAttempts++;

                                            let canPlace = true;
                                            const toCheck = spatialGrid
                                                ? N.getNearbyParts(spatialGrid, tryX - minGap, tryY - minGap, targetPrepared.bbox.width + minGap * 2, targetPrepared.bbox.height + minGap * 2)
                                                : placedParts;
                                            for (const p of toCheck) {
                                                const pw = p.width || p.bboxWidth || 0;
                                                const ph = p.height || p.bboxHeight || 0;
                                                if (tryX + targetPrepared.bbox.width + minGap <= p.x || p.x + pw + minGap <= tryX ||
                                                    tryY + targetPrepared.bbox.height + minGap <= p.y || p.y + ph + minGap <= tryY) continue;
                                                if (p.positionedHull?.length >= 3) {
                                                    if (N.polygonsIntersect(testHull, p.positionedHull, minGap)) { canPlace = false; break; }
                                                } else if (p.part && N.isLineHeavyPart(p.part)) {
                                                    const pAngleDeg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                                                    if (N.gridsOverlap(newPart, tryX, tryY, targetPrepared.bbox.width, targetPrepared.bbox.height, targetAngleDeg,
                                                        p.part, p.x, p.y, pw, ph, pAngleDeg, minGap)) { canPlace = false; break; }
                                                } else { canPlace = false; break; }
                                            }
                                            if (canPlace) {
                                                // Только если есть перекрытие по bbox с 180° (значит вкладывается)
                                                const overlapX = tryX < refX + refW && tryX + targetPrepared.bbox.width > refX;
                                                const overlapY = tryY < refY + refH && tryY + targetPrepared.bbox.height > refY;
                                                if (overlapX && overlapY) {
                                                    nestCandidates.push({
                                                        x: tryX, y: tryY, rotation: targetRotation, angle: targetAngleRad,
                                                        positionedHull: testHull,
                                                        positionedPolygons: N.computePositionedPolygons(newPart, tryX, tryY, targetAngleRad),
                                                        refPoint: targetPrepared.refPoint,
                                                        bboxWidth: targetPrepared.bbox.width, bboxHeight: targetPrepared.bbox.height,
                                                        reason: targetReason + ':chain-scan',
                                                        blfScore: tryY * sheetWidth + tryX
                                                    });
                                                    triangleChainFound = true;
                                                    scanAccepted++;
                                                    break;
                                                }
                                            }
                                        }
                                        if (triangleChainFound) break;
                                    }
                                    N.debug(`[CHAIN] scan: attempts=${scanAttempts}, accepted=${scanAccepted}, found=${triangleChainFound}`);
                                }
                            }
                        }

                        // Находим последний размещённый 0° элемент (определяет текущий ряд)
                        const last0ForRow = [...sameTypePlaced].reverse().find(p => {
                            const deg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                            return deg === 0;
                        });

                        let rightmostX = 0;
                        let bestY = edgeGap;

                        if (last0ForRow) {
                            const rowY = last0ForRow.y || edgeGap;
                            const rowH = last0ForRow.height || last0ForRow.bboxHeight || 0;
                            // Y-допуск: включаем детали пары (0° + 180°) в текущем ряду,
                            // но исключаем детали из других рядов.
                            

                            // поэтому допуск = rowH + minGap - 1 не захватит следующий ряд.
                            const yTol = rowH + minGap - 1;

                            for (const p of sameTypePlaced) {
                                const pw = p.width || p.bboxWidth || 0;
                                const pY = p.y || 0;
                                if (Math.abs(pY - rowY) <= yTol) {
                                    const right = (p.x || 0) + pw;
                                    if (right > rightmostX) {
                                        rightmostX = right;
                                    }
                                }
                            }
                            bestY = rowY; // Y последнего 0° — туда ставим новый 0°
                        } else {
                            // Fallback: нет 0° деталей — ищем по всем
                            for (const p of sameTypePlaced) {
                                const pw = p.width || p.bboxWidth || 0;
                                const right = (p.x || 0) + pw;
                                if (right > rightmostX) {
                                    rightmostX = right;
                                    bestY = p.y || edgeGap;
                                }
                            }
                        }

                        // Пробуем разместить 0° деталь правее, на том же Y
                        const tryX = rightmostX + minGap;
                        const tryYBase = bestY;

                        // Сначала пробуем на том же Y
                        for (let tryY = tryYBase; tryY <= tryYBase + targetPrepared.bbox.height; tryY += Math.max(3, Math.round(targetPrepared.bbox.height * 0.04))) {
                            if (tryX + targetPrepared.bbox.width > sheetWidth - edgeGap) break;
                            if (tryY + targetPrepared.bbox.height > sheetHeight - edgeGap) continue;

                            const testHull = N.translatePolygon(targetPrepared.normalizedHull, tryX, tryY);
                            if (!N.isPolygonInsideSheet(testHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;

                            let canPlace = true;
                            const toCheck = spatialGrid
                                ? N.getNearbyParts(spatialGrid, tryX - minGap, tryY - minGap, targetPrepared.bbox.width + minGap * 2, targetPrepared.bbox.height + minGap * 2)
                                : placedParts;
                            for (const p of toCheck) {
                                const pw = p.width || p.bboxWidth || 0;
                                const ph = p.height || p.bboxHeight || 0;
                                if (tryX + targetPrepared.bbox.width + minGap <= p.x || p.x + pw + minGap <= tryX ||
                                    tryY + targetPrepared.bbox.height + minGap <= p.y || p.y + ph + minGap <= tryY) continue;
                                if (p.part && N.isLineHeavyPart(p.part)) {
                                    const pAngleDeg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                                    if (N.gridsOverlap(newPart, tryX, tryY, targetPrepared.bbox.width, targetPrepared.bbox.height, targetAngleDeg,
                                        p.part, p.x, p.y, pw, ph, pAngleDeg, minGap)) { canPlace = false; break; }
                                } else if (p.positionedHull?.length) {
                                    if (N.polygonsIntersect(testHull, p.positionedHull, minGap)) { canPlace = false; break; }
                                } else { canPlace = false; break; }
                            }

                            if (canPlace) {
                                nestCandidates.push({
                                    x: tryX, y: tryY, rotation: targetRotation, angle: targetAngleRad,
                                    positionedHull: testHull,
                                    positionedPolygons: N.computePositionedPolygons(newPart, tryX, tryY, targetAngleRad),
                                    refPoint: targetPrepared.refPoint,
                                    bboxWidth: targetPrepared.bbox.width, bboxHeight: targetPrepared.bbox.height,
                                    reason: targetReason,
                                    blfScore: tryY * sheetWidth + tryX
                                });
                                break;
                            }
                        }

                        // Если не поместилась правее — пробуем на новом ряду (ниже)
                        if (nestCandidates.length === 0) {
                            const tryX2 = edgeGap;
                            // Находим максимальный Y среди всех деталей
                            let maxBottomY = edgeGap;
                            for (const p of placedParts) {
                                const ph = p.height || p.bboxHeight || 0;
                                maxBottomY = Math.max(maxBottomY, (p.y || 0) + ph + minGap);
                            }

                            for (let tryY = maxBottomY; tryY + targetPrepared.bbox.height <= sheetHeight - edgeGap; tryY += Math.max(3, Math.round(targetPrepared.bbox.height * 0.04))) {
                                const testHull = N.translatePolygon(targetPrepared.normalizedHull, tryX2, tryY);
                                if (!N.isPolygonInsideSheet(testHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;

                                let canPlace = true;
                                const toCheck = spatialGrid
                                    ? N.getNearbyParts(spatialGrid, tryX2 - minGap, tryY - minGap, targetPrepared.bbox.width + minGap * 2, targetPrepared.bbox.height + minGap * 2)
                                    : placedParts;
                                for (const p of toCheck) {
                                    const pw = p.width || p.bboxWidth || 0;
                                    const ph = p.height || p.bboxHeight || 0;
                                    if (tryX2 + targetPrepared.bbox.width + minGap <= p.x || p.x + pw + minGap <= tryX2 ||
                                        tryY + targetPrepared.bbox.height + minGap <= p.y || p.y + ph + minGap <= tryY) continue;
                                    if (p.part && N.isLineHeavyPart(p.part)) {
                                        const pAngleDeg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                                        if (N.gridsOverlap(newPart, tryX2, tryY, targetPrepared.bbox.width, targetPrepared.bbox.height, targetAngleDeg,
                                            p.part, p.x, p.y, pw, ph, pAngleDeg, minGap)) { canPlace = false; break; }
                                    } else if (p.positionedHull?.length) {
                                        if (N.polygonsIntersect(testHull, p.positionedHull, minGap)) { canPlace = false; break; }
                                    } else { canPlace = false; break; }
                                }

                                if (canPlace) {
                                    nestCandidates.push({
                                        x: tryX2, y: tryY, rotation: targetRotation, angle: targetAngleRad,
                                        positionedHull: testHull,
                                        positionedPolygons: N.computePositionedPolygons(newPart, tryX2, tryY, targetAngleRad),
                                        refPoint: targetPrepared.refPoint,
                                        bboxWidth: targetPrepared.bbox.width, bboxHeight: targetPrepared.bbox.height,
                                        reason: 'пара:Г↵',
                                        blfScore: tryY * sheetWidth + tryX2
                                    });
                                    break;
                                }
                            }
                        }
                    }

                    // ─── Fallback: если парная стратегия не нашла позицию ───
                    

                    if (nestCandidates.length === 0) {
                        // Стратегия 1: Тот же угол, горизонтальное (вслед:вложение)
                        {
                            const hXMin = lastSame.x + minGap;
                            const hXMax = lastSame.x + lW + minGap;
                            const hXStep = Math.max(3, Math.round(lW * 0.04));
                            const hYStep = Math.max(3, Math.round(Math.min(qPrepared.bbox.height * 0.04, 8)));
                            const hYMin = Math.max(edgeGap, lastSame.y);
                            const hYMax = lastSame.y + lH;

                            for (let tryX = hXMin; tryX <= hXMax; tryX += hXStep) {
                                if (tryX + qPrepared.bbox.width > sheetWidth - edgeGap) continue;
                                for (let tryY = hYMin; tryY <= hYMax; tryY += hYStep) {
                                    if (tryY + qPrepared.bbox.height > sheetHeight - edgeGap) continue;
                                    const testHull = N.translatePolygon(qPrepared.normalizedHull, tryX, tryY);
                                    if (!N.isPolygonInsideSheet(testHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;
                                    let canPlace = true;
                                    const toCheckH = spatialGrid
                                        ? N.getNearbyParts(spatialGrid, tryX - minGap, tryY - minGap, qPrepared.bbox.width + minGap * 2, qPrepared.bbox.height + minGap * 2)
                                        : placedParts;
                                    for (const p of toCheckH) {
                                        const pw = p.width || p.bboxWidth || 0;
                                        const ph = p.height || p.bboxHeight || 0;
                                        if (tryX + qPrepared.bbox.width + minGap <= p.x || p.x + pw + minGap <= tryX ||
                                            tryY + qPrepared.bbox.height + minGap <= p.y || p.y + ph + minGap <= tryY) continue;
                                        if (p.part && N.isLineHeavyPart(p.part)) {
                                            const pAngleDeg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                                            if (N.gridsOverlap(newPart, tryX, tryY, qPrepared.bbox.width, qPrepared.bbox.height, lAngleDeg,
                                                p.part, p.x, p.y, pw, ph, pAngleDeg, minGap)) { canPlace = false; break; }
                                        } else if (p.positionedHull?.length) {
                                            if (N.polygonsIntersect(testHull, p.positionedHull, minGap)) { canPlace = false; break; }
                                        } else { canPlace = false; break; }
                                    }
                                    if (canPlace) {
                                        const overlapX = tryX < lastSame.x + lW && tryX + qPrepared.bbox.width > lastSame.x;
                                        const overlapY = tryY < lastSame.y + lH && tryY + qPrepared.bbox.height > lastSame.y;
                                        if (overlapX && overlapY) {
                                            nestCandidates.push({
                                                x: tryX, y: tryY, rotation: lRot, angle: lAngle,
                                                positionedHull: testHull,
                                                positionedPolygons: N.computePositionedPolygons(newPart, tryX, tryY, lAngle),
                                                refPoint: qPrepared.refPoint,
                                                bboxWidth: qPrepared.bbox.width, bboxHeight: qPrepared.bbox.height,
                                                reason: 'вслед:вложение',
                                                blfScore: tryY * sheetWidth + tryX
                                            });
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        // Стратегия 2: Тот же угол, вертикальное (вложение:прямо)
                        {
                            const sameStep = Math.max(3, Math.round(Math.min(qPrepared.bbox.height * 0.03, 10)));
                            for (let tryY = lastSame.y + minGap; tryY < lastSame.y + lH; tryY += sameStep) {
                                const tryX = edgeGap;
                                if (tryX + qPrepared.bbox.width > sheetWidth - edgeGap ||
                                    tryY + qPrepared.bbox.height > sheetHeight - edgeGap) continue;
                                const testHull = N.translatePolygon(qPrepared.normalizedHull, tryX, tryY);
                                if (!N.isPolygonInsideSheet(testHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;
                                let canNest = true;
                                const toCheckNest = spatialGrid
                                    ? N.getNearbyParts(spatialGrid, tryX - minGap, tryY - minGap, qPrepared.bbox.width + minGap * 2, qPrepared.bbox.height + minGap * 2)
                                    : placedParts;
                                for (const p of toCheckNest) {
                                    const pw = p.width || p.bboxWidth || 0;
                                    const ph = p.height || p.bboxHeight || 0;
                                    if (tryX + qPrepared.bbox.width + minGap <= p.x || p.x + pw + minGap <= tryX ||
                                        tryY + qPrepared.bbox.height + minGap <= p.y || p.y + ph + minGap <= tryY) continue;
                                    if (p.part && N.isLineHeavyPart(p.part)) {
                                        const pAngleDeg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                                        if (N.gridsOverlap(newPart, tryX, tryY, qPrepared.bbox.width, qPrepared.bbox.height, lAngleDeg,
                                            p.part, p.x, p.y, pw, ph, pAngleDeg, minGap)) { canNest = false; break; }
                                    } else if (p.positionedHull?.length) {
                                        if (N.polygonsIntersect(testHull, p.positionedHull, minGap)) { canNest = false; break; }
                                    } else { canNest = false; break; }
                                }
                                if (canNest) {
                                    nestCandidates.push({
                                        x: tryX, y: tryY, rotation: lRot, angle: lAngle,
                                        positionedHull: testHull,
                                        positionedPolygons: N.computePositionedPolygons(newPart, tryX, tryY, lAngle),
                                        refPoint: qPrepared.refPoint,
                                        bboxWidth: qPrepared.bbox.width, bboxHeight: qPrepared.bbox.height,
                                        reason: 'вложение:прямо',
                                        blfScore: tryY * sheetWidth + tryX
                                    });
                                    break;
                                }
                            }
                        }
                    }

                } else {
                    // ═══ Нет пары [0°,180°] — классические стратегии ═══

                    

                    {
                        const hXMin = lastSame.x + minGap;
                        const hXMax = lastSame.x + lW + minGap;
                        const hXStep = Math.max(3, Math.round(lW * 0.04));
                        const hYStep = Math.max(3, Math.round(Math.min(qPrepared.bbox.height * 0.04, 8)));
                        const hYMin = Math.max(edgeGap, lastSame.y);
                        const hYMax = lastSame.y + lH;

                        for (let tryX = hXMin; tryX <= hXMax; tryX += hXStep) {
                            if (tryX + qPrepared.bbox.width > sheetWidth - edgeGap) continue;
                            for (let tryY = hYMin; tryY <= hYMax; tryY += hYStep) {
                                if (tryY + qPrepared.bbox.height > sheetHeight - edgeGap) continue;
                                const testHull = N.translatePolygon(qPrepared.normalizedHull, tryX, tryY);
                                if (!N.isPolygonInsideSheet(testHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;
                                let canPlace = true;
                                const toCheckH = spatialGrid
                                    ? N.getNearbyParts(spatialGrid, tryX - minGap, tryY - minGap, qPrepared.bbox.width + minGap * 2, qPrepared.bbox.height + minGap * 2)
                                    : placedParts;
                                for (const p of toCheckH) {
                                    const pw = p.width || p.bboxWidth || 0;
                                    const ph = p.height || p.bboxHeight || 0;
                                    if (tryX + qPrepared.bbox.width + minGap <= p.x || p.x + pw + minGap <= tryX ||
                                        tryY + qPrepared.bbox.height + minGap <= p.y || p.y + ph + minGap <= tryY) continue;
                                    if (p.part && N.isLineHeavyPart(p.part)) {
                                        const pAngleDeg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                                        if (N.gridsOverlap(newPart, tryX, tryY, qPrepared.bbox.width, qPrepared.bbox.height, lAngleDeg,
                                            p.part, p.x, p.y, pw, ph, pAngleDeg, minGap)) { canPlace = false; break; }
                                    } else if (p.positionedHull?.length) {
                                        if (N.polygonsIntersect(testHull, p.positionedHull, minGap)) { canPlace = false; break; }
                                    } else { canPlace = false; break; }
                                }
                                if (canPlace) {
                                    const overlapX = tryX < lastSame.x + lW && tryX + qPrepared.bbox.width > lastSame.x;
                                    const overlapY = tryY < lastSame.y + lH && tryY + qPrepared.bbox.height > lastSame.y;
                                    if (overlapX && overlapY) {
                                        nestCandidates.push({
                                            x: tryX, y: tryY, rotation: lRot, angle: lAngle,
                                            positionedHull: testHull,
                                            positionedPolygons: N.computePositionedPolygons(newPart, tryX, tryY, lAngle),
                                            refPoint: qPrepared.refPoint,
                                            bboxWidth: qPrepared.bbox.width, bboxHeight: qPrepared.bbox.height,
                                            reason: 'вслед:вложение',
                                            blfScore: tryY * sheetWidth + tryX
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    // ─── Стратегия 2: Тот же угол, вертикальное (вложение:прямо) ───
                    {
                        const sameStep = Math.max(3, Math.round(Math.min(qPrepared.bbox.height * 0.03, 10)));
                        for (let tryY = lastSame.y + minGap; tryY < lastSame.y + lH; tryY += sameStep) {
                            const tryX = edgeGap;
                            if (tryX + qPrepared.bbox.width > sheetWidth - edgeGap ||
                                tryY + qPrepared.bbox.height > sheetHeight - edgeGap) continue;
                            const testHull = N.translatePolygon(qPrepared.normalizedHull, tryX, tryY);
                            if (!N.isPolygonInsideSheet(testHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;
                            let canNest = true;
                            const toCheckNest = spatialGrid
                                ? N.getNearbyParts(spatialGrid, tryX - minGap, tryY - minGap, qPrepared.bbox.width + minGap * 2, qPrepared.bbox.height + minGap * 2)
                                : placedParts;
                            for (const p of toCheckNest) {
                                const pw = p.width || p.bboxWidth || 0;
                                const ph = p.height || p.bboxHeight || 0;
                                if (tryX + qPrepared.bbox.width + minGap <= p.x || p.x + pw + minGap <= tryX ||
                                    tryY + qPrepared.bbox.height + minGap <= p.y || p.y + ph + minGap <= tryY) continue;
                                if (p.part && N.isLineHeavyPart(p.part)) {
                                    const pAngleDeg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                                    if (N.gridsOverlap(newPart, tryX, tryY, qPrepared.bbox.width, qPrepared.bbox.height, lAngleDeg,
                                        p.part, p.x, p.y, pw, ph, pAngleDeg, minGap)) { canNest = false; break; }
                                } else if (p.positionedHull?.length) {
                                    if (N.polygonsIntersect(testHull, p.positionedHull, minGap)) { canNest = false; break; }
                                } else { canNest = false; break; }
                            }
                            if (canNest) {
                                nestCandidates.push({
                                    x: tryX, y: tryY, rotation: lRot, angle: lAngle,
                                    positionedHull: testHull,
                                    positionedPolygons: N.computePositionedPolygons(newPart, tryX, tryY, lAngle),
                                    refPoint: qPrepared.refPoint,
                                    bboxWidth: qPrepared.bbox.width, bboxHeight: qPrepared.bbox.height,
                                    reason: 'вложение:прямо',
                                    blfScore: tryY * sheetWidth + tryX
                                });
                                break;
                            }
                        }
                    }
                } // конец else (нет пары [0,180])

                

                if (nestCandidates.length > 0) {
                    nestCandidates.sort((a, b) => a.blfScore - b.blfScore);
                    const best = nestCandidates[0];
                    const bestAngleDeg = Math.round((best.angle || 0) * 180 / Math.PI);
                    const choiceInfo = nestCandidates.length > 1
                        ? `, из ${nestCandidates.length} вар. [${nestCandidates.map(c => `${c.reason}:x=${Math.round(c.x)},y=${Math.round(c.y)}`).join(', ')}]`
                        : '';
                    N.debug(`⭕ QP: "${newPart.name||newPart.id}" → (${Math.round(best.x)},${Math.round(best.y)}), ${bestAngleDeg}°`);
                    newPart._qpLastReason = best.reason;
                    newPart._qpCount = (newPart._qpCount || 0) + 1;
                    // Убираем лишние поля перед возвратом
                    const { reason, blfScore, ...result } = best;
                    return result;
                }
            }

            // «Новый ряд»: учитываем ВСЕ детали, пересекающиеся по X
            

            let newRowY = lastSame.y + lH + minGap;
            const newPartXEnd = edgeGap + qPrepared.bbox.width;
            for (const p of placedParts) {
                const pw = p.width || p.bboxWidth || 0;
                const ph = p.height || p.bboxHeight || 0;
                if (edgeGap < (p.x || 0) + pw + minGap && newPartXEnd + minGap > (p.x || 0)) {
                    // v3.6: Для криволинейных деталей не учитываем
                    

                    

                    if (isLH && p.part && N.isLineHeavyPart(p.part)) continue;
                    newRowY = Math.max(newRowY, (p.y || 0) + ph + minGap);
                }
            }

            // «Под всеми»: ниже всех размещённых деталей
            let maxBottomY = 0;
            for (const p of placedParts) {
                maxBottomY = Math.max(maxBottomY, (p.y || 0) + (p.height || p.bboxHeight || 0));
            }

            const quickTries = [
                { x: lastSame.x + lW + minGap, y: lastSame.y, reason: 'вслед' },
                { x: edgeGap, y: newRowY, reason: 'новый ряд' },
            ];

            // v3.25: Для криволинейных деталей НЕ добавляем «вслед:обратн.» —
            

            


            

            

            if (maxBottomY + minGap > newRowY + 1) {
                quickTries.push({ x: edgeGap, y: maxBottomY + minGap, reason: 'под всеми' });
            }

            for (const qt of quickTries) {
                // v3.25: Все quick-tries используют тот же угол
                const qtPrepared = qPrepared;
                const qtAngle = lAngle;
                const qtAngleDeg = lAngleDeg;
                const qtRot = lRot;

                if (qt.x < edgeGap || qt.y < edgeGap ||
                    qt.x + qtPrepared.bbox.width > sheetWidth - edgeGap ||
                    qt.y + qtPrepared.bbox.height > sheetHeight - edgeGap) continue;

                // ═══════════════════════════════════════════════════
                

                // Если на листе только один тип деталей и «вслед»,
                // bbox-проверки достаточно — детальная не нужна.
                

                

                

                

                const isSingleType = placedParts.length > 0 && placedParts.every(p => p.partId === newPart.id);
                // v3.43: Для деталей с отверстиями (_hasHoles) НЕ используем
                

                // и bbox-проверки недостаточно (другие детали могут
                

                

                const hasHolesFlag = newPart._hasHoles === true;
                // v4.05: Для деталей с дугами (arc) тоже НЕ используем
                

                // и bbox-проверки недостаточно для обнаружения наложений.
                const hasArcs = (newPart.objects || []).some(o => N.getShapeType(o) === 'arc');
                const isSimpleFollow = qt.reason === 'вслед' && isSingleType && !isLH && !hasHolesFlag && !hasArcs;

                // Быстрая проверка по bbox
                let bboxOk = true;
                for (const p of placedParts) {
                    const pw = p.width || p.bboxWidth || 0;
                    const ph = p.height || p.bboxHeight || 0;
                    if (qt.x < p.x + pw + minGap && qt.x + qtPrepared.bbox.width + minGap > p.x &&
                        qt.y < p.y + ph + minGap && qt.y + qtPrepared.bbox.height + minGap > p.y) {
                        // v3.44: Для криволинейных деталей И деталей с отверстиями — пропускаем
                        

                        if ((isLH || hasHolesFlag) && p.part && (N.isLineHeavyPart(p.part) || p.part._hasHoles === true)) continue;
                        bboxOk = false; break;
                    }
                }
                if (!bboxOk) continue;

                // Детальная проверка — пропускаем для simple-follow
                if (!isSimpleFollow) {
                    const phull = N.translatePolygon(qtPrepared.normalizedHull, qt.x, qt.y);
                    if (!N.isPolygonInsideSheet(phull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;

                    let ok = true;
                    const toCheck = spatialGrid
                        ? N.getNearbyParts(spatialGrid, qt.x - minGap, qt.y - minGap, qtPrepared.bbox.width + minGap * 2, qtPrepared.bbox.height + minGap * 2)
                        : placedParts;
                    for (const p of toCheck) {
                        const pw = p.width || p.bboxWidth || 0;
                        const ph = p.height || p.bboxHeight || 0;
                        // Быстрый отсев: если bbox не пересекаются — точно ок
                        if (qt.x + qtPrepared.bbox.width + minGap <= p.x || p.x + pw + minGap <= qt.x ||
                            qt.y + qtPrepared.bbox.height + minGap <= p.y || p.y + ph + minGap <= qt.y) continue;

                        // v3.7: Grid-проверка для криволинейных деталей (с углами поворота)
                        

                        const pHasHoles = p.part && p.part._hasHoles === true;
                        const needsGrid = isLH || hasHolesFlag || (p.part && N.isLineHeavyPart(p.part)) || pHasHoles;
                        if (isLH && p.part && N.isLineHeavyPart(p.part)) {
                            const pAngleDeg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                            if (N.gridsOverlap(newPart, qt.x, qt.y, qtPrepared.bbox.width, qtPrepared.bbox.height, qtAngleDeg,
                                p.part, p.x, p.y, pw, ph, pAngleDeg, minGap)) { ok = false; break; }
                            continue;
                        }

                        // v3.43: Grid-проверка для деталей с отверстиями
                        if (needsGrid && p.positionedHull?.length) {
                            if (N.polygonsIntersect(phull, p.positionedHull, minGap)) {
                                // Hull показал пересечение — проверяем grid
                                

                                const newNeedsGrid = isLH || hasHolesFlag;
                                const placedNeedsGrid = (p.part && N.isLineHeavyPart(p.part)) || pHasHoles;
                                if (newNeedsGrid || placedNeedsGrid) {
                                    // FIX #12: Всегда передаём newPart как part1, p.part как part2.
                                    

                                    

                                    const pAngleDeg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                                    if (N.gridsOverlap(newPart, qt.x, qt.y, qtPrepared.bbox.width, qtPrepared.bbox.height, qtAngleDeg,
                                        p.part, p.x, p.y, pw, ph, pAngleDeg, minGap)) {
                                        ok = false; break;
                                    }
                                } else {
                                    ok = false; break;
                                }
                            }
                            continue;
                        }

                        if (p.positionedHull?.length) {
                            if (N.polygonsIntersect(phull, p.positionedHull, minGap)) { ok = false; break; }
                        } else {
                            if (qt.x < p.x + pw && qt.x + qtPrepared.bbox.width > p.x &&
                                qt.y < p.y + ph && qt.y + qtPrepared.bbox.height > p.y) { ok = false; break; }
                        }
                    }
                    if (!ok) continue;
                }

                // Успех! Всегда нужен positionedHull для результата
                const phull = N.translatePolygon(qtPrepared.normalizedHull, qt.x, qt.y);
                // Логируем только переходы (не каждый «вслед»)
                const isTransition = qt.reason !== 'вслед';
                if (isTransition || !newPart._qpLastReason || newPart._qpLastReason !== 'вслед') {
                    const fastLabel = isSimpleFollow ? ' ⚡' : '';
                    N.debug(`⭕ QP: "${newPart.name||newPart.id}" → (${Math.round(qt.x)},${Math.round(qt.y)}), ${Math.round(qtAngle*180/Math.PI)}°`);
                }
                newPart._qpLastReason = qt.reason;
                newPart._qpCount = (newPart._qpCount || 0) + 1;
                return { x: qt.x, y: qt.y, rotation: qtRot, angle: qtAngle, positionedHull: phull, positionedPolygons: N.computePositionedPolygons(newPart, qt.x, qt.y, qtAngle), refPoint: qtPrepared.refPoint, bboxWidth: qtPrepared.bbox.width, bboxHeight: qtPrepared.bbox.height };
            }
            // Quick-Place не удался — сбрасываем счётчик
            delete newPart._qpLastReason;
        }
    }

    // ═══════════════════════════════════════════════════
    

    

    

    

    

    if (placedParts.length > 0 && !isCircular) {
        const hasSameType = placedParts.some(p => p.partId === newPart.id);
        if (!hasSameType) {
            // Находим деталь с минимальным BLF-score (самую лево-нижнюю)
            const nearest = placedParts.reduce((best, p) => {
                const score = (p.y || 0) * sheetWidth + (p.x || 0);
                return score < best.score ? { part: p, score } : best;
            }, { part: null, score: Infinity });

            if (nearest.part) {
                const np = nearest.part;
                const npW = np.width || np.bboxWidth || 0;
                const npH = np.height || np.bboxHeight || 0;

                // FIX: используем allowedAngles/batchAngles/getRotationAngles,
                // а не просто 0° как fallback. Для деталей с выбранными чекбоксами
                

                // Пробуем ВСЕ разрешённые углы (как в Best-fit), а не только первый.
                const nAllAngles = newPart._batchAngles || N.getRotationAngles(newPart, placedParts.length === 0);

                for (const nAngleDeg of nAllAngles) {
                    const nAngleRad = nAngleDeg * Math.PI / 180;
                    const nRotation = (nAngleDeg % 360 >= 45 && nAngleDeg % 360 <= 135) || (nAngleDeg % 360 >= 225 && nAngleDeg % 360 <= 315) ? 1 : 0;
                    const nPrepared = N.prepareRotatedHull(partHull, nAngleRad, centerX, centerY);

                    // Y для нового ряда: учитываем ВСЕ детали в X-диапазоне
                    let nRowY = np.y + npH + minGap;
                    const nXEnd = edgeGap + nPrepared.bbox.width;
                    for (const p of placedParts) {
                        const pw = p.width || p.bboxWidth || 0;
                        const ph = p.height || p.bboxHeight || 0;
                        if (edgeGap < (p.x || 0) + pw + minGap && nXEnd + minGap > (p.x || 0)) {
                            nRowY = Math.max(nRowY, (p.y || 0) + ph + minGap);
                        }
                    }

                    // v3.90: Плотный ряд для повёрнутых деталей (кирпич + gridsOverlap)
                    let nDenseRowY = nRowY;
                    let nDenseRowX = edgeGap;
                    const nIsAxisAligned = nAngleDeg % 90 === 0;
                    if (!nIsAxisAligned) {
                        const nScanStep = Math.max(2, Math.round(nPrepared.bbox.height * 0.03));
                        const nSameType = placedParts.filter(p => p.partId === newPart.id);
                        const nHStep = nSameType.length >= 2
                            ? (nSameType[1].x || 0) - (nSameType[0].x || 0)
                            : (nPrepared.bbox.width + minGap);
                        const nXOffsets = [edgeGap];
                        const nBrick = Math.round(nHStep / 2);
                        if (nBrick > edgeGap && nBrick + nPrepared.bbox.width <= sheetWidth - edgeGap) nXOffsets.push(nBrick);
                        let nBestBLF = nRowY * sheetWidth + edgeGap;

                        for (const tryX of nXOffsets) {
                            for (let tryY = np.y + minGap; tryY < nRowY; tryY += nScanStep) {
                                if (tryY < edgeGap || tryY + nPrepared.bbox.height > sheetHeight - edgeGap) continue;
                                if (tryX + nPrepared.bbox.width > sheetWidth - edgeGap) continue;
                                const testHull = N.translatePolygon(nPrepared.normalizedHull, tryX, tryY);
                                if (!N.isPolygonInsideSheet(testHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;
                                let canPlace = true;
                                const toCheckN = spatialGrid
                                    ? N.getNearbyParts(spatialGrid, tryX - minGap, tryY - minGap, nPrepared.bbox.width + minGap * 2, nPrepared.bbox.height + minGap * 2)
                                    : placedParts;
                                for (const p of toCheckN) {
                                    const pw = p.width || p.bboxWidth || 0;
                                    const ph = p.height || p.bboxHeight || 0;
                                    if (tryX + nPrepared.bbox.width + minGap <= (p.x || 0) || (p.x || 0) + pw + minGap <= tryX ||
                                        tryY + nPrepared.bbox.height + minGap <= (p.y || 0) || (p.y || 0) + ph + minGap <= tryY) continue;
                                    if (p.positionedHull?.length) {
                                        if (N.polygonsIntersect(testHull, p.positionedHull, minGap)) {
                                            const pAngleDeg = Math.round((p.angle || 0) * 180 / Math.PI) % 360;
                                            if (N.gridsOverlap(newPart, tryX, tryY, nPrepared.bbox.width, nPrepared.bbox.height, nAngleDeg,
                                                p.part, p.x, p.y, pw, ph, pAngleDeg, minGap)) {
                                                canPlace = false; break;
                                            }
                                        }
                                    } else {
                                        canPlace = false; break;
                                    }
                                }
                                if (canPlace) {
                                    const blf = tryY * sheetWidth + tryX;
                                    if (blf < nBestBLF) {
                                        nBestBLF = blf;
                                        nDenseRowY = tryY;
                                        nDenseRowX = tryX;
                                    }
                                    break;
                                }
                            }
                        }
                    }

                    const neighborTries = [
                        { x: np.x + npW + minGap, y: np.y, reason: 'сосед:вслед' },
                        { x: edgeGap, y: nDenseRowY, reason: 'сосед:новый ряд' },
                    ];

                    for (const nt of neighborTries) {
                        if (nt.x < edgeGap || nt.y < edgeGap ||
                            nt.x + nPrepared.bbox.width > sheetWidth - edgeGap ||
                            nt.y + nPrepared.bbox.height > sheetHeight - edgeGap) continue;

                        const phull = N.translatePolygon(nPrepared.normalizedHull, nt.x, nt.y);
                        if (!N.isPolygonInsideSheet(phull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;

                        // Быстрая проверка по bbox
                        let bboxOk = true;
                        for (const p of placedParts) {
                            const pw = p.width || p.bboxWidth || 0;
                            const ph = p.height || p.bboxHeight || 0;
                            if (nt.x < p.x + pw + minGap && nt.x + nPrepared.bbox.width + minGap > p.x &&
                                nt.y < p.y + ph + minGap && nt.y + nPrepared.bbox.height + minGap > p.y) {
                                bboxOk = false; break;
                            }
                        }
                        if (!bboxOk) continue;

                        // Детальная проверка
                        let ok = true;
                        const toCheck = spatialGrid
                            ? N.getNearbyParts(spatialGrid, nt.x - minGap, nt.y - minGap, nPrepared.bbox.width + minGap * 2, nPrepared.bbox.height + minGap * 2)
                            : placedParts;
                        for (const p of toCheck) {
                            if (p.positionedHull?.length) {
                                if (N.polygonsIntersect(phull, p.positionedHull, minGap)) { ok = false; break; }
                            } else {
                                const pw = p.width || p.bboxWidth || 0;
                                const ph = p.height || p.bboxHeight || 0;
                                if (nt.x < p.x + pw && nt.x + nPrepared.bbox.width > p.x &&
                                    nt.y < p.y + ph && nt.y + nPrepared.bbox.height > p.y) { ok = false; break; }
                            }
                        }
                        if (ok) {
                            N.debug(`⭕ QP: "${newPart.name||newPart.id}" → (${Math.round(nt.x)},${Math.round(nt.y)}), ${nAngleDeg}°`);
                            return { x: nt.x, y: nt.y, rotation: nRotation, angle: nAngleRad, positionedHull: phull, positionedPolygons: N.computePositionedPolygons(newPart, nt.x, nt.y, nAngleRad), refPoint: nPrepared.refPoint, bboxWidth: nPrepared.bbox.width, bboxHeight: nPrepared.bbox.height };
                        }
                    }
                }
            }
        }
    }

    const rotationAngles = newPart._batchAngles || N.getRotationAngles(newPart, placedParts.length === 0);

    // ═══════════════════════════════════════════════════
    

    

    

    

    

    const angleInfo = [];
    for (const angleDeg of rotationAngles) {
        const angleRad = angleDeg * Math.PI / 180;
        const rotation = (angleDeg % 360 >= 45 && angleDeg % 360 <= 135) || (angleDeg % 360 >= 225 && angleDeg % 360 <= 315) ? 1 : 0;
        const prepared = N.prepareRotatedHull(partHull, angleRad, centerX, centerY);
        const fitsSheet = prepared.bbox.width + edgeGap * 2 <= sheetWidth && prepared.bbox.height + edgeGap * 2 <= sheetHeight;
        const copiesPerRow = fitsSheet ? Math.floor((sheetWidth - 2 * edgeGap + minGap) / (prepared.bbox.width + minGap)) : 0;
        const copiesPerCol = fitsSheet ? Math.floor((sheetHeight - 2 * edgeGap + minGap) / (prepared.bbox.height + minGap)) : 0;
        angleInfo.push({ angleDeg, angleRad, rotation, prepared, fitsSheet, copiesPerRow, copiesPerCol });
    }

    // Фильтруем: пропускаем углы с copiesPerRow < 50% от лучшего
    const maxCopiesPerRow = Math.max(0, ...angleInfo.map(a => a.copiesPerRow));
    const filteredAngles = angleInfo.filter(a => {
        if (!a.fitsSheet) return false;
        if (a.copiesPerRow === 0) return false;
        // Если лучший угол помещает ≥2x больше деталей — пропускаем слабые углы
        if (maxCopiesPerRow >= 2 && a.copiesPerRow < maxCopiesPerRow * 0.5) return false;
        return true;
    });

    const skippedAngles = angleInfo.filter(a => !filteredAngles.includes(a) && a.fitsSheet);
    if (skippedAngles.length > 0) {
        // Pre-filter: убраны углы с малым вРяду
    }

    // Сортируем по copiesPerRow по убыванию — пробуем самый эффективный угол первым
    filteredAngles.sort((a, b) => b.copiesPerRow - a.copiesPerRow);

    // ═══════════════════════════════════════════════════
    

    

    

    

    

    

    

    

    if (isCircular && placedParts.length > 0) {
        const prepared = N.prepareRotatedHull(partHull, 0, centerX, centerY);
        const cirResult = N.tryCircleInRingPlace(
            prepared.normalizedHull, prepared.refPoint, prepared.bbox,
            newPart, placedParts, sheetWidth, sheetHeight, minGap, edgeGap,
            cancelCallback, spatialGrid
        );
        if (cirResult) {
            return {
                x: cirResult.x, y: cirResult.y, rotation: cirResult.rotation || 0, angle: cirResult.angle || 0,
                positionedHull: cirResult.positionedHull,
                positionedPolygons: N.computePositionedPolygons(newPart, cirResult.x, cirResult.y, cirResult.angle || 0),
                refPoint: cirResult.refPoint,
                bboxWidth: cirResult.bboxWidth, bboxHeight: cirResult.bboxHeight
            };
        }
    }

    // ═══════════════════════════════════════════════════
    

    

    

    

    

    

    

    

    

    

    if (isCircular && placedParts.length > 0) {
        const prepared = N.prepareRotatedHull(partHull, 0, centerX, centerY);
        const cqpResult = N.tryCircleQuickPlace(
            prepared.normalizedHull, prepared.refPoint, prepared.bbox,
            newPart, placedParts, sheetWidth, sheetHeight, minGap, edgeGap,
            cancelCallback, spatialGrid
        );
        if (cqpResult) {
            // Проверяем что результат не пересекает уже размещённые
            const cqpHull = cqpResult.positionedHull;
            let cqpOk = true;
            const cqpCheck = spatialGrid
                ? N.getNearbyParts(spatialGrid, cqpResult.x - minGap, cqpResult.y - minGap, cqpResult.bboxWidth + minGap * 2, cqpResult.bboxHeight + minGap * 2)
                : placedParts;
            for (const placed of cqpCheck) {
                if (cancelCallback?.()) return null;
                const pw = placed.width || placed.bboxWidth || 0;
                const ph = placed.height || placed.bboxHeight || 0;
                if (placed.part && N.isCircularPart(placed.part)) {
                    const pr = N.getCircleDiameter(placed.part) / 2;
                    const newD = N.getCircleDiameter(newPart);
                    const nr = newD / 2;
                    const dist = Math.hypot((cqpResult.x + nr) - (placed.x + pr), (cqpResult.y + nr) - (placed.y + pr));
                    if (dist < nr + pr + minGap - 0.01) { cqpOk = false; break; }
                } else if (placed.positionedHull?.length) {
                    if (N.polygonsIntersect(cqpHull, placed.positionedHull, minGap)) { cqpOk = false; break; }
                } else {
                    if (cqpResult.x < placed.x + pw + minGap && cqpResult.x + cqpResult.bboxWidth + minGap > placed.x &&
                        cqpResult.y < placed.y + ph + minGap && cqpResult.y + cqpResult.bboxHeight + minGap > placed.y) {
                        cqpOk = false; break;
                    }
                }
            }
            if (cqpOk) {
                return {
                    x: cqpResult.x, y: cqpResult.y, rotation: cqpResult.rotation || 0, angle: cqpResult.angle || 0,
                    positionedHull: cqpHull,
                    positionedPolygons: N.computePositionedPolygons(newPart, cqpResult.x, cqpResult.y, cqpResult.angle || 0),
                    refPoint: cqpResult.refPoint,
                    bboxWidth: cqpResult.bboxWidth, bboxHeight: cqpResult.bboxHeight
                };
            }
        }
    }

    // ═══════════════════════════════════════════════════
    

    

    

    let bestResult = null;
    let bestScore = Infinity;
    let bestCopiesPerRow = 0;
    const angleResults = []; // Для сравнительного лога

    for (const info of filteredAngles) {
        if (cancelCallback?.()) return null;
        const { angleDeg, angleRad, rotation, prepared, copiesPerRow } = info;
        const { normalizedHull, refPoint, bbox } = prepared;

        if (isCircular) {
            const hex = N.tryHexagonalPacking(normalizedHull, refPoint, bbox, newPart, placedParts, sheetWidth, sheetHeight, minGap, edgeGap, cancelCallback, spatialGrid);
            if (hex) {
                const score = hex.y * sheetWidth + hex.x;
                const isBetter = score < bestScore || (score === bestScore && copiesPerRow > bestCopiesPerRow);
                if (isBetter) {
                    bestScore = score;
                    bestResult = hex;
                    bestCopiesPerRow = copiesPerRow;
                }
                angleResults.push({ angleDeg, score: Math.round(score), copiesPerRow, pos: `(${Math.round(hex.x)},${Math.round(hex.y)})` });
            } else {
                angleResults.push({ angleDeg, score: 'нет', copiesPerRow });
            }
            continue;
        }

        const candidates = N.generateCandidates(placedParts, bbox.width, bbox.height, sheetWidth, sheetHeight, minGap, edgeGap, newPart);
        if (!candidates.length) {
            angleResults.push({ angleDeg, score: 'нет кандидатов', copiesPerRow });
            continue;
        }

        const found = await N.checkCandidates(candidates, normalizedHull, refPoint, bbox, placedParts, sheetWidth, sheetHeight, minGap, edgeGap, angleRad, rotation, cancelCallback, newPart, spatialGrid);
        if (found) {
            const score = found.y * sheetWidth + found.x;
            const isBetter = score < bestScore || (score === bestScore && copiesPerRow > bestCopiesPerRow);
            if (isBetter) {
                bestScore = score;
                bestResult = found;
                bestCopiesPerRow = copiesPerRow;
            }
            angleResults.push({ angleDeg, score: Math.round(score), copiesPerRow, pos: `(${Math.round(found.x)},${Math.round(found.y)})` });
        } else {
            angleResults.push({ angleDeg, score: 'не влезла', copiesPerRow });
        }
    }

    if (bestResult) {
        const winnerDeg = Math.round((bestResult.angle || 0) * 180 / Math.PI);
        const comparison = angleResults.map(r => `${r.angleDeg}°:${r.score}(${r.copiesPerRow}вР.)`).join(' | ');
        N.debug(`📐 Best-fit: ${winnerDeg}° → (${Math.round(bestResult.x)},${Math.round(bestResult.y)}), вРяду=${bestCopiesPerRow}`);
    }

    return bestResult;
}
})(window.Nesting = window.Nesting || {});