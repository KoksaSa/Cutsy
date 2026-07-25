// ════════════════════════════════════════════════════════════════
// SilikinK Nesting Engine — Top-Level Nesting Orchestrator (Module 17)
// ════════════════════════════════════════════════════════════════
(function(N) {
    'use strict';

// v4.39 FIX #69/#70: изолируем DOM-зависимости для server-side совместимости.
// Раньше performNesting напрямую вызывал document.getElementById() и alert(),
// что блокировало использование в Node.js / Next.js SSR. Теперь helper-функции
// безопасно работают и в браузере, и в server-side окружении.
N._getUIValue = function _getUIValue(id) {
    if (typeof document === 'undefined') return null;
    try {
        const el = document.getElementById(id);
        return el ? el.value : null;
    } catch (e) { return null; }
};
N._alert = function _alert(msg) {
    if (typeof alert !== 'undefined' && typeof window !== 'undefined') {
        alert(msg);
    } else {
        console.warn('[NESTING]', msg);
    }
};

N.performNesting = async function performNesting(parts, sheetSize, existingNestedParts = [], cancelCallback = null) {
    const startTime = performance.now();
    const partsToNest = parts.filter(p => p.nestingEnabled !== false);

    N.info(`🚀 [NEST v${N.VERSION}] запущен: ${partsToNest.length} типов, лист ${sheetSize.width}x${sheetSize.height}`);

    N.clearPartHullCache();

    // v3.53: Нормализация типов объектов.
    // Классы из shapes.js (Circle, Rect, Arc) могут не иметь
    // свойства .type. Без этого getFilledOccupancyGrid и
    // extractConcaveOutline не распознают объекты → fillRate=30%
    // вместо 78% → hull patch восстанавливает дыры → мелкие
    // детали не размещаются внутри отверстий.
    for (const part of partsToNest) {
        if (!part.objects) continue;
        for (const obj of part.objects) {
            if (!obj.type) {
                obj.type = N.getShapeType(obj);
            }
        }
    }

    if (!parts.length) {
        N._alert('Сначала создайте детали');
        return null;
    }
    if (!partsToNest.length) {
        N._alert('Отметьте детали для раскладки');
        return null;
    }

    // ═══════════════════════════════════════════════════════
    // v3.39: Адаптивный N.SPATIAL_CELL_SIZE
    // Фиксированный 100мм — плохо для мелких (10мм) и
    // крупных (3000мм) деталей. Вычисляем медианный размер
    // и устанавливаем cell size ≈ 1.5× медианы.
    // ═══════════════════════════════════════════════════════
    const partSizes = partsToNest.map(p => Math.min(p.bounds.width, p.bounds.height)).filter(s => s > 0);
    if (partSizes.length > 0) {
        partSizes.sort((a, b) => a - b);
        const medianSize = partSizes[Math.floor(partSizes.length / 2)];
        N.SPATIAL_CELL_SIZE = Math.max(20, Math.min(500, medianSize * 1.5));
        // Адаптивный SPATIAL_CELL_SIZE=${N.SPATIAL_CELL_SIZE}мм
    }

    // performNesting запущен (сводка ниже)

    // BUG FIX #5: Sanity check остатка листа — проверяем, что контур
    // имеет рёбра и ray casting работает корректно. Без этого диагноза
    // все детали молча не размещаются и непонятно почему.
    // v4.60 FIX: Поддержка Web Worker — self.sheetRemnant вместо window.sheetRemnant
    let _remnantRef = null;
    if (typeof sheetRemnant !== 'undefined') _remnantRef = sheetRemnant;
    else if (typeof self !== 'undefined' && self.sheetRemnant) _remnantRef = self.sheetRemnant;
    else if (typeof window !== 'undefined' && window.sheetRemnant) _remnantRef = window.sheetRemnant;

    let _useRemnantFlag = false;
    if (typeof useRemnant !== 'undefined') _useRemnantFlag = useRemnant;
    else if (typeof self !== 'undefined' && typeof self.useRemnant !== 'undefined') _useRemnantFlag = self.useRemnant;
    else if (typeof window !== 'undefined' && typeof window.useRemnant !== 'undefined') _useRemnantFlag = window.useRemnant;
    if (_useRemnantFlag && _remnantRef?.outerContour?.length > 0) {
        // v4.60 FIX: isPointInsideContour и _buildContourEdges с поддержкой Worker
        let _ipc = null;
        if (typeof isPointInsideContour === 'function') _ipc = isPointInsideContour;
        else if (typeof self !== 'undefined' && typeof self.isPointInsideContour === 'function') _ipc = self.isPointInsideContour;
        else if (typeof window !== 'undefined' && typeof window.isPointInsideContour === 'function') _ipc = window.isPointInsideContour;

        let _bce = null;
        if (typeof _buildContourEdges === 'function') _bce = _buildContourEdges;
        else if (typeof self !== 'undefined' && typeof self._buildContourEdges === 'function') _bce = self._buildContourEdges;
        else if (typeof window !== 'undefined' && typeof window._buildContourEdges === 'function') _bce = window._buildContourEdges;

        const _edges = _bce ? _bce(_remnantRef.outerContour) : [];
        const _testX = sheetSize.width / 2;
        const _testY = sheetSize.height / 2;
        const _centerInside = _ipc ? _ipc(_testX, _testY, _remnantRef.outerContour) : null;
        const _cornerInside = _ipc ? _ipc(sheetSize.width * 0.1, sheetSize.height * 0.1, _remnantRef.outerContour) : null;

        // REMNANT sanity check (verbose logs removed)

        // Тестируем 9 точек (3×3 сетка)
        const _gridPts = [];
        for (let _gy = 0.25; _gy <= 0.75; _gy += 0.25) {
            for (let _gx = 0.25; _gx <= 0.75; _gx += 0.25) {
                const _px = sheetSize.width * _gx;
                const _py = sheetSize.height * _gy;
                const _inside = _ipc ? _ipc(_px, _py, _remnantRef.outerContour) : null;
                _gridPts.push({ x: _px.toFixed(0), y: _py.toFixed(0), inside: _inside });
            }
        }
        const _insideCount = _gridPts.filter(p => p.inside === true).length;
        // 9-point grid: ${_insideCount}/9 inside contour

        // Логируем типы и ключевые данные контурных объектов
        const _objSummary = _remnantRef.outerContour.map((o, i) => {
            const t = o.type || '?';
            if (t === 'line') return `[${i}]line(${(o.x1||0).toFixed(0)},${(o.y1||0).toFixed(0)})→(${(o.x2||0).toFixed(0)},${(o.y2||0).toFixed(0)})`;
            if (t === 'circle') return `[${i}]circle(${(o.cx||0).toFixed(0)},${(o.cy||0).toFixed(0)})r=${(o.radius||0).toFixed(0)}`;
            if (t === 'arc') return `[${i}]arc(${(o.cx||0).toFixed(0)},${(o.cy||0).toFixed(0)})r=${(o.radius||0).toFixed(0)} sa=${(o.startAngle||0).toFixed(2)} ea=${(o.endAngle||0).toFixed(2)}`;
            if (t === 'rect') return `[${i}]rect(${(o.x||0).toFixed(0)},${(o.y||0).toFixed(0)})${(o.width||0).toFixed(0)}×${(o.height||0).toFixed(0)}`;
            if (t === 'polygon') return `[${i}]polygon`;
            if (t === 'polyline' || t === 'lwpolyline') {
                const pts = o.points || o.vertices || [];
                return `[${i}]${t}(${pts.length}pts, closed=${o.closed}/${o.isClosed})`;
            }
            return `[${i}]${t}`;
        });
        // contour objects (${_remnantRef.outerContour.length}): (verbose)

        // Логируем первые 10 рёбер
        if (_edges.length > 0) {
            // first 10 edges: (verbose)
        }

        // Внутренние контуры (отверстия)
        if (_remnantRef.innerContours && _remnantRef.innerContours.length > 0) {
            // inner contours: ${_remnantRef.innerContours.length}
        }

        if (_edges.length === 0) {
            N.warn(`[REMNANT] 0 edges from ${_remnantRef.outerContour.length} objects!`);
        } else if (!_centerInside && !_cornerInside && _insideCount === 0) {
            N.warn(`[REMNANT] all 9 sample points outside contour — contour damaged`);
        }

        // Сброс счётчиков логов при новой раскладке
        if (typeof _ipcDebugCount !== 'undefined') _ipcDebugCount = 0;
    } else if (_useRemnantFlag) {
        // REMNANT: useRemnant=true but outerContour empty
    }
    // v3.27: Логируем allowedAngles для каждой детали
    // v3.35: Добавляем spacing в лог
    partsToNest.forEach(p => {
        const spacingInfo = typeof p.spacing === 'number' ? `, spacing=${p.spacing}мм` : '';
        N.debug(`📋 "${p.name || `#${p.id}`}" → ${p.quantity}шт${spacingInfo}`);
    });

    // FIX #8: Сортировка по realArea*0.7 + bboxArea*0.3 вместо чистого bboxArea.
    // Проблема: Круг Ø300 (bbox=90000, real=70685) идёт раньше
    // прямоугольника 250×250 (bbox=62500, real=62500).
    // Ещё хуже: Г-образная (bbox=300000, real=120000) — bbox завышен.
    // Взвешенная формула учитывает реальную площадь детали.
    const sortedParts = [...partsToNest].sort((a, b) => {
        const bboxA = a.bounds.width * a.bounds.height;
        const bboxB = b.bounds.width * b.bounds.height;
        // realArea: площадь hull (если есть) или bbox
        const realA = N.polygonArea(N.getPartBoundingHull(a)) || bboxA;
        const realB = N.polygonArea(N.getPartBoundingHull(b)) || bboxB;
        const keyA = realA * 0.7 + bboxA * 0.3;
        const keyB = realB * 0.7 + bboxB * 0.3;
        return keyB - keyA; // по убыванию
    });

    N.debug(`📐 Порядок: ${sortedParts.map(p => `${p.name||p.id}(${p.quantity}шт)`).join(', ')}`);

    const nestedParts = [...existingNestedParts];
    const placedPolygons = [];

    existingNestedParts.forEach(nested => {
        placedPolygons.push({
            positionedHull: nested.polygon,
            x: nested.x,
            y: nested.y,
            partId: nested.partId,
            part: parts.find(p => p.id === nested.partId),
            angle: nested.angle || 0,
            rotation: nested.rotation,
            width: nested.width,
            height: nested.height
        });
    });

    let spatialGrid = N.buildSpatialGrid(placedPolygons);
    const unplacedParts = [];

    for (const part of sortedParts) {
        if (cancelCallback?.()) return null;

        // FIX #10: Очистка DXF-геометрии от мусора
        // (короткие сегменты, дубли вершин, коллинеарные точки)
        N.cleanupPartGeometry(part);

        let placedCount = 0;
        let unplacedCount = 0;
        const angles = N.getRotationAngles(part, placedPolygons.length === 0);
        const rotInfo = part.noRotate === true ? 'noRotate=ДА' : (part._rotationReason || part.rotationMode || 'auto');

        // ═══════════════════════════════════════════════════
        // BATCH ANGLE ESTIMATION: для партии одинаковых деталей
        // определяем оптимальный угол НА ВСЮ ПАРАТИЮ, а не поштучно.
        // BLF поштучно выбирает 90° (9 в ряд), но для 10 деталей
        // 0° (2×5 рядов) даёт значительно меньшую занятую площадь.
        // Критерий: estimatedArea = estWidth × estHeight для всех копий.
        // Если лучший угол даёт площадь < 75% от второго — используем только его.
        // ═══════════════════════════════════════════════════
        delete part._batchAngles; // Сброс от предыдущих запусков
        // v3.28: Если пользователь вручную выбрал углы (allowedAngles), 
        // НЕ ограничиваем batch-оценкой — пользователь знает что хочет
        const hasManualAngles = part.allowedAngles && part.allowedAngles.length > 0;
        if (hasManualAngles) {
            // Для ручного режима: пропускаем batch-оценку, используем ВСЕ выбранные углы
            // Но всё равно логируем информацию для справки
            if (angles.length > 1 && part.quantity > 1) {
                const uiSp = parseFloat(N._getUIValue('contextPartSpacing'));
                const uiEG = parseFloat(N._getUIValue('edgeGap'));
                const batchMinGap = (typeof part.spacing === 'number') ? part.spacing : (!isNaN(uiSp) ? uiSp : 3);
                const batchEdgeGap = !isNaN(uiEG) ? uiEG : 3;
                const batchHull = N.getPartBoundingHull(part);
                const batchCX = part.bounds.width / 2;
                const batchCY = part.bounds.height / 2;
                const batchEstimates = [];
                for (const aDeg of angles) {
                    const aRad = aDeg * Math.PI / 180;
                    const { bbox } = N.prepareRotatedHull(batchHull, aRad, batchCX, batchCY);
                    if (bbox.width + batchEdgeGap * 2 > sheetSize.width || bbox.height + batchEdgeGap * 2 > sheetSize.height) continue;
                    const cpr = Math.floor((sheetSize.width - 2 * batchEdgeGap + batchMinGap) / (bbox.width + batchMinGap));
                    const rowsNeeded = Math.ceil(part.quantity / Math.max(1, cpr));
                    const colsInFullRow = Math.min(cpr, part.quantity);
                    const eW = colsInFullRow * bbox.width + (colsInFullRow - 1) * batchMinGap;
                    const eH = rowsNeeded * bbox.height + (rowsNeeded - 1) * batchMinGap;
                    batchEstimates.push({ angleDeg: aDeg, copiesPerRow: cpr, rowsNeeded, estWidth: Math.round(eW), estHeight: Math.round(eH), estArea: eW * eH });
                }
                const estInfo = batchEstimates.map(e => `${e.angleDeg}°:${e.estWidth}x${e.estHeight}(${e.copiesPerRow}вР.${e.rowsNeeded}ряд.)`).join(' | ');
                N.debug(`📐 Деталь "${part.name||part.id}": ${part.quantity}шт, углы=[${angles.join('°, ')}°], ${rotInfo} (ручной)`);
            } else {
                N.debug(`📐 Деталь "${part.name||part.id}": ${part.quantity}шт, углы=[${angles.join('°, ')}°], ${rotInfo} (ручной)`);
            }
        } else if (angles.length > 1 && part.quantity > 1) {
            const uiSp = parseFloat(N._getUIValue('contextPartSpacing'));
            const uiEG = parseFloat(N._getUIValue('edgeGap'));
            const batchMinGap = (typeof part.spacing === 'number') ? part.spacing : (!isNaN(uiSp) ? uiSp : 3);
            const batchEdgeGap = !isNaN(uiEG) ? uiEG : 3;
            const batchHull = N.getPartBoundingHull(part);
            const batchCX = part.bounds.width / 2;
            const batchCY = part.bounds.height / 2;
            const batchEstimates = [];

            for (const aDeg of angles) {
                const aRad = aDeg * Math.PI / 180;
                const { bbox } = N.prepareRotatedHull(batchHull, aRad, batchCX, batchCY);
                if (bbox.width + batchEdgeGap * 2 > sheetSize.width || bbox.height + batchEdgeGap * 2 > sheetSize.height) continue;
                const cpr = Math.floor((sheetSize.width - 2 * batchEdgeGap + batchMinGap) / (bbox.width + batchMinGap));
                const rowsNeeded = Math.ceil(part.quantity / Math.max(1, cpr));
                const colsInFullRow = Math.min(cpr, part.quantity);
                const eW = colsInFullRow * bbox.width + (colsInFullRow - 1) * batchMinGap;
                const eH = rowsNeeded * bbox.height + (rowsNeeded - 1) * batchMinGap;
                batchEstimates.push({ angleDeg: aDeg, copiesPerRow: cpr, rowsNeeded, estWidth: Math.round(eW), estHeight: Math.round(eH), estArea: eW * eH });
            }

            if (batchEstimates.length >= 2) {
                batchEstimates.sort((a, b) => a.estArea - b.estArea);
                const best = batchEstimates[0];
                // Пропускаем эквивалентные углы (одинаковые copiesPerRow и rowsNeeded)
                // Например: 0° и 180° для симметричных деталей дают одинаковую упаковку
                const second = batchEstimates.find(e =>
                    e.copiesPerRow !== best.copiesPerRow || e.rowsNeeded !== best.rowsNeeded
                ) || batchEstimates[1]; // Fallback если все углы эквивалентны
                const ratio = best.estArea / second.estArea;
                const estInfo = batchEstimates.map(e => `${e.angleDeg}°:${e.estWidth}x${e.estHeight}(${e.copiesPerRow}вР.${e.rowsNeeded}ряд.)`).join(' | ');
                const dedupSkipped = second !== batchEstimates[1];

                // ═══════════════════════════════════════════════════════════════
                // v4.24: ТРЕУГОЛЬНАЯ ДЕТАЛЬ — interlocking 0°+180°
                // Треугольники при чередовании 0°/180° вкладываются друг в друга
                // (вершина вверх / вершина вниз), образуя плотный прямоугольный
                // паттерн. Без interlocking — 50% площади bbox теряется.
                // Проверяем ПЕРЕД L-shape (L-shape имеет похожий fillRate,
                // но другую структуру пустот).
                // ═══════════════════════════════════════════════════════════════
                const has0 = batchEstimates.some(e => e.angleDeg === 0);
                const has180 = batchEstimates.some(e => e.angleDeg === 180);
                const isTri = typeof N.isTrianglePart === 'function' && N.isTrianglePart(part);
                // ДИАГНОСТИКА: показываем все 3 условия ветки треугольника
                if (!isTri || !has0 || !has180) {
                    const anglesInfo = batchEstimates.map(e => e.angleDeg + '°').join(',');
                    N.debug(`[TRI-CHECK] "${part.name||part.id}": isTri=${isTri}, has0=${has0}, has180=${has180}, availableAngles=[${anglesInfo}]`);
                }
                if (isTri && has0 && has180) {
                    part._batchAngles = [0, 180];
                    N.info(`📐 Деталь "${part.name||part.id}": ${part.quantity}шт, треугольная → [0°, 180°] interlocking`);
                } else
                // v3.32: Для криволинейных Г-образных деталей проверяем взаимное вложение
                // Если 0° и 180° оба доступны → сохраняем ОБА (они вкладываются друг в друга)
                // v3.36: Используем N.isTrueLShaped() вместо простого fillPct < 0.55,
                // чтобы не путать прямоугольные детали с вырезами и Г-образные
                if (N.isLineHeavyPart(part)) {
                    const has90 = batchEstimates.some(e => e.angleDeg === 90);
                    const has270 = batchEstimates.some(e => e.angleDeg === 270);
                    
                    // v3.36: N.isTrueLShaped() проверяет структуру пустот:
                    // Г-образная = один большой пустой угол, прямоугольная с вырезами = мелкие пустоты
                    const fg = N.getFilledOccupancyGrid(part, N.getAdaptiveGridSize(part, 3));
                    const matCells = fg.grid.reduce((s, v) => s + v, 0);
                    const totalCells = fg.gw * fg.gh;
                    const fillPct = totalCells > 0 ? matCells / totalCells : 1;
                    const trulyLShaped = N.isTrueLShaped(part);
                    
                    if (trulyLShaped && has0 && has180) {
                        // Настоящая Г-образная деталь: 0°+180° взаимно вкладываются → оба угла
                        part._batchAngles = [0, 180];
                        N.debug(`📐 Деталь "${part.name||part.id}": ${part.quantity}шт, углы=[${angles.join('°, ')}°], Г-образная → [0°, 180°]`);
                    } else if (trulyLShaped && has90 && has270) {
                        // L-образная с вертикальной ориентацией: 90°+270°
                        part._batchAngles = [90, 270];
                        N.debug(`📐 Деталь "${part.name||part.id}": ${part.quantity}шт, углы=[${angles.join('°, ')}°], Г-образная → [90°, 270°]`);
                    } else if (ratio < N.getBatchAngleThreshold(part.quantity)) {
                        // FIX #5: Динамический порог вместо фиксированного 0.75
                        part._batchAngles = [best.angleDeg];
                        const shapeDesc = trulyLShaped ? 'Г-образная' : `прямоуг.с вырезами(fill=${(fillPct*100).toFixed(0)}%)`;
                        N.debug(`📐 Деталь "${part.name||part.id}": ${part.quantity}шт, batch → [${part._batchAngles.join('°, ')}°]`);
                    } else {
                        // Нет явного победителя — для настоящих Г-образных сохраняем 0°+180°,
                        // для прямоугольных с вырезами — только лучший угол
                        if (trulyLShaped && has0 && has180) {
                            part._batchAngles = [0, 180];
                            N.debug(`📐 Деталь "${part.name||part.id}": ${part.quantity}шт, криволинейная → [0°, 180°]`);
                        } else {
                            part._batchAngles = [best.angleDeg];
                            const shapeDesc = trulyLShaped ? 'Г-образная' : `прямоуг.с вырезами(fill=${(fillPct*100).toFixed(0)}%)`;
                            N.debug(`📐 Деталь "${part.name||part.id}": ${part.quantity}шт, batch → [${part._batchAngles.join('°, ')}°]`);
                        }
                    }
                } else if (ratio < N.getBatchAngleThreshold(part.quantity)) {
                    // FIX #5: Динамический порог вместо фиксированного 0.75
                    // Не-криволинейная: лучший угол значительно лучше
                    part._batchAngles = [best.angleDeg];
                    N.debug(`📐 "${part.name||part.id}": batch → ${best.angleDeg}°`);
                } else {
                    // Не-криволинейная: нет явного победителя — топ-2
                    const bestByArea = best.angleDeg;
                    const bestByCPR = batchEstimates.reduce((a, b) => b.copiesPerRow > a.copiesPerRow ? b : a).angleDeg;
                    const selectedAngles = bestByArea === bestByCPR
                        ? [bestByArea]
                        : [bestByArea, bestByCPR];
                    part._batchAngles = selectedAngles;
                    N.debug(`📐 "${part.name||part.id}": batch → [${selectedAngles.join('°, ')}°]`);
                }
            } else {
                N.debug(`📐 "${part.name||part.id}": ${part.quantity}шт, углы=[${angles.join('°, ')}°], ${rotInfo}`);
            }
        } else {
            N.debug(`📐 [NESTING ENGINE] Деталь "${part.name||part.id}": количество=${part.quantity}, углы=[${angles.join(', ')}°], ${rotInfo}`);
        }

        // Логируем обнаруженные пустоты (дыры) в детали
        // v3.2: подробная диагностика объектов для отладки импорта
        // v3.6: определяем криволинейные детали для grid-based раскладки
        const isLH = N.isLineHeavyPart(part);
        if (isLH) {
            const lineCount = (part.objects || []).filter(o => N.getShapeType(o) === 'line').length;
            const fg = N.getFilledOccupancyGrid(part, N.getAdaptiveGridSize(part, 3));
            const matCells = fg.grid.reduce((s, v) => s + v, 0);
            const totalCells = fg.gw * fg.gh;
            const pct = totalCells > 0 ? (matCells / totalCells * 100).toFixed(1) : 0;
            // Криволинейная: ${lineCount} линий, fill=${pct}%
        }
        const partHoles = N.getPartHoles(part);
        // v3.75: Если detectPartHoles нашёл отверстия, но _hasHoles ещё не установлен —
        // устанавливаем принудительно. Это случается для деталей с концентрическими
        // кругами (кольца/фланцы), которые получили CONVEX hull и миновали
        // extractConcaveOutline (где _hasHoles обычно устанавливается).
        // Без этого флага gridsOverlap использует occupancy grid (контур)
        // вместо filled grid (заливка материала) → не видит перекрытие
        // с материалом кольца → детали размещаются внутри кольца НА материал.
        if (partHoles.length > 0 && part._hasHoles !== true) {
            part._hasHoles = true;
            // _hasHoles принудительно: ${partHoles.length} дыр
        }
        // Сводка по типам объектов (компактно)
        const objCounts = {};
        for (const o of (part.objects || [])) {
            const t = N.getShapeType(o);
            objCounts[t] = (objCounts[t] || 0) + 1;
        }
        const objSummary = Object.entries(objCounts).map(([t, c]) => `${t}=${c}`).join(', ');
        N.debug(`🔍 "${part.name||part.id}": ${part._hasHoles?'holes':'solid'}, ${rotInfo}`);

        // isHoleCircle диагностика — уже входит в сводку выше (holes=N _hasHoles=...)
        // убрано: подробный перечисление концентрических/grid-based кругов (слишком шумно)

        // ═══════════════════════════════════════════════════
        // ANGLE-LOCK: после 3 одинаковых углов подряд —
        // фиксируем угол для оставшихся деталей партии
        // BATCH-FALLBACK: если первый угол не подошёл —
        // пробуем все углы (batch-оценка могла ошибиться
        // из-за уже размещённых деталей на листе)
        // ═══════════════════════════════════════════════════
        let angleLockActive = false;
        let lastChosenAngleDeg = null;
        let consecutiveSameAngle = 0;
        let batchFallbackUsed = false;

        // Сброс Quick-Place и Hole-Place счётчиков
        delete part._qpCount;
        delete part._qpLastReason;
        delete part._holePlaceCount;
        delete part._spacingLogged;
        delete part._minGapLogged; // v3.44: Сброс логирования minGap
        // v3.44: НЕ удаляем _hasHoles здесь — флаг нужен для compactNesting!
        // N.extractConcaveOutline() установит его при первом вызове getPartBoundingHull.
        // Флаг будет удалён ПОСЛЕ N.compactNesting (ниже).

        for (let q = 0; q < part.quantity; q++) {
            if (cancelCallback?.()) return null;

            let position = await N.findPositionWithNFP(placedPolygons, part, sheetSize.width, sheetSize.height, cancelCallback, spatialGrid);

            // ═══════════════════════════════════════════════════
            // BATCH-FALLBACK: если первая деталь не поместилась
            // при batch-выбранном угле — пробуем все углы.
            // Причина: batch-оценка считает на чистый лист,
            // но на листе уже могут быть детали, меняющие
            // оптимальный угол.
            // ═══════════════════════════════════════════════════
            if (!position && q === 0 && part._batchAngles?.length === 1 && !batchFallbackUsed) {
                const savedAngles = part._batchAngles;
                delete part._batchAngles;
                batchFallbackUsed = true;
                // Batch-fallback: пробуем все углы
                position = await N.findPositionWithNFP(placedPolygons, part, sheetSize.width, sheetSize.height, cancelCallback, spatialGrid);
            }

            if (position) {
                const chosenDeg = Math.round((position.angle || 0) * 180 / Math.PI);

                // v4.60 FIX: Финальная проверка isPolygonInsideSheet
                // findPositionWithNFP может вернуть позицию через quick-place / NFP путь,
                // который не проверяет контур остатка. Проверяем здесь — если позиция
                // вне контура, отклоняем её и добавляем как виртуальное препятствие,
                // чтобы следующий вызов findPositionWithNFP нашёл другую позицию.
                const _checkHull = position.positionedHull;
                if (_checkHull && _checkHull.length > 0) {
                    const _partSpacing = typeof part.spacing === 'number' ? part.spacing : 3;
                    const _sheetOk = N.isPolygonInsideSheet(_checkHull, sheetSize.width, sheetSize.height, _partSpacing, 3);
                    if (!_sheetOk) {
                        // v4.60 FIX: Добавляем отклонённую позицию как виртуальное препятствие
                        // чтобы findPositionWithNFP больше не предлагал эту позицию
                        placedPolygons.push({
                            positionedHull: _checkHull,
                            x: position.x,
                            y: position.y,
                            partId: -1,  // Виртуальная деталь (не реальная)
                            part: { name: '_blocked', id: -1, bounds: { width: position.bboxWidth, height: position.bboxHeight } },
                            angle: position.angle || 0,
                            rotation: position.rotation || 0,
                            width: position.bboxWidth,
                            height: position.bboxHeight,
                            _virtualBlock: true  // Флаг — виртуальное препятствие
                        });
                        N.addToSpatialGrid(spatialGrid, placedPolygons[placedPolygons.length - 1]);

                        position = null; // Отклоняем позицию!
                    }
                }
            }

            // v4.60 FIX: Если позиция отклонена — пробуем ещё раз (до 20 попыток)
            if (!position && q < part.quantity) {
                for (let _retry = 0; _retry < 20 && !position; _retry++) {
                    if (cancelCallback?.()) break;
                    position = await N.findPositionWithNFP(placedPolygons, part, sheetSize.width, sheetSize.height, cancelCallback, spatialGrid);

                    if (position) {
                        const _rh = position.positionedHull;
                        if (_rh && _rh.length > 0) {
                            const _ps = typeof part.spacing === 'number' ? part.spacing : 3;
                            if (!N.isPolygonInsideSheet(_rh, sheetSize.width, sheetSize.height, _ps, 3)) {
                                // Снова вне контура — блокируем и пробуем ещё
                                placedPolygons.push({
                                    positionedHull: _rh,
                                    x: position.x,
                                    y: position.y,
                                    partId: -1,
                                    part: { name: '_blocked', id: -1, bounds: { width: position.bboxWidth, height: position.bboxHeight } },
                                    angle: position.angle || 0,
                                    rotation: position.rotation || 0,
                                    width: position.bboxWidth,
                                    height: position.bboxHeight,
                                    _virtualBlock: true
                                });
                                N.addToSpatialGrid(spatialGrid, placedPolygons[placedPolygons.length - 1]);
                                position = null;
                            }
                        }
                    }
                }
            }

            if (position) {
                const chosenDeg = Math.round((position.angle || 0) * 180 / Math.PI);

                // [LOG] Детальная информация о размещении
                console.log(`[NESTING PLACED] "${part.name||part.id}" #${q+1}/${part.quantity} → (${Math.round(position.x)}, ${Math.round(position.y)}), ${chosenDeg}°, gap=${typeof part.spacing === 'number' ? part.spacing : 3}мм`);
                
                // Angle-Lock tracking
                if (chosenDeg === lastChosenAngleDeg) {
                    consecutiveSameAngle++;
                } else {
                    consecutiveSameAngle = 1;
                    lastChosenAngleDeg = chosenDeg;
                }
                // v3.25: Для криволинейных деталей angle-lock работает
                // (один угол для паттерна <<<<)
                // v3.28: В ручном режиме (allowedAngles) — НЕ блокируем углы!
                // v3.32: Для взаимного вложения 0°+180° — НЕ блокируем!
                const partIsLH = N.isLineHeavyPart(part);
                const partHasManualAngles = part.allowedAngles && part.allowedAngles.length > 0;
                // v4.36 FIX #73: hasInterlockingPair проверяет ОБА варианта пар:
                // [0°, 180°] — горизонтальный interlocking (основание влево-вправо)
                // [90°, 270°] — вертикальный interlocking (основание вверх-вниз)
                // Раньше проверялся только [0, 180] → вертикальные L-образные детали
                // на 4-й деталь партии angle-lock блокировал legitimate interlocking.
                const hasInterlockingPair = part._batchAngles && part._batchAngles.length === 2 && (
                    (part._batchAngles.includes(0) && part._batchAngles.includes(180)) ||
                    (part._batchAngles.includes(90) && part._batchAngles.includes(270))
                );
                if (consecutiveSameAngle >= 3 && !angleLockActive && part._batchAngles && part._batchAngles.length > 1 && !partHasManualAngles && !hasInterlockingPair) {
                    part._batchAngles = [chosenDeg];
                    angleLockActive = true;
                    // Angle-Lock: зафиксирован ${chosenDeg}°
                }
                N.debug(`  ✅ "${part.name||part.id}" #${q+1} → (${Math.round(position.x)}, ${Math.round(position.y)}), ${chosenDeg}°`);

                // v3.46: Диагностика «в один рез» — используем РЕАЛЬНУЮ
                // проверку корпусов, а не bbox-зазоры.
                // Для арочных/вогнутых деталей bbox пересекаются, но корпуса
                // не касаются — нужна grid-проверка для таких случаев.
                if (q > 0) {
                    const prevSameType = [...placedPolygons].reverse().find(p => p.partId === part.id);
                    if (prevSameType) {
                        const prevRight = (prevSameType.x || 0) + (prevSameType.width || prevSameType.bboxWidth || 0);
                        const prevBottom = (prevSameType.y || 0) + (prevSameType.height || prevSameType.bboxHeight || 0);
                        // Bbox-зазоры (для информации)
                        const gapLeft = position.x - prevRight;
                        const gapRight = (prevSameType.x || 0) - (position.x + (position.bboxWidth || part.bounds.width));
                        const gapTop = position.y - prevBottom;
                        const gapBottom = (prevSameType.y || 0) - (position.y + (position.bboxHeight || part.bounds.height));

                        // Реальная проверка: пересекается ли материал?
                        const newHull = position.positionedHull;
                        const prevHull = prevSameType.positionedHull;
                        let hullsActuallyTouch = false;
                        let actualMinGap = Infinity;
                        const newIsLH = N.isLineHeavyPart(part);

                        if (newHull?.length >= 3 && prevHull?.length >= 3) {
                            // Шаг 1: Быстрая проверка по hull (gap=0)
                            hullsActuallyTouch = N.polygonsIntersect(newHull, prevHull, 0);

                            // Шаг 2: Для арочных/криволинейных деталей hull может
                            // давать ложное срабатывание (выпуклые hull двух
                            // L-образных деталей пересекаются, но материал нет).
                            // Перепроверяем через gridsOverlap.
                            if (hullsActuallyTouch && newIsLH) {
                                const newAngleDeg = Math.round((position.angle || 0) * 180 / Math.PI) % 360;
                                const prevAngleDeg = Math.round((prevSameType.angle || 0) * 180 / Math.PI) % 360;
                                const pw = prevSameType.width || prevSameType.bboxWidth || 0;
                                const ph = prevSameType.height || prevSameType.bboxHeight || 0;
                                const materialOverlap = N.gridsOverlap(
                                    part, position.x, position.y, position.bboxWidth || part.bounds.width, position.bboxHeight || part.bounds.height, newAngleDeg,
                                    part, prevSameType.x, prevSameType.y, pw, ph, prevAngleDeg,
                                    0  // gap=0 — проверяем только реальное перекрытие
                                );
                                if (!materialOverlap) {
                                    hullsActuallyTouch = false;
                                }
                            }

                            // Вычисляем минимальный зазор между hull'ами
                            if (!hullsActuallyTouch) {
                                let minDist = Infinity;
                                for (const v of newHull) {
                                    for (let ei = 0; ei < prevHull.length; ei++) {
                                        const e1 = prevHull[ei];
                                        const e2 = prevHull[(ei + 1) % prevHull.length];
                                        const d = N.pointToSegmentDistance(v, e1, e2);
                                        if (d < minDist) minDist = d;
                                    }
                                }
                                for (const v of prevHull) {
                                    for (let ei = 0; ei < newHull.length; ei++) {
                                        const e1 = newHull[ei];
                                        const e2 = newHull[(ei + 1) % newHull.length];
                                        const d = N.pointToSegmentDistance(v, e1, e2);
                                        if (d < minDist) minDist = d;
                                    }
                                }
                                actualMinGap = minDist;

                                // v3.46: Для line-heavy/arc деталей hull-зазор
                                // не отражает реальный зазор между материалами
                                // (L-образные детали: hull почти касается, но
                                // материал далеко). Проверяем через gridsOverlap
                                // с постепенным увеличением gap.
                                if (newIsLH && actualMinGap < 3) {
                                    const newAngleDeg = Math.round((position.angle || 0) * 180 / Math.PI) % 360;
                                    const prevAngleDeg = Math.round((prevSameType.angle || 0) * 180 / Math.PI) % 360;
                                    const pw = prevSameType.width || prevSameType.bboxWidth || 0;
                                    const ph = prevSameType.height || prevSameType.bboxHeight || 0;
                                    // Проверяем с minGap=actualMinGap — если grid
                                    // показывает перекрытие при этом gap,
                                    // значит реальный зазор ≈ actualMinGap.
                                    // Если нет — реальный зазор больше hull-зазора.
                                    const tightOverlap = N.gridsOverlap(
                                        part, position.x, position.y, position.bboxWidth || part.bounds.width, position.bboxHeight || part.bounds.height, newAngleDeg,
                                        part, prevSameType.x, prevSameType.y, pw, ph, prevAngleDeg,
                                        actualMinGap
                                    );
                                    if (!tightOverlap) {
                                        // Материал дальше чем hull — помечаем
                                        actualMinGap = Infinity; // Hull gap не репрезентативен
                                    }
                                }
                            } else {
                                actualMinGap = 0;
                            }
                        } else {
                            // Fallback на bbox-зазоры
                            const gaps = [gapLeft, gapRight, gapTop, gapBottom].filter(g => g >= -0.1);
                            actualMinGap = gaps.length > 0 ? Math.min(...gaps) : 0;
                        }

                        // Предупреждение только если материал РЕАЛЬНО накладывается
                        let oneCutWarn = '';
                        const gapLabel = newIsLH && actualMinGap === Infinity ? 'материал>H' : '';
                        if (hullsActuallyTouch && !part.oneCutEnabled) {
                            oneCutWarn = '🔴 НАЛОЖЕНИЕ!';
                        } else if (hullsActuallyTouch && part.oneCutEnabled) {
                            oneCutWarn = '⚠️ В ОДИН РЕЗ!';
                        } else if (actualMinGap < 1 && !part.oneCutEnabled && actualMinGap !== Infinity) {
                            oneCutWarn = '⚠️ зазор < 1мм';
                        }

                        // Показываем зазор (для arc деталей — hull-зазор или "материал>H")
                        const gapDisplay = actualMinGap === Infinity ? '>hull' : actualMinGap.toFixed(1);
                        // GAP: ${gapDisplay}mm
                    }
                }

                nestedParts.push({
                    partId: part.id,
                    x: position.x,
                    y: position.y,
                    width: position.bboxWidth || part.bounds.width,
                    height: position.bboxHeight || part.bounds.height,
                    baseWidth: part.bounds.width,
                    baseHeight: part.bounds.height,
                    rotation: position.rotation,
                    angle: position.angle || 0,
                    polygon: position.positionedHull,
                    outline: N.getPartPolygons(part),
                    refPoint: position.refPoint,
                    spacing: typeof part.spacing === 'number' ? part.spacing : undefined,
                    _hasHoles: part._hasHoles === true,  // v3.44: Сохраняем флаг отверстий для compactNesting
                    _holeLines: part._hasHoles && part._holeLines ? part._holeLines.map(l => ({...l})) : null,  // v3.45: Копируем для расчёта утилизации
                    _holeCircles: part._hasHoles && part._holeCircles ? part._holeCircles.map(c => ({...c})) : null,  // v3.68: Копируем круговые отверстия для usedArea
                    oneCutEnabled: part.oneCutEnabled === true,  // v3.44: Сохраняем для compactNesting
                    pierceCount: N.countPierces(part)
                });
                placedPolygons.push({
                    positionedHull: position.positionedHull,
                    positionedPolygons: position.positionedPolygons || null,
                    x: position.x,
                    y: position.y,
                    partId: part.id,
                    part,
                    angle: position.angle || 0,
                    rotation: position.rotation,
                    width: position.bboxWidth,
                    height: position.bboxHeight
                });
                N.addToSpatialGrid(spatialGrid, placedPolygons[placedPolygons.length - 1]);
                placedCount++;
            } else {
                N.debug(`  ❌ "${part.name||part.id}" #${q+1} — не поместилась`);
                unplacedCount++;
            }
            // Yield браузеру каждые 5 деталей (вместо каждой) — ускоряет раскладку на ~30%
            if (q % 5 === 4) await new Promise(r => setTimeout(r, 0));
        }

        if (unplacedCount > 0) {
            unplacedParts.push({ partId: part.id, quantity: unplacedCount, placed: placedCount, total: part.quantity });
        }
        const qpTotal = part._qpCount || 0;
        const holeTotal = part._holePlaceCount || 0;
        const qpLabel = qpTotal > 0 ? `, Quick-Place=${qpTotal}` : '';
        const holeLabel = holeTotal > 0 ? `, Hole-Place=${holeTotal}` : '';
        const fallbackLabel = batchFallbackUsed ? ', batch-fallback=ДА' : '';
        // v4.05: Диагностика для деталей с дугами
        const arcCount = (part.objects || []).filter(o => N.getShapeType(o) === 'arc').length;
        const arcLabel = arcCount > 0 ? `, arcs=${arcCount} LH=${N.isLineHeavyPart(part)}` : '';

        // Анализ структуры рядов для этой партии
        const batchParts = placedPolygons.filter(p => p.partId === part.id);
        if (batchParts.length > 1) {
            const rowMap = new Map();
            for (const bp of batchParts) {
                const rowKey = Math.round(bp.y || 0);
                if (!rowMap.has(rowKey)) rowMap.set(rowKey, []);
                rowMap.get(rowKey).push(Math.round(bp.x || 0));
            }
            const rows = [...rowMap.entries()].sort((a, b) => a[0] - b[0]);
            const rowSummary = rows.map(([y, xs]) => `${xs.length}@y=${y}`).join(', ');
            N.info(`📐 "${part.name||part.id}": ✅${placedCount} ❌${unplacedCount}${holeLabel}${qpLabel}${arcLabel}${fallbackLabel} | ${rowSummary}`);
        } else {
            N.info(`📐 "${part.name||part.id}": ✅${placedCount} ❌${unplacedCount}${holeLabel}${qpLabel}${arcLabel}${fallbackLabel}`);
        }
        delete part._batchAngles; // Очистка — не влияет на следующий тип детали
        delete part._qpCount;
        delete part._qpLastReason;
        delete part._holePlaceCount;
        delete part._spacingLogged;
        delete part._minGapLogged;
        // v3.44: _hasHoles НЕ удаляем здесь — нужен для compactNesting!
        // Удаление перенесено ПОСЛЕ N.compactNesting (ниже).
        delete part._holeLines;
    }

    // ═══════════════════════════════════════════════════
    // v3.86: ПОСТ-РАСКЛАДОЧНАЯ ВЕРИФИКАЦИЯ
    // Проверяем ВСЕ пары размещённых деталей на реальное
    // перекрытие материала через gridsOverlap. Если нашли —
    // значит collision check пропустил наложение.
    //
    // v3.86: Добавлена МАТЕМАТИЧЕСКАЯ ПРОВЕРКА для пар
    // кольцо+внутренняя_деталь. gridsOverlap с gridSize=10мм
    // даёт ложные срабатывания на границе отверстия кольца
    // (дискретизация размывает внутренний радиус на 1 ячейку).
    // Математическая проверка: если центр малой детали
    // находится внутри отверстия кольца на расстоянии
    // dist + smallR + minGap ≤ innerR → перекрытия НЕТ.
    // ═══════════════════════════════════════════════════
    {
        // v3.86: Вспомогательная функция — проверяет, находится ли
        // деталь b полностью внутри концентрического отверстия детали a
        function isInsideConcentricHole(a, aPart, b, bPart) {
            if (!aPart || !bPart) return false;
            const aHoles = N.getPartHoles(aPart);
            const aConcentric = aHoles.find(h => h.isConcentricHole);
            if (!aConcentric) return false;

            // Деталь b должна быть круглой (иначе математика не работает)
            const bDiam = N.getCircleDiameter(bPart);
            if (!bDiam) return false;
            const bR = bDiam / 2;

            // Вычисляем реальный innerR кольца a из DXF-данных
            const aBboxInnerR = Math.min(aConcentric.width, aConcentric.height) / 2;
            let aActualInnerR = aBboxInnerR;
            const aCircles = (aPart.objects || []).filter(o => N.getShapeType(o) === 'circle');
            if (aCircles.length >= 2) {
                aCircles.sort((c1, c2) => (c1.radius || 0) - (c2.radius || 0));
                for (let ci = 0; ci < aCircles.length - 1; ci++) {
                    for (let cj = ci + 1; cj < aCircles.length; cj++) {
                        const cDist = Math.hypot((aCircles[ci].cx||0)-(aCircles[cj].cx||0), (aCircles[ci].cy||0)-(aCircles[cj].cy||0));
                        if (cDist < 1) {
                            aActualInnerR = Math.min(aCircles[ci].radius || 0, aCircles[cj].radius || 0);
                            break;
                        }
                    }
                    if (aActualInnerR !== aBboxInnerR) break;
                }
            }

            // Центр отверстия кольца a на листе
            const aAngle = a.angle || 0;
            const aW = a.width || a.bboxWidth || 0;
            const aH = a.height || a.bboxHeight || 0;
            const localHoleCx = aConcentric.x + aConcentric.width / 2;
            const localHoleCy = aConcentric.y + aConcentric.height / 2;
            let aHoleCx, aHoleCy;
            if (Math.abs(aAngle) > 0.01) {
                const rotPt = N.rotatePoint(localHoleCx, localHoleCy, aAngle, aW / 2, aH / 2);
                aHoleCx = (a.x || 0) + rotPt.x;
                aHoleCy = (a.y || 0) + rotPt.y;
            } else {
                aHoleCx = (a.x || 0) + localHoleCx;
                aHoleCy = (a.y || 0) + localHoleCy;
            }

            // Центр детали b на листе
            const bCx = (b.x || 0) + (b.width || b.bboxWidth || 0) / 2;
            const bCy = (b.y || 0) + (b.height || b.bboxHeight || 0) / 2;

            // Математическая проверка: b полностью внутри отверстия a?
            const dist = Math.hypot(bCx - aHoleCx, bCy - aHoleCy);
            const clearance = aActualInnerR - dist - bR;
            return clearance >= -0.5; // допуск 0.5мм на округление
        }

        let overlapCount = 0;
        const overlapPairs = [];
        for (let i = 0; i < placedPolygons.length; i++) {
            const a = placedPolygons[i];
            const aPart = a.part;
            const aW = a.width || a.bboxWidth || 0;
            const aH = a.height || a.bboxHeight || 0;
            const aAngle = Math.round((a.angle || 0) * 180 / Math.PI) % 360;
            for (let j = i + 1; j < placedPolygons.length; j++) {
                const b = placedPolygons[j];
                const bPart = b.part;
                const bW = b.width || b.bboxWidth || 0;
                const bH = b.height || b.bboxHeight || 0;
                const bAngle = Math.round((b.angle || 0) * 180 / Math.PI) % 360;

                // Быстрый отсев по bbox
                if ((a.x || 0) + aW <= (b.x || 0) || (b.x || 0) + bW <= (a.x || 0) ||
                    (a.y || 0) + aH <= (b.y || 0) || (b.y || 0) + bH <= (a.y || 0)) continue;

                // Проверяем hull пересечение
                if (a.positionedHull?.length >= 3 && b.positionedHull?.length >= 3) {
                    if (!N.polygonsIntersect(a.positionedHull, b.positionedHull, 0)) continue;
                }

                // v3.86: МАТЕМАТИЧЕСКАЯ ПРОВЕРКА для пар кольцо+внутренняя_деталь.
                // Если деталь b полностью внутри концентрического отверстия детали a
                // (или наоборот) — перекрытия материала НЕТ, пропускаем gridsOverlap.
                if (isInsideConcentricHole(a, aPart, b, bPart) || isInsideConcentricHole(b, bPart, a, aPart)) {
                    continue;
                }

                // Hull пересекаются — проверяем gridsOverlap
                if (aPart && bPart) {
                    const overlap = N.gridsOverlap(
                        aPart, a.x || 0, a.y || 0, aW, aH, aAngle,
                        bPart, b.x || 0, b.y || 0, bW, bH, bAngle, 0
                    );
                    if (overlap) {
                        overlapCount++;
                        const aName = aPart.name || aPart.id || a.partId;
                        const bName = bPart.name || bPart.id || b.partId;
                        const aHoles = aPart._hasHoles === true;
                        const bHoles = bPart._hasHoles === true;
                        const aLH = N.isLineHeavyPart(aPart);
                        const bLH = N.isLineHeavyPart(bPart);
                        overlapPairs.push({
                            a: aName, b: bName,
                            aPos: `(${Math.round(a.x)},${Math.round(a.y)})`,
                            bPos: `(${Math.round(b.x)},${Math.round(b.y)})`,
                            aHoles, bHoles, aLH, bLH
                        });
                    }
                }
            }
        }

        // ═══════════════════════════════════════════════════════════
        // v4.05: POLYGON-LEVEL VERIFICATION для деталей с дугами.
        //
        // ПРОБЛЕМА: Выше верификация пропускает пары, чьи convex
        // hull'ы НЕ пересекаются. Но для дуг (arc) convex hull ≈ bbox,
        // и две дуги рядом могут иметь пересекающиеся ПОЛИГОНЫ
        // (реальные контуры), хотя convex hull'ы не пересекаются.
        //
        // РЕШЕНИЕ: Для деталей с arc-объектами проверяем пересечение
        // positionedPolygons напрямую, без pre-filter по hull.
        // Это медленнее, но гарантирует обнаружение наложений дуг.
        // ═══════════════════════════════════════════════════════════
        const arcParts = placedPolygons.filter(p => {
            if (!p.part) return false;
            return (p.part.objects || []).some(o => N.getShapeType(o) === 'arc');
        });
        if (arcParts.length >= 2) {
            for (let i = 0; i < arcParts.length; i++) {
                const a = arcParts[i];
                const aPart = a.part;
                const aAngleRad = (a.angle || 0);
                for (let j = i + 1; j < arcParts.length; j++) {
                    const b = arcParts[j];
                    const bPart = b.part;
                    const bAngleRad = (b.angle || 0);

                    // Быстрый отсев по bbox (с допуском — bbox могут быть неточными)
                    const aW = a.width || a.bboxWidth || 0;
                    const aH = a.height || a.bboxHeight || 0;
                    const bW = b.width || b.bboxWidth || 0;
                    const bH = b.height || b.bboxHeight || 0;
                    // v4.05: Расширяем bbox на 1мм для отсева —
                    // дуги рядом (gap=3) не должны пересекаться,
                    // но если gap < 1 — проверяем детально.
                    const margin = 1;
                    if ((a.x || 0) + aW + margin <= (b.x || 0) || (b.x || 0) + bW + margin <= (a.x || 0) ||
                        (a.y || 0) + aH + margin <= (b.y || 0) || (b.y || 0) + bH + margin <= (a.y || 0)) continue;

                    // Проверяем positionedPolygons пересечение
                    const posPolysA = a.positionedPolygons || N.computePositionedPolygons(aPart, a.x || 0, a.y || 0, aAngleRad);
                    const posPolysB = b.positionedPolygons || N.computePositionedPolygons(bPart, b.x || 0, b.y || 0, bAngleRad);

                    if (posPolysA && posPolysB) {
                        let found = false;
                        for (const ppA of posPolysA) {
                            if (ppA.length < 3) continue;
                            for (const ppB of posPolysB) {
                                if (ppB.length < 3) continue;
                                // v4.13: gap=-2 — фильтруем ложные пересечения
                                // от polygon-аппроксимации дуг (~1мм)
                                if (N.polygonsIntersect(ppA, ppB, -2)) {
                                    found = true;
                                    break;
                                }
                            }
                            if (found) break;
                        }
                        if (found) {
                            const aName = aPart.name || aPart.id || a.partId;
                            const bName = bPart.name || bPart.id || b.partId;
                            // Проверяем, не уже ли найдено это наложение в основном цикле
                            const alreadyFound = overlapPairs.some(p =>
                                (p.a === aName && p.b === bName) || (p.a === bName && p.b === aName));
                            if (!alreadyFound) {
                                overlapCount++;
                                overlapPairs.push({
                                    a: aName, b: bName,
                                    aPos: `(${Math.round(a.x)},${Math.round(a.y)})`,
                                    bPos: `(${Math.round(b.x)},${Math.round(b.y)})`,
                                    aHoles: aPart._hasHoles === true,
                                    bHoles: bPart._hasHoles === true,
                                    aLH: N.isLineHeavyPart(aPart),
                                    bLH: N.isLineHeavyPart(bPart),
                                    arcOverlap: true
                                });
                            }
                        }
                    }
                }
            }
        }

        if (overlapCount > 0) {
            console.warn(`🔴 [VERIFICATION v4.05] НАЙДЕНО ${overlapCount} НАЛОЖЕНИЙ!`);
            for (const p of overlapPairs) {
                const arcLabel = p.arcOverlap ? ' [ARC-POLY]' : '';
                console.warn(`  🔴 "${p.a}" ${p.aPos} ↔ "${p.b}" ${p.bPos}`,
                    `| a:_hasHoles=${p.aHoles} isLH=${p.aLH} b:_hasHoles=${p.bHoles} isLH=${p.bLH}${arcLabel}`);
            }
        } else {
            N.debug(`✅ [VERIFICATION] Наложений не найдено — все ${placedPolygons.length} деталей корректны`);
        }
    }

    // ═══════════════════════════════════════════════════
    // КОМПАКЦИЯ: сдвигаем детали к началу координат
    // compactGap используется ТОЛЬКО как fallback для деталей
    // без per-part spacing (в getPairGap через sp1/sp2).
    // Per-part spacing определяется независимо для каждой пары.
    // ═══════════════════════════════════════════════════
    const uiSpacing = parseFloat(N._getUIValue('contextPartSpacing'));
    const uiEdgeGap = parseFloat(N._getUIValue('edgeGap'));
    // v4.21: compactGap учитывает per-part spacing из nestedParts.
    // GAP используется как fallback в getPairGap для деталей без spacing.
    // Чтобы компакция не сближала детали сильнее, чем позволяет per-part spacing,
    // GAP должен быть не меньше максимума per-part spacings.
    const perPartSpacings = nestedParts
        .filter(np => typeof np.spacing === 'number')
        .map(np => np.spacing);
    const uiGap = !isNaN(uiSpacing) ? uiSpacing : 3;
    const compactGap = perPartSpacings.length > 0
        ? Math.max(uiGap, ...perPartSpacings)
        : uiGap;
    const compactEdge = !isNaN(uiEdgeGap) ? uiEdgeGap : 3;
    // ДИАГНОСТИКА SPACING: логируем compactGap
    console.log(`[SPACING] compactNesting: compactGap=${compactGap}мм (uiSpacing=${uiSpacing}), compactEdge=${compactEdge}мм`);
    const compactResult = N.compactNesting(nestedParts, placedPolygons, sheetSize.width, sheetSize.height, compactGap, compactEdge);

    // ═══════════════════════════════════════════════════
    // v4.04: ПОСТ-КОМПАКЦИОННАЯ ВЕРИФИКАЦИЯ
    // Компакция сдвигает детали к началу координат, и хотя
    // tryMoveStep проверяет коллизии через gridsOverlap,
    // верификация после компакции — страховка от багов
    // (особенно для тонкостенных деталей, где grid может
    // пропускать наложения, а POLYGON NET компенсирует).
    // v4.20: Используем реальный spacing каждой детали, а не gap=0!
    // ═══════════════════════════════════════════════════
    {
        let postCompactOverlaps = 0;
        for (let i = 0; i < placedPolygons.length; i++) {
            const a = placedPolygons[i];
            const aPart = a.part;
            const aW = a.width || a.bboxWidth || 0;
            const aH = a.height || a.bboxHeight || 0;
            const aAngle = Math.round((a.angle || 0) * 180 / Math.PI) % 360;
            const aSpacing = typeof nestedParts[i]?.spacing === 'number' ? nestedParts[i].spacing : 3;
            
            for (let j = i + 1; j < placedPolygons.length; j++) {
                const b = placedPolygons[j];
                const bPart = b.part;
                const bW = b.width || b.bboxWidth || 0;
                const bH = b.height || b.bboxHeight || 0;
                const bAngle = Math.round((b.angle || 0) * 180 / Math.PI) % 360;
                const bSpacing = typeof nestedParts[j]?.spacing === 'number' ? nestedParts[j].spacing : 3;

                // pairGap = max(spacing[a], spacing[b])
                const pairGap = Math.max(aSpacing, bSpacing);

                // Быстрый отсев по bbox (с учётом pairGap)
                if ((a.x || 0) + aW + pairGap <= (b.x || 0) || (b.x || 0) + bW + pairGap <= (a.x || 0) ||
                    (a.y || 0) + aH + pairGap <= (b.y || 0) || (b.y || 0) + bH + pairGap <= (a.y || 0)) continue;

                // Проверяем hull пересечение
                if (a.positionedHull?.length >= 3 && b.positionedHull?.length >= 3) {
                    if (!N.polygonsIntersect(a.positionedHull, b.positionedHull, pairGap)) continue;
                }

                // Hull пересекаются — проверяем gridsOverlap с pairGap
                if (aPart && bPart) {
                    const overlap = N.gridsOverlap(
                        aPart, a.x || 0, a.y || 0, aW, aH, aAngle,
                        bPart, b.x || 0, b.y || 0, bW, bH, bAngle, pairGap
                    );
                    if (overlap) {
                        postCompactOverlaps++;
                        console.warn(`🔴 [POST-COMPACT v4.20] НАЛОЖЕНИЕ после компакции:`,
                            `"${aPart.name||aPart.id}" (${Math.round(a.x)},${Math.round(a.y)}) ↔ "${bPart.name||bPart.id}" (${Math.round(b.x)},${Math.round(b.y)})`,
                            `pairGap=${pairGap}мм`);
                    }
                }
            }
        }
        if (postCompactOverlaps === 0) {
            N.debug(`✅ [POST-COMPACT] Наложений после компакции не найдено`);
        } else {
            console.warn(`🔴 [POST-COMPACT v4.20] ${postCompactOverlaps} НАЛОЖЕНИЙ после компакции!`);
        }
        // v4.05: Polygon-level post-compact verification для дуг
        const arcPartsPost = placedPolygons.filter(p => {
            if (!p.part) return false;
            return (p.part.objects || []).some(o => N.getShapeType(o) === 'arc');
        });
        if (arcPartsPost.length >= 2) {
            let arcPostOverlaps = 0;
            for (let i = 0; i < arcPartsPost.length; i++) {
                const a = arcPartsPost[i];
                const aPart = a.part;
                const aW = a.width || a.bboxWidth || 0;
                for (let j = i + 1; j < arcPartsPost.length; j++) {
                    const b = arcPartsPost[j];
                    const bPart = b.part;
                    const bW = b.width || b.bboxWidth || 0;
                    const margin = 1;
                    if ((a.x || 0) + aW + margin <= (b.x || 0) || (b.x || 0) + bW + margin <= (a.x || 0) ||
                        (a.y || 0) + (a.height || a.bboxHeight || 0) + margin <= (b.y || 0) ||
                        (b.y || 0) + (b.height || b.bboxHeight || 0) + margin <= (a.y || 0)) continue;
                    const posPolysA = a.positionedPolygons || N.computePositionedPolygons(aPart, a.x || 0, a.y || 0, a.angle || 0);
                    const posPolysB = b.positionedPolygons || N.computePositionedPolygons(bPart, b.x || 0, b.y || 0, b.angle || 0);
                    if (posPolysA && posPolysB) {
                        for (const ppA of posPolysA) {
                            if (ppA.length < 3) continue;
                            for (const ppB of posPolysB) {
                                if (ppB.length < 3) continue;
                                // v4.13: gap=-2 — фильтруем ложные пересечения
                                // от polygon-аппроксимации дуг (~1мм)
                                if (N.polygonsIntersect(ppA, ppB, -2)) {
                                    arcPostOverlaps++;
                                    console.warn(`🔴 [POST-COMPACT ARC] НАЛОЖЕНИЕ дуг:`,
                                        `"${aPart.name||aPart.id}" (${Math.round(a.x)},${Math.round(a.y)}) ↔ "${bPart.name||bPart.id}" (${Math.round(b.x)},${Math.round(b.y)})`);
                                    break;
                                }
                            }
                            if (arcPostOverlaps > 0) break;
                        }
                    }
                    if (arcPostOverlaps > 0) break;
                }
                if (arcPostOverlaps > 0) break;
            }
            if (arcPostOverlaps === 0 && postCompactOverlaps === 0) {
                N.debug(`✅ [POST-COMPACT] Наложений после компакции не найдено (включая проверку дуг)`);
            }
        }
    }

    // v3.44: Теперь можно удалить _hasHoles — compactNesting уже завершился
    for (const part of sortedParts) {
        delete part._hasHoles;
    }
    // v3.45: НЕ удаляем _hasHoles/oneCutEnabled/_holeLines из nestedParts
    // ДО расчёта утилизации — они нужны для корректного подсчёта!
    // Удаление перенесено ПОСЛЕ расчёта утилизации.

    // Считаем occupied bounding box (сколько листа реально занято)
    let maxOccupiedX = 0, maxOccupiedY = 0;
    for (const n of nestedParts) {
        maxOccupiedX = Math.max(maxOccupiedX, (n.x || 0) + (n.width || 0));
        maxOccupiedY = Math.max(maxOccupiedY, (n.y || 0) + (n.height || 0));
    }
    const occupiedArea = maxOccupiedX * maxOccupiedY;

    const totalArea = sheetSize.width * sheetSize.height;
    // v3.45: Корректный расчёт usedArea — для деталей с _hasHoles
    // вычитаем площадь отверстий из площади hull.
    // Иначе утилизация >100% (hull включает пустоты отверстий).
    const usedArea = nestedParts.reduce((sum, p) => {
        const part = parts.find(pt => pt.id === p.partId);
        if (!part) return sum;
        let area = N.polygonArea(N.getPartBoundingHull(part));
        // Вычитаем площадь отверстий для деталей с _hasHoles
        // Используем _holeLines из nestedParts (копия), т.к. part._holeLines
        // может быть уже удалён
        const holeLines = p._holeLines || part._holeLines;
        const holeCircles = p._holeCircles || part._holeCircles;
        // v3.79: Используем N.chainLinkSegments вместо inline-копии.
        // Раньше строилась только ОДНА цепочка из holeLines — если у
        // детали несколько внутренних контуров (рамка с 2+ вырезами),
        // площадь последующих отверстий не вычиталась → утилизация > 100%.
        if (p._hasHoles && holeLines?.length > 0) {
            const lines = holeLines.map(l => ({
                x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2
            }));
            const { chains: holeChains } = N.chainLinkSegments(lines, {
                tolerance: N.MERGE_EPS * 2,
                includeArcPoints: false
            });
            for (const hc of holeChains) {
                if (hc.points.length >= 4) {
                    const hArea = Math.abs(N.polygonArea(
                        hc.isClosed ? hc.points.slice(0, -1) : hc.points
                    ));
                    area -= hArea;
                }
            }
        }
        // v3.68: Вычитаем площадь круговых отверстий (_holeCircles)
        // Для rect+circle деталей: _holeLines пустой, но _holeCircles содержит
        // геометрию круглых отверстий. Без этого usedArea завышена.
        if (p._hasHoles && holeCircles?.length > 0) {
            for (const hc of holeCircles) {
                area -= Math.PI * (hc.r || 0) ** 2;
            }
        }
        return sum + Math.max(0, area);
    }, 0);
    const utilization = totalArea > 0 ? (usedArea / totalArea * 100) : 0;
    const packedUtil = occupiedArea > 0 ? (usedArea / occupiedArea * 100) : 0;
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    N.info(`📐 Готово за ${elapsed}с: ✅${nestedParts.length} ❌${unplacedParts.length}, утилизация=${utilization.toFixed(1)}%, плотность=${packedUtil.toFixed(1)}%, занято=${Math.round(maxOccupiedX)}x${Math.round(maxOccupiedY)}`);

    // v3.45: Теперь удаляем _hasHoles/oneCutEnabled/_holeLines из nestedParts
    // (после расчёта утилизации, где они были нужны)
    for (const n of nestedParts) {
        delete n._hasHoles;
        delete n._holeLines;
        delete n._holeCircles;  // v3.68
        delete n.oneCutEnabled;
    }

    let recommendation = null;
    const optimal = N.findOptimalSheet(parts);
    if (optimal) {
        const currentWaste = 100 - utilization;
        if (optimal.waste < currentWaste - 5) {
            recommendation = {
                sheetName: optimal.sheet.name,
                optimalWaste: optimal.waste.toFixed(1),
                currentWaste: currentWaste.toFixed(1),
                savings: (currentWaste - optimal.waste).toFixed(1)
            };
        }
    }

    // v4.60 FIX: Очищаем виртуальные блоки из placedPolygons
    // (они добавлялись как препятствия для отклонённых позиций вне контура)
    for (let i = placedPolygons.length - 1; i >= 0; i--) {
        if (placedPolygons[i]._virtualBlock) {
            placedPolygons.splice(i, 1);
        }
    }

    return {
        nestedParts,
        unplacedParts,
        utilization: parseFloat(utilization.toFixed(1)),
        recommendation
    };
}

N.snapAngle = function snapAngle(angleDegrees) {
    angleDegrees = ((angleDegrees % 360) + 360) % 360;
    if (angleDegrees >= 345 || angleDegrees <= 15) return 0;
    if (angleDegrees >= 75 && angleDegrees <= 105) return 90;
    if (angleDegrees >= 165 && angleDegrees <= 195) return 180;
    if (angleDegrees >= 255 && angleDegrees <= 285) return 270;
    return angleDegrees;
}

N.rotateNestedPart = function rotateNestedPart(nested, rotationDegrees, sheetWidth, sheetHeight) {
    const currentDeg = ((nested.angle || 0) * 180 / Math.PI) % 360;
    let newDeg = currentDeg + rotationDegrees;
    const snapped = Math.abs(rotationDegrees) < 5 ? newDeg : N.snapAngle(newDeg);
    const newAngle = snapped * Math.PI / 180;

    const baseW = nested.baseWidth || nested.width;
    const baseH = nested.baseHeight || nested.height;

    // FIX: используем реальный convex hull детали (из outline/polygon),
    // а не bbox-прямоугольник. Для polyline/arc деталей bbox-прямоугольник
    // не соответствует реальной форме → поворот выглядит неправильно.
    let hull;
    if (nested.outline && nested.outline.length > 0) {
        // Собираем все точки из всех полигонов outline в один hull
        const allPoints = [];
        for (const poly of nested.outline) {
            for (const pt of poly) {
                allPoints.push({ x: pt.x, y: pt.y });
            }
        }
        if (allPoints.length >= 3) {
            hull = N.computeConvexHull(allPoints);
        } else {
            hull = [{ x: 0, y: 0 }, { x: baseW, y: 0 }, { x: baseW, y: baseH }, { x: 0, y: baseH }];
        }
    } else if (nested.polygon && nested.polygon.length >= 3) {
        // Используем текущий positionedHull, но в локальных координатах
        // (нормализуем относительно текущей позиции)
        hull = nested.polygon.map(p => ({ x: p.x - (nested.x || 0), y: p.y - (nested.y || 0) }));
    } else {
        hull = [{ x: 0, y: 0 }, { x: baseW, y: 0 }, { x: baseW, y: baseH }, { x: 0, y: baseH }];
    }

    const cx = baseW / 2, cy = baseH / 2;

    const rotated = N.rotatePolygon(hull, newAngle, cx, cy);
    const ref = N.getReferencePoint(rotated);
    const shifted = rotated.map(p => ({ x: p.x - ref.x, y: p.y - ref.y }));
    const temp = N.getBoundingBox(shifted);
    const finalHull = shifted.map(p => ({ x: p.x - temp.minX, y: p.y - temp.minY }));
    const newRef = { x: ref.x + temp.minX, y: ref.y + temp.minY };
    const bbox = { width: temp.width, height: temp.height };

    let newX = nested.x, newY = nested.y;
    newX = Math.max(0, Math.min(newX, sheetWidth - bbox.width));
    newY = Math.max(0, Math.min(newY, sheetHeight - bbox.height));

    nested.x = newX;
    nested.y = newY;
    nested.angle = newAngle;
    nested.width = bbox.width;
    nested.height = bbox.height;
    // v4.74: polygon хранится в SHEET координатах (не local!).
    // finalHull — в local координатах (0,0 = top-left).
    // Конвертируем: sheet = local + (nested.x, nested.y).
    // Это нужно для hit-test (pointInPolygonNested) и dragging.
    nested.polygon = finalHull.map(p => ({ x: p.x + newX, y: p.y + newY }));
    nested.refPoint = newRef;
    return true;
}

// ═══════════════════════════════════════════════════════════════
// v4.58: ИНКРЕМЕНТАЛЬНЫЙ NESTING
// ═══════════════════════════════════════════════════════════════
// Размещает ТОЛЬКО новые детали (не пересчитывая существующие).
// Использует уже размещённые детали как препятствия.
//
// Сценарии:
//   1. Добавили новую деталь в список → разместить только её
//   2. Увеличили количество детали → разместить только недостающие
//   3. Изменили количество/удалили деталь → оставить как есть
//
// Возвращает { nestedParts: [...new], unplacedParts: [...] }
// nestedParts содержит ТОЛЬКО новые размещения.
// ═══════════════════════════════════════════════════════════════

N.performIncrementalNesting = async function performIncrementalNesting(
    newParts,
    sheetSize,
    existingNestedParts = [],
    cancelCallback = null
) {
    const startTime = performance.now();

    if (!newParts || newParts.length === 0) {
        return { nestedParts: [], unplacedParts: [], utilization: 0 };
    }

    // Фильтруем только детали, разрешённые для раскладки
    const partsToNest = newParts.filter(p => p.nestingEnabled !== false && p.quantity > 0);
    if (partsToNest.length === 0) {
        return { nestedParts: [], unplacedParts: [], utilization: 0 };
    }

    N.clearPartHullCache();

    // Нормализация типов объектов (как в performNesting)
    for (const part of partsToNest) {
        if (!part.objects) continue;
        for (const obj of part.objects) {
            if (!obj.type) obj.type = N.getShapeType(obj);
        }
    }

    N.info(`🚀 [INCREMENTAL] запущен: ${partsToNest.length} типов, ${partsToNest.reduce((s,p)=>s+p.quantity,0)} штук, ${existingNestedParts.length} существующих`);

    // v4.58 FIX: Сохраняем и сбрасываем allowOverlap перед раскладкой.
    // После основного nesting allowOverlap=true (для ручного перемещения деталей).
    // Без сброса findPositionWithNFP использует minGap=-100 → детали
    // накладываются друг на друга (нахлёст 100мм).
    const _savedAllowOverlap = window.allowOverlap;
    window.allowOverlap = false;
    if (typeof allowOverlap !== 'undefined') allowOverlap = false;

    // Вспомогательная функция для восстановления и возврата
    const _restoreAndReturn = (result) => {
        window.allowOverlap = _savedAllowOverlap;
        if (typeof allowOverlap !== 'undefined') allowOverlap = _savedAllowOverlap;
        return result;
    };

    // Адаптивный SPATIAL_CELL_SIZE
    const partSizes = partsToNest.map(p => Math.min(p.bounds.width, p.bounds.height)).filter(s => s > 0);
    if (partSizes.length > 0) {
        partSizes.sort((a, b) => a - b);
        const medianSize = partSizes[Math.floor(partSizes.length / 2)];
        N.SPATIAL_CELL_SIZE = Math.max(20, Math.min(500, medianSize * 1.5));
    }

    // Сортировка: крупные → мелкие (как в performNesting)
    const sortedParts = [...partsToNest].sort((a, b) => {
        const areaA = (a.bounds.width || 0) * (a.bounds.height || 0);
        const areaB = (b.bounds.width || 0) * (b.bounds.height || 0);
        return areaB - areaA;
    });

    // Существующие детали — как препятствия
    const placedPolygons = [];
    for (const nested of existingNestedParts) {
        if (!nested || !nested.polygon) continue;
        placedPolygons.push({
            positionedHull: nested.polygon,
            x: nested.x,
            y: nested.y,
            partId: nested.partId,
            part: (typeof parts !== 'undefined') ? parts.find(p => p.id === nested.partId) : null,
            angle: nested.angle || 0,
            rotation: nested.rotation,
            width: nested.width,
            height: nested.height
        });
    }

    let spatialGrid = N.buildSpatialGrid(placedPolygons);
    const newNestedParts = [];
    const unplacedParts = [];

    for (const part of sortedParts) {
        if (cancelCallback?.()) return _restoreAndReturn(null);

        N.cleanupPartGeometry(part);

        let placedCount = 0;
        let unplacedCount = 0;

        for (let q = 0; q < part.quantity; q++) {
            if (cancelCallback?.()) return _restoreAndReturn(null);

            let position = null;

            // v4.58 FIX: findPositionWithNFP уже перебирает углы внутри себя
            // (через getRotationAngles). Вызываем ОДИН раз — функция сама
            // найдёт лучшую позицию с учётом всех углов и interlocking.
            // Раньше вызывали в цикле for(angle of angles) — это вызывало
            // findPositionWithNFP многократно, и каждый вызов использовал
            // ПЕРВЫЙ угол из angles, игнорируя цикл → дубликаты.
            position = await N.findPositionWithNFP(
                placedPolygons,
                part,
                sheetSize.width,
                sheetSize.height,
                cancelCallback,
                spatialGrid
            );

            if (position) {
                // v4.58 FIX: используем position.positionedHull (уже вычислен
                // внутри findPositionWithNFP с учётом правильного угла и refPoint)
                // вместо N.computePositionedPolygons() — который мог вычислить
                // с другим углом. Также используем position.angle вместо usedAngle.
                const nestedPart = {
                    partId: part.id,
                    x: position.x,
                    y: position.y,
                    width: position.bboxWidth || part.bounds.width,
                    height: position.bboxHeight || part.bounds.height,
                    baseWidth: part.bounds.width,
                    baseHeight: part.bounds.height,
                    rotation: position.rotation || 0,
                    angle: position.angle || 0,
                    polygon: position.positionedHull,
                    outline: (typeof N.getPartPolygons === 'function') ? N.getPartPolygons(part) : null,
                    refPoint: position.refPoint,
                    pierceCount: (typeof N.countPartPierces === 'function') ? N.countPartPierces(part) : 0
                };

                newNestedParts.push(nestedPart);

                placedPolygons.push({
                    positionedHull: position.positionedHull,
                    positionedPolygons: position.positionedPolygons || null,
                    x: position.x,
                    y: position.y,
                    partId: part.id,
                    part: part,
                    angle: position.angle || 0,
                    rotation: position.rotation || 0,
                    width: position.bboxWidth || part.bounds.width,
                    height: position.bboxHeight || part.bounds.height
                });

                N.addToSpatialGrid(spatialGrid, placedPolygons[placedPolygons.length - 1]);
                placedCount++;
            } else {
                unplacedCount++;
            }
        }

        if (unplacedCount > 0) {
            unplacedParts.push({
                partId: part.id,
                quantity: unplacedCount,
                placed: placedCount,
                total: part.quantity
            });
        }

        N.info(`📦 [INCREMENTAL] ${part.name || part.id}: размещено ${placedCount}/${part.quantity}`);
    }

    const elapsed = (performance.now() - startTime) / 1000;
    const sheetArea = sheetSize.width * sheetSize.height;
    const totalPartsArea = [...existingNestedParts, ...newNestedParts].reduce((s, n) => {
        return s + (n.width || 0) * (n.height || 0);
    }, 0);
    const utilization = sheetArea > 0 ? Math.round((totalPartsArea / sheetArea) * 100) : 0;

    N.info(`✅ [INCREMENTAL] готово за ${elapsed.toFixed(2)}с: +${newNestedParts.length} новых, утилизация ${utilization}%`);

    return _restoreAndReturn({
        nestedParts: newNestedParts,
        unplacedParts: unplacedParts,
        utilization: utilization
    });
};

// ─────────────────────────────────────────────────────────────
// Global Export
// ─────────────────────────────────────────────────────────────
window.pointInPolygon = N.isPointInPolygon;
window.performNesting = N.performNesting;
window.performIncrementalNesting = N.performIncrementalNesting;
})(window.Nesting = window.Nesting || {});