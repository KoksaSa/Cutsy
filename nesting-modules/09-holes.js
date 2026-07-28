// ════════════════════════════════════════════════════════════════




(function(N) {
    'use strict';
    
N.detectPartHoles = function detectPartHoles(part, gridSize = 10) {
    const bbox = part.bounds;
    if (!bbox || bbox.width < 20 || bbox.height < 20) return [];

    // ═══════════════════════════════════════════════════
    

    

    

    

    

    

    

    

    

    // отверстие помечается как «подозрительное» и фильтруется.
    const hasSolid = N.hasSolidFill(part);
    // v3.48: Также учитываем детали с арками и полилиниями —
    

    const hasArcObjects = (part.objects || []).some(o => N.getShapeType(o) === 'arc');
    const hasPolyObjects = (part.objects || []).some(o =>
        N.getShapeType(o) === 'polyline' || N.getShapeType(o) === 'lwpolyline'
    );

    // v3.42: Используем filled grid (с flood-fill) вместо
    

    

    // что критично для hole-fill — без flood-fill «дыры»
    

    const adaptiveSize = N.getAdaptiveGridSize(part, 3);
    const fg = N.getFilledOccupancyGrid(part, adaptiveSize);
    if (!fg || fg.gw <= 2 || fg.gh <= 2) return [];

    // v3.42: Если fillRate слишком низкий — grid ненадёжен,
    // не пытаемся искать дыры (это приведёт к ложным отверстиям)
    if (fg.fillRate !== undefined && fg.fillRate < 0.08) {
        // fillRate too low → skip
        return [];
    }

    const grid = fg.grid;
    const gw = fg.gw;
    const gh = fg.gh;

    // v3.54: N.getShapeType() вместо o.type — Circle из shapes.js
    

    const circles = (part.objects || []).filter(o => N.getShapeType(o) === 'circle');
    // holes: ${circles.length} circles, fillRate=${(fg.fillRate*100).toFixed(1)}%
    const isHoleCircle = new Set();
    if (circles.length >= 2) {
        for (let i = 0; i < circles.length; i++) {
            for (let j = 0; j < circles.length; j++) {
                if (i === j) continue;
                const outer = circles[i], inner = circles[j];
                const dist = Math.hypot((inner.cx||0)-(outer.cx||0), (inner.cy||0)-(outer.cy||0));
                if (dist + (inner.radius||0) < (outer.radius||0) - 1) {
                    isHoleCircle.add(part.objects.indexOf(inner));
                }
            }
        }
    }
    // v3.67: Круг внутри прямоугольника = отверстие (как в rasterizePartToGrid)
    const dRects = (part.objects || []).filter(o => N.getShapeType(o) === 'rect');
    if (dRects.length > 0 && circles.length > 0) {
        for (const circ of circles) {
            const ccx = circ.cx || 0, ccy = circ.cy || 0, cr = circ.radius || 0;
            for (const r of dRects) {
                const rx = r.x || 0, ry = r.y || 0, rw = r.width || 0, rh = r.height || 0;
                if (ccx - cr >= rx && ccy - cr >= ry &&
                    ccx + cr <= rx + rw && ccy + cr <= ry + rh) {
                    isHoleCircle.add(part.objects.indexOf(circ));
                    break;
                }
            }
        }
    }

    // v3.73: Grid-based circle detection — круги внутри материала детали.
    

    // - Концентрических кругов нет (круги на разных позициях)
    

    

    // Проверяем: если центр круга находится в ячейке материала (grid=1),
    // значит круг вырезан из материала → это отверстие.
    

    if (isHoleCircle.size === 0 && circles.length > 0 && fg.fillRate >= 0.15) {
        const gs = fg.gridSize; // gridSize из filled grid
        for (const circ of circles) {
            const cr = circ.radius || 0;
            if (cr <= 0) continue;
            // Координаты центра круга в локальной системе детали
            const ccx = (circ.cx || 0) - (bbox.minX || 0);
            const ccy = (circ.cy || 0) - (bbox.minY || 0);
            // Проверяем: центр круга в ячейке материала?
            const gx = Math.floor(ccx / gs);
            const gy = Math.floor(ccy / gs);
            if (gx >= 0 && gx < gw && gy >= 0 && gy < gh && grid[gy * gw + gx] === 1) {
                isHoleCircle.add(part.objects.indexOf(circ));
            }
        }
        if (isHoleCircle.size > 0) {
            // grid-based ${isHoleCircle.size} hole circles
        }
    }

    // v3.48: Убрано ограничение !hasSolidFill — теперь пустоты
    

    

    

    // Теперь: пропускаем только если нет solid fill, нет circle holes,
    // нет arc объектов и нет polyline — т.е. чисто линейные контуры
    

    if (!hasSolid && isHoleCircle.size === 0 && !hasArcObjects && !hasPolyObjects && fg.fillRate < 0.15) {
        // только линии, fillRate too low → пропуск
        return [];
    }

    // BFS: находим связные пустые области
    const visited = new Uint8Array(gw * gh);
    const holes = [];
    const actualGridSize = fg.gridSize; // v3.42: из filled grid

    for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
            const idx = gy * gw + gx;
            if (grid[idx] === 1 || visited[idx] === 1) continue;

            // BFS для связной области
            

            

            

            const queue = [{ x: gx, y: gy }];
            let head = 0;
            visited[idx] = 1;
            let minX = gx, maxX = gx, minY = gy, maxY = gy;
            let cellCount = 0;
            let touchesBoundary = false; // Касается ли границы bbox?

            while (head < queue.length) {
                const cell = queue[head++];
                cellCount++;
                minX = Math.min(minX, cell.x);
                maxX = Math.max(maxX, cell.x);
                minY = Math.min(minY, cell.y);
                maxY = Math.max(maxY, cell.y);

                // Проверяем: ячейка на границе сетки?
                if (cell.x === 0 || cell.x === gw - 1 || cell.y === 0 || cell.y === gh - 1) {
                    touchesBoundary = true;
                }

                // 4-связность
                const neighbors = [
                    { x: cell.x - 1, y: cell.y },
                    { x: cell.x + 1, y: cell.y },
                    { x: cell.x, y: cell.y - 1 },
                    { x: cell.x, y: cell.y + 1 },
                ];
                for (const n of neighbors) {
                    if (n.x < 0 || n.x >= gw || n.y < 0 || n.y >= gh) continue;
                    const ni = n.y * gw + n.x;
                    if (grid[ni] === 1 || visited[ni] === 1) continue;
                    visited[ni] = 1;
                    queue.push(n);
                }
            }

            // Фильтруем: пустая область, касающаяся границы bbox —
            

            

            

            

            if (touchesBoundary) continue;

            // Вычисляем bounding rect пустой области
            const holeX = minX * actualGridSize;
            const holeY = minY * actualGridSize;
            const holeW = (maxX - minX + 1) * actualGridSize;
            const holeH = (maxY - minY + 1) * actualGridSize;

            // Фильтруем: слишком маленькие дыры не интересуют
            

            if (holeW >= actualGridSize * 2 && holeH >= actualGridSize * 2) {
                const totalCells = gw * gh;
                const holePct = totalCells > 0 ? cellCount / totalCells : 0;
                // v3.38: Помечаем подозрительно большие дыры (>50% площади)
                

                

                

                

                

                

                

                

                

                const isSuspicious = !isHoleCircle.size && holePct > 0.35;
                // v3.53→v3.55: isConcentricHole — флаг УРОВНЯ ОТВЕРСТИЯ, а не детали.
                

                

                

                

                

                

                

                let isThisHoleConcentric = false;
                if (isHoleCircle.size > 0) {
                    const holeCx = holeX + holeW / 2;
                    const holeCy = holeY + holeH / 2;
                    for (const holeIdx of isHoleCircle) {
                        const innerCircle = part.objects[holeIdx];
                        if (innerCircle && N.getShapeType(innerCircle) === 'circle') {
                            const dist = Math.hypot(holeCx - ((innerCircle.cx || 0) - (bbox.minX || 0)),
                                                    holeCy - ((innerCircle.cy || 0) - (bbox.minY || 0)));
                            // Если центр дыры внутри или рядом с внутренним кругом
                            if (dist < (innerCircle.radius || 0) + actualGridSize) {
                                isThisHoleConcentric = true;
                                break;
                            }
                        }
                    }
                }
                // v3.74: Убран по-дырный лог — слишком шумно.
                

                holes.push({
                    x: holeX, y: holeY, width: holeW, height: holeH, cells: cellCount,
                    isConcentricHole: isThisHoleConcentric,
                    isSuspicious
                });
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    

    

    // ПРОБЛЕМА: Для крупных деталей (≥400мм) gridSize=10, и круглое
    

    

    

    // РЕШЕНИЕ: Если isHoleCircle содержит круги, чьё отверстие НЕ было
    

    

    

    // Это покрывает два случая:
    // 1) Круг внутри прямоугольника (rect+circle из shapes.js)
    

    

    if (isHoleCircle.size > 0) {
        for (const holeIdx of isHoleCircle) {
            const obj = part.objects[holeIdx];
            if (!obj || N.getShapeType(obj) !== 'circle') continue;

            const cx = (obj.cx || 0) - (bbox.minX || 0);
            const cy = (obj.cy || 0) - (bbox.minY || 0);
            const r = obj.radius || 0;
            if (r <= 0) continue;

            // Bounding box круга в локальных координатах детали
            const geoHoleX = cx - r;
            const geoHoleY = cy - r;
            const geoHoleW = r * 2;
            const geoHoleH = r * 2;

            // Проверяем: уже ли эта дыра найдена BFS?
            // (допуск = actualGridSize, т.к. BFS координаты привязаны к сетке)
            const alreadyFound = holes.some(h =>
                Math.abs(h.x - geoHoleX) < actualGridSize * 2 &&
                Math.abs(h.y - geoHoleY) < actualGridSize * 2 &&
                Math.abs(h.width - geoHoleW) < actualGridSize * 2 &&
                Math.abs(h.height - geoHoleH) < actualGridSize * 2
            );

            if (!alreadyFound) {
                // Определяем: это концентрическое отверстие?
                let isConcentricGeo = false;
                const outerCircles = circles.filter(c => c !== obj);
                for (const outer of outerCircles) {
                    const dist = Math.hypot((obj.cx||0)-(outer.cx||0), (obj.cy||0)-(outer.cy||0));
                    if (dist + r < (outer.radius || 0) - 1) {
                        isConcentricGeo = true;
                        break;
                    }
                }

                // Приблизительное число ячеек для корректной фильтрации
                const approxCells = Math.max(1, Math.round(Math.PI * (r / actualGridSize) ** 2));
                const totalGridCells = gw * gh;
                const holePct = totalGridCells > 0 ? approxCells / totalGridCells : 0;

                holes.push({
                    x: geoHoleX, y: geoHoleY, width: geoHoleW, height: geoHoleH,
                    cells: approxCells,
                    isConcentricHole: isConcentricGeo,
                    isSuspicious: false,
                    isGeometricHole: true  

                });
                // v3.74: Убран по-дырный лог geometric hole injected
            }
        }
    }

    // v3.74: Сводка по найденным дырам
    if (holes.length > 0) {
        const concentricCount = holes.filter(h => h.isConcentricHole).length;
        const geometricCount = holes.filter(h => h.isGeometricHole).length;
        const suspiciousCount = holes.filter(h => h.isSuspicious).length;
        const parts = [];
        if (concentricCount > 0) parts.push(`${concentricCount} конц.`);
        if (geometricCount > 0) parts.push(`${geometricCount} геом.`);
        if (suspiciousCount > 0) parts.push(`${suspiciousCount} подозр.`);
        const rest = holes.length - concentricCount - geometricCount - suspiciousCount;
        if (rest > 0) parts.push(`${rest} grid`);
    // ${holes.length} дыр → ${parts.join('+')}
    }

    return holes;
}

N.getPartHoles = function getPartHoles(part) {
    const key = N.getPartHullCacheKey(part);
    if (N.partHolesCache.has(key)) return N.partHolesCache.get(key);
    const holes = N.detectPartHoles(part);
    N.partHolesCache.set(key, holes);
    return holes;
}

N.clearPartHolesCache = function clearPartHolesCache() {
    N.partHolesCache.clear();
}

N.isRectInPartHole = function isRectInPartHole(part, localX, localY, rectWidth, rectHeight, minGap = 0) {
    // v3.73: Предварительно вычисляем filled grid (кэшировано, быстро).
    

    const adaptiveSize = N.getAdaptiveGridSize(part, minGap || 3);
    const fg = N.getFilledOccupancyGrid(part, adaptiveSize);

    // v3.68: Geometric bypass for circle-in-rect holes.
    

    

    

    // но геометрически деталь действительно помещается в отверстии.
    

    // возвращаем true, минуя grid.
    {
        const circles = (part.objects || []).filter(o => N.getShapeType(o) === 'circle');
        const rects = (part.objects || []).filter(o => N.getShapeType(o) === 'rect');
        const bbox = part.bounds;
        if (bbox && circles.length > 0) {
            for (const circ of circles) {
                const ccx = (circ.cx || 0) - (bbox.minX || 0);
                const ccy = (circ.cy || 0) - (bbox.minY || 0);
                const cr = circ.radius || 0;
                if (cr <= 0) continue;

                // Определяем: это круг-отверстие (внутри rect или внутри другого круга)?
                let isHole = false;
                // Проверка: круг внутри rect?
                for (const r of rects) {
                    const rx = (r.x || 0) - (bbox.minX || 0);
                    const ry = (r.y || 0) - (bbox.minY || 0);
                    const rw = r.width || 0;
                    const rh = r.height || 0;
                    if (ccx - cr >= rx && ccy - cr >= ry &&
                        ccx + cr <= rx + rw && ccy + cr <= ry + rh) {
                        isHole = true;
                        break;
                    }
                }
                // Проверка: концентрический круг?
                if (!isHole) {
                    for (const outer of circles) {
                        if (outer === circ) continue;
                        const dist = Math.hypot((circ.cx||0)-(outer.cx||0), (circ.cy||0)-(outer.cy||0));
                        if (dist + cr < (outer.radius || 0) - 1) {
                            isHole = true;
                            break;
                        }
                    }
                }
                // v3.73: Grid-based check — круг внутри материала детали
                

                if (!isHole && fg && fg.fillRate >= 0.15) {
                    const gx = Math.floor(ccx / fg.gridSize);
                    const gy = Math.floor(ccy / fg.gridSize);
                    if (gx >= 0 && gx < fg.gw && gy >= 0 && gy < fg.gh && fg.grid[gy * fg.gw + gx] === 1) {
                        isHole = true;
                    }
                }

                if (!isHole) continue;

                // Проверяем: помещается ли rect целиком внутри круглого отверстия?
                // Rect corners must all be inside the circle
                const corners = [
                    { x: localX - minGap, y: localY - minGap },
                    { x: localX + rectWidth + minGap, y: localY - minGap },
                    { x: localX - minGap, y: localY + rectHeight + minGap },
                    { x: localX + rectWidth + minGap, y: localY + rectHeight + minGap }
                ];
                const allCornersInside = corners.every(c =>
                    (c.x - ccx) ** 2 + (c.y - ccy) ** 2 <= cr * cr
                );
                if (allCornersInside) {
                    // геом. обход: ${rectWidth}x${rectHeight} в ⌀${(cr*2).toFixed(0)}мм
                    return true;
                }
            }
        }
    }

    if (!fg || fg.gw === 0 || fg.gh === 0) return false;

    // v3.42: SANITY CHECK — если fillRate слишком низкий,
    // значит flood-fill «протёк» через контур и grid ненадёжен.
    

    

    // и «пустоты» в grid — это на самом деле материал детали.
    

    if (fg.fillRate !== undefined && fg.fillRate < 0.08) {
        // fillRate too low → ОТКАЗ hole-fill
        return false;
    }

    const { grid, gw, gh, gridSize } = fg;

    // Проверяем все ячейки, покрытые прямоугольником + gap
    const gx1 = Math.max(0, Math.floor((localX - minGap) / gridSize));
    const gy1 = Math.max(0, Math.floor((localY - minGap) / gridSize));
    const gx2 = Math.min(gw, Math.ceil((localX + rectWidth + minGap) / gridSize));
    const gy2 = Math.min(gh, Math.ceil((localY + rectHeight + minGap) / gridSize));

    for (let gy = gy1; gy < gy2; gy++) {
        for (let gx = gx1; gx < gx2; gx++) {
            if (grid[gy * gw + gx] === 1) return false; // Ячейка занята материалом
        }
    }
    return true;
}
})(window.Nesting = window.Nesting || {});
