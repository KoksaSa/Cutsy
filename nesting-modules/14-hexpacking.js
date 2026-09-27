// ════════════════════════════════════════════════════════════════






(function(N) {
    'use strict';
    
N.tryHexagonalPacking = function tryHexagonalPacking(normalizedHull, refPoint, bbox, newPart, placedParts, sheetWidth, sheetHeight, minGap, edgeGap, cancelCallback, spatialGrid) {
    const diameter = N.getCircleDiameter(newPart);
    if (!diameter) return null;

    const centerDist = Math.max(1, diameter + minGap);
    const rowSpacing = Math.max(1, centerDist * Math.sqrt(3) / 2);
    const rowOffset = centerDist / 2;
    const newRadius = diameter / 2;

    // v3.81: Собираем кандидатов из двух источников:
    // 1) Стандартная гекс-сетка по всему листу
    

    const hexCandidates = [];
    const MAX_HEX_CANDIDATES = 200;
    const seen = new Set();
    const addCandidate = (x, y, positionedHull) => {
        if (hexCandidates.length >= MAX_HEX_CANDIDATES) return;
        const k = `${Math.round(x * 10)},${Math.round(y * 10)}`;
        if (seen.has(k)) return;
        seen.add(k);
        hexCandidates.push({ x, y, rotation: 0, angle: 0, positionedHull, refPoint, bboxWidth: bbox.width, bboxHeight: bbox.height });
    };

    // ═══════════════════════════════════════════════════
    

    

    

    

    

    

    const placedCircles = placedParts.filter(p => p.part && N.isCircularPart(p.part));
    for (const placed of placedCircles) {
        if (cancelCallback?.()) return null;
        const pr = N.getCircleDiameter(placed.part) / 2;
        const pCx = (placed.x || 0) + (placed.width || placed.bboxWidth || 0) / 2;
        const pCy = (placed.y || 0) + (placed.height || placed.bboxHeight || 0) / 2;
        const crossCenterDist = newRadius + pr + minGap;

        // 12 позиций вокруг (каждые 30°) — плотное покрытие
        for (let angleDeg = 0; angleDeg < 360; angleDeg += 30) {
            const angleRad = angleDeg * Math.PI / 180;
            const newCx = pCx + crossCenterDist * Math.cos(angleRad);
            const newCy = pCy + crossCenterDist * Math.sin(angleRad);
            const x = newCx - newRadius;
            const y = newCy - newRadius;

            if (x < edgeGap || y < edgeGap || x + bbox.width > sheetWidth - edgeGap || y + bbox.height > sheetHeight - edgeGap) continue;

            const positionedHull = N.translatePolygon(normalizedHull, x, y);
            if (!N.isPolygonInsideSheet(positionedHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;

            let canPlace = true;
            const toCheck = spatialGrid ? N.getNearbyParts(spatialGrid, x - minGap, y - minGap, bbox.width + minGap * 2, bbox.height + minGap * 2) : placedParts;
            for (const other of toCheck) {
                if (cancelCallback?.()) return null;
                if (other.part && N.isCircularPart(other.part)) {
                    const or2 = N.getCircleDiameter(other.part) / 2;
                    const oCx = (other.x || 0) + (other.width || other.bboxWidth || 0) / 2;
                    const oCy = (other.y || 0) + (other.height || other.bboxHeight || 0) / 2;
                    const dist = Math.hypot((x + newRadius) - oCx, (y + newRadius) - oCy);
                    if (dist < newRadius + or2 + minGap - 0.01) { canPlace = false; break; }
                } else if (other.positionedHull?.length) {
                    if (N.polygonsIntersect(positionedHull, other.positionedHull, minGap)) { canPlace = false; break; }
                } else {
                    const pw = other.width || other.bboxWidth || 0;
                    const ph = other.height || other.bboxHeight || 0;
                    if (x < other.x + pw + minGap && x + bbox.width + minGap > other.x &&
                        y < other.y + ph + minGap && y + bbox.height + minGap > other.y) {
                        canPlace = false; break;
                    }
                }
            }
            if (canPlace) addCandidate(x, y, positionedHull);
        }
    }

    // ═══════════════════════════════════════════════════
    

    

    

    

    

    

    

    for (let i = 0; i < placedCircles.length && hexCandidates.length < MAX_HEX_CANDIDATES; i++) {
        if (cancelCallback?.()) return null;
        const p1 = placedCircles[i];
        const r1 = N.getCircleDiameter(p1.part) / 2;
        const cx1 = (p1.x || 0) + (p1.width || p1.bboxWidth || 0) / 2;
        const cy1 = (p1.y || 0) + (p1.height || p1.bboxHeight || 0) / 2;
        const dist1 = r1 + newRadius + minGap; // расстояние от центра p1 до центра нового

        for (let j = i + 1; j < placedCircles.length && hexCandidates.length < MAX_HEX_CANDIDATES; j++) {
            const p2 = placedCircles[j];
            const r2 = N.getCircleDiameter(p2.part) / 2;
            const cx2 = (p2.x || 0) + (p2.width || p2.bboxWidth || 0) / 2;
            const cy2 = (p2.y || 0) + (p2.height || p2.bboxHeight || 0) / 2;
            const dist2 = r2 + newRadius + minGap; // расстояние от центра p2 до центра нового

            const d = Math.hypot(cx2 - cx1, cy2 - cy1);

            // Новый круг может поместиться между p1 и p2, если
            

            if (d >= dist1 + dist2 || d <= Math.abs(dist1 - dist2) + 0.01) continue;

            // Вычисляем центр(ы) нового круга — пересечение двух
            

            const a = (dist1 * dist1 - dist2 * dist2 + d * d) / (2 * d);
            const hSq = dist1 * dist1 - a * a;
            if (hSq < 0) continue;
            const h = Math.sqrt(hSq);

            const px = cx1 + a * (cx2 - cx1) / d;
            const py = cy1 + a * (cy2 - cy1) / d;

            // Два возможных положения (по обе стороны линии p1-p2)
            for (const sign of [1, -1]) {
                const interCx = px + sign * h * (cy2 - cy1) / d;
                const interCy = py - sign * h * (cx2 - cx1) / d;
                const x = interCx - newRadius;
                const y = interCy - newRadius;

                if (x < edgeGap || y < edgeGap || x + bbox.width > sheetWidth - edgeGap || y + bbox.height > sheetHeight - edgeGap) continue;

                const positionedHull = N.translatePolygon(normalizedHull, x, y);
                if (!N.isPolygonInsideSheet(positionedHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;

                let canPlace = true;
                const toCheck = spatialGrid ? N.getNearbyParts(spatialGrid, x - minGap, y - minGap, bbox.width + minGap * 2, bbox.height + minGap * 2) : placedParts;
                for (const other of toCheck) {
                    if (cancelCallback?.()) return null;
                    if (other.part && N.isCircularPart(other.part)) {
                        const or2 = N.getCircleDiameter(other.part) / 2;
                        const oCx = (other.x || 0) + (other.width || other.bboxWidth || 0) / 2;
                        const oCy = (other.y || 0) + (other.height || other.bboxHeight || 0) / 2;
                        const dd = Math.hypot(interCx - oCx, interCy - oCy);
                        if (dd < newRadius + or2 + minGap - 0.01) { canPlace = false; break; }
                    } else if (other.positionedHull?.length) {
                        if (N.polygonsIntersect(positionedHull, other.positionedHull, minGap)) { canPlace = false; break; }
                    } else {
                        const pw = other.width || other.bboxWidth || 0;
                        const ph = other.height || other.bboxHeight || 0;
                        if (x < other.x + pw + minGap && x + bbox.width + minGap > other.x &&
                            y < other.y + ph + minGap && y + bbox.height + minGap > other.y) {
                            canPlace = false; break;
                        }
                    }
                }
                if (canPlace) addCandidate(x, y, positionedHull);
            }
        }
    }

    // ═══════════════════════════════════════════════════
    

    

    let rowNum = 0;
    for (let y = edgeGap; y <= sheetHeight - bbox.height - edgeGap; y += rowSpacing) {
        if (cancelCallback?.()) return null;
        if (hexCandidates.length >= MAX_HEX_CANDIDATES) break;
        const xOff = (rowNum % 2 === 1) ? rowOffset : 0;

        for (let x = edgeGap + xOff; x <= sheetWidth - bbox.width - edgeGap; x += centerDist) {
            if (cancelCallback && Math.round(x) % 50 === 0 && cancelCallback()) return null;
            if (hexCandidates.length >= MAX_HEX_CANDIDATES) break;

            const positionedHull = N.translatePolygon(normalizedHull, x, y);
            if (!N.isPolygonInsideSheet(positionedHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;

            let canPlace = true;
            const toCheck = spatialGrid ? N.getNearbyParts(spatialGrid, x, y, bbox.width, bbox.height) : placedParts;

            for (const placed of toCheck) {
                if (cancelCallback?.()) return null;
                if (placed.part && N.isCircularPart(placed.part)) {
                    const pr = N.getCircleDiameter(placed.part) / 2;
                    const dist = Math.hypot((x + newRadius) - (placed.x + pr), (y + newRadius) - (placed.y + pr));
                    if (dist < newRadius + pr + minGap - 0.01) { canPlace = false; break; }
                } else if (placed.positionedHull?.length) {
                    if (N.polygonsIntersect(positionedHull, placed.positionedHull, minGap)) { canPlace = false; break; }
                } else {
                    const pw = placed.width || placed.bboxWidth || 0;
                    const ph = placed.height || placed.bboxHeight || 0;
                    if (x < placed.x + pw && x + bbox.width > placed.x && y < placed.y + ph && y + bbox.height > placed.y) {
                        canPlace = false; break;
                    }
                }
            }

            if (canPlace) addCandidate(x, y, positionedHull);
        }
        rowNum++;
    }

    if (hexCandidates.length === 0) return null;

    // v3.81: Сортируем по BLF (сначала нижние, затем левые)
    hexCandidates.sort((a, b) => (a.y * sheetWidth + a.x) - (b.y * sheetWidth + b.x));
    return hexCandidates[0];
}

// ════════════════════════════════════════════════════════════════








// Стратегия (v3.81 — расширена):
// 1) Если есть детали того же типа — гекс-позиции вокруг














// Это позволяет маленьким кругам вставать вплотную к




N.tryCircleQuickPlace = function tryCircleQuickPlace(normalizedHull, refPoint, bbox, newPart, placedParts, sheetWidth, sheetHeight, minGap, edgeGap, cancelCallback, spatialGrid) {
    const diameter = N.getCircleDiameter(newPart);
    if (!diameter) return null;

    const newRadius = diameter / 2;
    const sameCenterDist = diameter + minGap; // расстояние между центрами одинаковых кругов
    const sameRowSpacing = sameCenterDist * Math.sqrt(3) / 2; // вертикальный шаг гекс-упаковки

    

    const sameTypePlaced = placedParts.filter(p => p.partId === newPart.id);

    // v3.81: Также собираем ВСЕ размещённые круглые детали (разных типов)
    const allCircularPlaced = placedParts.filter(p => p.part && N.isCircularPart(p.part));

    const circleCandidates = [];

    // ═══════════════════════════════════════════════════
    

    

    

    if (sameTypePlaced.length > 0) {
        const lastSame = sameTypePlaced[sameTypePlaced.length - 1];
        const lastCx = (lastSame.x || 0) + (lastSame.width || lastSame.bboxWidth || 0) / 2;
        const lastCy = (lastSame.y || 0) + (lastSame.height || lastSame.bboxHeight || 0) / 2;

        // 6 гексагональных позиций вокруг lastSame
        const hexAngles = [0, 60, 120, 180, 240, 300];
        for (const angleDeg of hexAngles) {
            if (cancelCallback?.()) return null;
            const angleRad = angleDeg * Math.PI / 180;
            const newCx = lastCx + sameCenterDist * Math.cos(angleRad);
            const newCy = lastCy + sameCenterDist * Math.sin(angleRad);
            const x = newCx - newRadius;
            const y = newCy - newRadius;

            if (x < edgeGap || y < edgeGap || x + bbox.width > sheetWidth - edgeGap || y + bbox.height > sheetHeight - edgeGap) continue;
            circleCandidates.push({ x, y, angleDeg, blfScore: y * sheetWidth + x });
        }

        // "Вслед" — правее в том же ряду
        const lastRowY = lastSame.y || 0;
        const lastRowH = lastSame.height || lastSame.bboxWidth || 0;
        const yTol = lastRowH + minGap;
        const sameRowParts = sameTypePlaced.filter(p => Math.abs((p.y || 0) - lastRowY) <= yTol);
        const rightmostX = Math.max(...sameRowParts.map(p => (p.x || 0) + (p.width || p.bboxWidth || 0)));

        const followX = rightmostX + minGap;
        const followY = lastRowY;
        if (followX + bbox.width <= sheetWidth - edgeGap && followY >= edgeGap && followY + bbox.height <= sheetHeight - edgeGap) {
            circleCandidates.push({ x: followX, y: followY, angleDeg: -1, blfScore: followY * sheetWidth + followX });
        }

        // "Новый ряд" — ниже всех деталей того же типа
        const rowYs = [];
        for (const p of sameTypePlaced) {
            const py = p.y || 0;
            if (!rowYs.some(ry => Math.abs(ry - py) <= yTol)) rowYs.push(py);
        }
        rowYs.sort((a, b) => a - b);
        const rowCount = rowYs.length;
        const newRowY = (rowYs[rowYs.length - 1] || edgeGap) + sameRowSpacing;
        const hexOffset = (rowCount % 2 === 1) ? sameCenterDist / 2 : 0;
        const newRowX = edgeGap + hexOffset;

        if (newRowY + bbox.height <= sheetHeight - edgeGap && newRowX + bbox.width <= sheetWidth - edgeGap) {
            circleCandidates.push({ x: newRowX, y: newRowY, angleDeg: -2, blfScore: newRowY * sheetWidth + newRowX });
        }
        if (edgeGap + bbox.width <= sheetWidth - edgeGap && newRowY + bbox.height <= sheetHeight - edgeGap && hexOffset > 0) {
            circleCandidates.push({ x: edgeGap, y: newRowY, angleDeg: -3, blfScore: newRowY * sheetWidth + edgeGap });
        }
    }

    // ═══════════════════════════════════════════════════
    

    

    // маленькие круги могут встать вплотную к большим.
    

    

    

    const sameTypeIds = new Set(sameTypePlaced.map(p => p.partId));
    const crossTypeCircles = allCircularPlaced.filter(p => !sameTypeIds.has(p.partId) || sameTypePlaced.length === 0);

    for (const placed of crossTypeCircles) {
        if (cancelCallback?.()) return null;
        const pr = N.getCircleDiameter(placed.part) / 2;
        const pCx = (placed.x || 0) + (placed.width || placed.bboxWidth || 0) / 2;
        const pCy = (placed.y || 0) + (placed.height || placed.bboxHeight || 0) / 2;
        const crossDist = newRadius + pr + minGap;

        // 12 позиций вокруг (каждые 30°) для плотного покрытия
        for (let angleDeg = 0; angleDeg < 360; angleDeg += 30) {
            const angleRad = angleDeg * Math.PI / 180;
            const newCx = pCx + crossDist * Math.cos(angleRad);
            const newCy = pCy + crossDist * Math.sin(angleRad);
            const x = newCx - newRadius;
            const y = newCy - newRadius;

            if (x < edgeGap || y < edgeGap || x + bbox.width > sheetWidth - edgeGap || y + bbox.height > sheetHeight - edgeGap) continue;
            circleCandidates.push({ x, y, angleDeg, blfScore: y * sheetWidth + x, isCrossType: true });
        }
    }

    // ═══════════════════════════════════════════════════
    

    

    

    

    

    // Геометрия: пересечение двух окружностей с центрами
    

    

    const MAX_INTERSTITIAL_PAIRS = 50; // ограничиваем для скорости
    let interstitialCount = 0;
    for (let i = 0; i < allCircularPlaced.length && interstitialCount < MAX_INTERSTITIAL_PAIRS; i++) {
        if (cancelCallback?.()) return null;
        const p1 = allCircularPlaced[i];
        const r1 = N.getCircleDiameter(p1.part) / 2;
        const cx1 = (p1.x || 0) + (p1.width || p1.bboxWidth || 0) / 2;
        const cy1 = (p1.y || 0) + (p1.height || p1.bboxHeight || 0) / 2;
        const dist1 = r1 + newRadius + minGap;

        for (let j = i + 1; j < allCircularPlaced.length && interstitialCount < MAX_INTERSTITIAL_PAIRS; j++) {
            const p2 = allCircularPlaced[j];
            const r2 = N.getCircleDiameter(p2.part) / 2;
            const cx2 = (p2.x || 0) + (p2.width || p2.bboxWidth || 0) / 2;
            const cy2 = (p2.y || 0) + (p2.height || p2.bboxHeight || 0) / 2;
            const dist2 = r2 + newRadius + minGap;

            const d = Math.hypot(cx2 - cx1, cy2 - cy1);

            // Проверяем что треугольник существует
            if (d >= dist1 + dist2 - 0.01 || d <= Math.abs(dist1 - dist2) + 0.01) continue;

            // Вычисляем центр(ы) нового круга
            const a = (dist1 * dist1 - dist2 * dist2 + d * d) / (2 * d);
            const hSq = dist1 * dist1 - a * a;
            if (hSq < 0) continue;
            const h = Math.sqrt(Math.max(0, hSq));

            const px = cx1 + a * (cx2 - cx1) / d;
            const py = cy1 + a * (cy2 - cy1) / d;

            for (const sign of [1, -1]) {
                const interCx = px + sign * h * (cy2 - cy1) / d;
                const interCy = py - sign * h * (cx2 - cx1) / d;
                const x = interCx - newRadius;
                const y = interCy - newRadius;

                if (x < edgeGap || y < edgeGap || x + bbox.width > sheetWidth - edgeGap || y + bbox.height > sheetHeight - edgeGap) continue;
                circleCandidates.push({ x, y, angleDeg: -10, blfScore: y * sheetWidth + x, isInterstitial: true });
            }
            interstitialCount++;
        }
    }

    if (circleCandidates.length === 0) return null;

    // Сортируем по BLF (лучшие — ближе к началу координат)
    circleCandidates.sort((a, b) => a.blfScore - b.blfScore);

    // ═══════════════════════════════════════════════════
    

    

    for (const cand of circleCandidates) {
        if (cancelCallback?.()) return null;
        const { x, y } = cand;

        const positionedHull = N.translatePolygon(normalizedHull, x, y);
        if (!N.isPolygonInsideSheet(positionedHull, sheetWidth, sheetHeight, minGap, edgeGap)) continue;

        let canPlace = true;
        const toCheck = spatialGrid
            ? N.getNearbyParts(spatialGrid, x - minGap, y - minGap, bbox.width + minGap * 2, bbox.height + minGap * 2)
            : placedParts;

        for (const placed of toCheck) {
            if (cancelCallback?.()) return null;
            if (placed.part && N.isCircularPart(placed.part)) {
                const pr = N.getCircleDiameter(placed.part) / 2;
                const pCx = (placed.x || 0) + (placed.width || placed.bboxWidth || 0) / 2;
                const pCy = (placed.y || 0) + (placed.height || placed.bboxHeight || 0) / 2;
                const nCx = x + newRadius;
                const nCy = y + newRadius;
                const dist = Math.hypot(nCx - pCx, nCy - pCy);
                if (dist < newRadius + pr + minGap - 0.01) { canPlace = false; break; }
            } else if (placed.positionedHull?.length) {
                if (N.polygonsIntersect(positionedHull, placed.positionedHull, minGap)) { canPlace = false; break; }
            } else {
                const pw = placed.width || placed.bboxWidth || 0;
                const ph = placed.height || placed.bboxHeight || 0;
                if (x < placed.x + pw + minGap && x + bbox.width + minGap > placed.x &&
                    y < placed.y + ph + minGap && y + bbox.height + minGap > placed.y) {
                    canPlace = false; break;
                }
            }
        }

        if (canPlace) {
            return { x, y, rotation: 0, angle: 0, positionedHull, refPoint, bboxWidth: bbox.width, bboxHeight: bbox.height };
        }
    }

    return null; // Ни одна позиция не подошла
}

// ════════════════════════════════════════════════════════════════








// ИСТОРИЯ ПРОБЛЕМ:
// v3.82: 1 круг в центре кольца → центр блокирует другие позиции












//         - Реальный innerR из DXF-объектов (не bbox-оценка)










// Конфигурации:
// - 3 круга (треугольник, 120°) — если maxD ≥ minD3






N.tryCircleInRingPlace = function tryCircleInRingPlace(normalizedHull, refPoint, bbox, newPart, placedParts, sheetWidth, sheetHeight, minGap, edgeGap, cancelCallback, spatialGrid) {
    const diameter = N.getCircleDiameter(newPart);
    if (!diameter) return null;
    const newRadius = diameter / 2;

    const candidates = [];

    // Находим размещённые кольцевые детали (круги с концентрическими отверстиями)
    let ringDebugLogged = false;
    for (const placed of placedParts) {
        if (cancelCallback?.()) return null;
        if (!placed.part || !N.isCircularPart(placed.part)) continue;

        const holes = N.getPartHoles(placed.part);
        const concentricHole = holes.find(h => h.isConcentricHole);
        if (!concentricHole) continue;

        // v3.85: Вычисляем РЕАЛЬНЫЙ внутренний радиус из DXF-объектов кольца.
        

        // а отверстие круглое — углы bbox выходят за пределы круга.
        

        const bboxInnerR = Math.min(concentricHole.width, concentricHole.height) / 2;
        let actualInnerR = bboxInnerR; // fallback
        const partCircles = (placed.part.objects || []).filter(o => N.getShapeType(o) === 'circle');
        if (partCircles.length >= 2) {
            // Ищем пару концентрических кругов (одинаковый центр, разный радиус)
            

            partCircles.sort((a, b) => (a.radius || 0) - (b.radius || 0));
            // Проверяем концентричность (центры совпадают с допуском 1мм)
            for (let i = 0; i < partCircles.length - 1; i++) {
                for (let j = i + 1; j < partCircles.length; j++) {
                    const ci = partCircles[i], cj = partCircles[j];
                    const cDist = Math.hypot((ci.cx||0)-(cj.cx||0), (ci.cy||0)-(cj.cy||0));
                    if (cDist < 1) { // концентрические
                        actualInnerR = Math.min(ci.radius || 0, cj.radius || 0);
                        break;
                    }
                }
                if (actualInnerR !== bboxInnerR) break;
            }
        }

        // v3.87: Debug log убран — слишком шумный при многих деталях

        const holeInnerR = actualInnerR; // Используем реальный innerR!

        // Проверяем: помещается ли хотя бы 1 новый круг внутри отверстия?
        if (newRadius + minGap > holeInnerR) continue;

        // Вычисляем центр отверстия на листе
        const localHoleCx = concentricHole.x + concentricHole.width / 2;
        const localHoleCy = concentricHole.y + concentricHole.height / 2;

        const placedAngle = placed.angle || 0;
        // v4.36 FIX #59: используем ОРИГИНАЛЬНЫЕ размеры детали (baseWidth/baseHeight)
        

        // но для circle+text или несимметричных колец placed.width/height — это rotated
        

        const placedBaseW = placed.baseWidth || placed.width || placed.bboxWidth || 0;
        const placedBaseH = placed.baseHeight || placed.height || placed.bboxHeight || 0;

        let holeSheetCx, holeSheetCy;
        if (Math.abs(placedAngle) > 0.01) {
            const rotPt = N.rotatePoint(localHoleCx, localHoleCy, placedAngle, placedBaseW / 2, placedBaseH / 2);
            holeSheetCx = (placed.x || 0) + rotPt.x;
            holeSheetCy = (placed.y || 0) + rotPt.y;
        } else {
            holeSheetCx = (placed.x || 0) + localHoleCx;
            holeSheetCy = (placed.y || 0) + localHoleCy;
        }

        // ═══════════════════════════════════════════════════
        

        

        

        // Ключевое изменение: используем actualInnerR из DXF-данных,
        // а не bbox-оценку. Также добавлен запас 3мм к fitD для
        

        

        const maxD = holeInnerR - newRadius - minGap;

        // Для 3 кругов в треугольнике (120° друг от друга):
        // Расстояние между соседними = d * √3 ≥ 2*newR + minGap
        const minD3 = (2 * newRadius + minGap) / Math.sqrt(3);

        // Для 2 кругов бок о бок:
        // Расстояние между ними = 2*d ≥ 2*newR + minGap
        const minD2 = newRadius + minGap / 2;

        // v3.85: Запас 3мм — компенсация неточностей grid на границе
        const SAFETY_MM = 3;

        let fitCount, fitD;
        if (maxD >= minD3 + SAFETY_MM) {
            // 3 круга в треугольнике — ЛУЧШИЙ вариант
            fitCount = 3;
            fitD = (minD3 + maxD - SAFETY_MM) / 2; // оптимальное с запасом
        } else if (maxD >= minD2 + SAFETY_MM) {
            // 2 круга бок о бок
            fitCount = 2;
            fitD = (minD2 + maxD - SAFETY_MM) / 2;
        } else if (maxD >= 0) {
            // Только 1 круг в центре
            fitCount = 1;
            fitD = 0;
        } else {
            continue; // Даже 1 не помещается
        }

        if (fitCount >= 3) {
            // Треугольник: 3 позиции на расстоянии fitD от центра, 120° друг от друга
            

            

            const triAngles = [210, 330, 90];
            for (const aDeg of triAngles) {
                const aRad = aDeg * Math.PI / 180;
                const cx = holeSheetCx + fitD * Math.cos(aRad) - newRadius;
                const cy = holeSheetCy + fitD * Math.sin(aRad) - newRadius;
                if (cx >= edgeGap && cy >= edgeGap && cx + bbox.width <= sheetWidth - edgeGap && cy + bbox.height <= sheetHeight - edgeGap) {
                    candidates.push({
                        x: cx, y: cy,
                        blfScore: cy * sheetWidth + cx,
                        isCentered: false,
                        arrangement: 'треуг.',
                        innerR: holeInnerR,
                        fitD: fitD,
                        holeSheetCx, holeSheetCy,
                        ringPart: placed
                    });
                }
            }
        } else if (fitCount >= 2) {
            // Бок о бок: 2 позиции на расстоянии fitD от центра, 180° друг от друга
            const pairAngles = [180, 0]; // левая, правая
            for (const aDeg of pairAngles) {
                const aRad = aDeg * Math.PI / 180;
                const cx = holeSheetCx + fitD * Math.cos(aRad) - newRadius;
                const cy = holeSheetCy + fitD * Math.sin(aRad) - newRadius;
                if (cx >= edgeGap && cy >= edgeGap && cx + bbox.width <= sheetWidth - edgeGap && cy + bbox.height <= sheetHeight - edgeGap) {
                    candidates.push({
                        x: cx, y: cy,
                        blfScore: cy * sheetWidth + cx,
                        isCentered: false,
                        arrangement: 'пара',
                        innerR: holeInnerR,
                        fitD: fitD,
                        holeSheetCx, holeSheetCy,
                        ringPart: placed
                    });
                }
            }
        } else {
            // 1 круг в центре (отверстие слишком маленькое для 2+)
            const cx = holeSheetCx - newRadius;
            const cy = holeSheetCy - newRadius;
            if (cx >= edgeGap && cy >= edgeGap && cx + bbox.width <= sheetWidth - edgeGap && cy + bbox.height <= sheetHeight - edgeGap) {
                candidates.push({
                    x: cx, y: cy,
                    blfScore: cy * sheetWidth + cx,
                    isCentered: true,
                    arrangement: 'центр',
                    innerR: holeInnerR,
                    fitD: 0,
                    holeSheetCx, holeSheetCy,
                    ringPart: placed
                });
            }
        }
    }

    if (candidates.length === 0) {
        return null;
    }

    // Сортируем по BLF (сначала нижние-левые)
    candidates.sort((a, b) => a.blfScore - b.blfScore);

    // Проверяем каждую позицию на столкновения
    let rejectReasons = {}; // v3.85: диагностика отказов
    for (const cand of candidates) {
        if (cancelCallback?.()) return null;
        const { x, y, ringPart } = cand;

        const positionedHull = N.translatePolygon(normalizedHull, x, y);
        if (!N.isPolygonInsideSheet(positionedHull, sheetWidth, sheetHeight, minGap, edgeGap)) {
            rejectReasons['outside_sheet'] = (rejectReasons['outside_sheet'] || 0) + 1;
            continue;
        }

        let canPlace = true;
        let rejectReason = '';
        const toCheck = spatialGrid
            ? N.getNearbyParts(spatialGrid, x - minGap, y - minGap, bbox.width + minGap * 2, bbox.height + minGap * 2)
            : placedParts;

        for (const other of toCheck) {
            if (cancelCallback?.()) return null;

            if (other === ringPart) {
                // ═══════════════════════════════════════════════════
                

                //
                // gridsOverlap страдает от дискретизации grid на круговой
                

                

                

                // кроме 90° (которая случайно проходит из-за rounding).
                

                // Математическая проверка: малый круг полностью внутри
                

                // newRadius + minGap ≤ innerR
                

                

                const nCx = x + newRadius;
                const nCy = y + newRadius;
                const distToHoleCenter = Math.hypot(nCx - cand.holeSheetCx, nCy - cand.holeSheetCy);
                const clearance = cand.innerR - distToHoleCenter - newRadius - minGap;
                if (clearance < -0.5) { // допуск 0.5мм на округление
                    rejectReason = `math:dist=${distToHoleCenter.toFixed(1)}+R${newRadius}+gap${minGap}=${(distToHoleCenter+newRadius+minGap).toFixed(1)}>innerR=${cand.innerR.toFixed(0)}(clearance=${clearance.toFixed(1)}мм)`;
                    canPlace = false; break;
                }
                continue;
            }

            // Другие размещённые детали
            if (other.part && N.isCircularPart(other.part)) {
                const or2 = N.getCircleDiameter(other.part) / 2;
                const oCx = (other.x || 0) + (other.width || other.bboxWidth || 0) / 2;
                const oCy = (other.y || 0) + (other.height || other.bboxHeight || 0) / 2;
                const dist = Math.hypot((x + newRadius) - oCx, (y + newRadius) - oCy);
                // v3.85: Для кольцевых деталей (с концентрическими отверстиями)
                

                // Если да — не блокируем (он в пустоте, не на материале).
                const otherHoles = N.getPartHoles(other.part);
                const otherConcentric = otherHoles.find(h => h.isConcentricHole);
                if (otherConcentric) {
                    // Другое кольцо: малый круг может быть внутри его отверстия
                    

                    const oLocalCx = otherConcentric.x + otherConcentric.width / 2;
                    const oLocalCy = otherConcentric.y + otherConcentric.height / 2;
                    const oAngle = other.angle || 0;
                    // v4.36 FIX #59: используем ОРИГИНАЛЬНЫЕ размеры (baseWidth/baseHeight)
                    

                    const oBW = other.baseWidth || other.width || other.bboxWidth || 0;
                    const oBH = other.baseHeight || other.height || other.bboxHeight || 0;
                    let oHoleCx, oHoleCy;
                    if (Math.abs(oAngle) > 0.01) {
                        const oRotPt = N.rotatePoint(oLocalCx, oLocalCy, oAngle, oBW / 2, oBH / 2);
                        oHoleCx = (other.x || 0) + oRotPt.x;
                        oHoleCy = (other.y || 0) + oRotPt.y;
                    } else {
                        oHoleCx = (other.x || 0) + oLocalCx;
                        oHoleCy = (other.y || 0) + oLocalCy;
                    }
                    // Реальный innerR другого кольца из DXF
                    const oBboxInnerR = Math.min(otherConcentric.width, otherConcentric.height) / 2;
                    let oActualInnerR = oBboxInnerR;
                    const oCircles = (other.part.objects || []).filter(o => N.getShapeType(o) === 'circle');
                    if (oCircles.length >= 2) {
                        oCircles.sort((a, b) => (a.radius || 0) - (b.radius || 0));
                        for (let i = 0; i < oCircles.length - 1; i++) {
                            for (let j = i + 1; j < oCircles.length; j++) {
                                const ci2 = oCircles[i], cj2 = oCircles[j];
                                const cDist2 = Math.hypot((ci2.cx||0)-(cj2.cx||0), (ci2.cy||0)-(cj2.cy||0));
                                if (cDist2 < 1) {
                                    oActualInnerR = Math.min(ci2.radius || 0, cj2.radius || 0);
                                    break;
                                }
                            }
                            if (oActualInnerR !== oBboxInnerR) break;
                        }
                    }
                    const distToOHole = Math.hypot((x + newRadius) - oHoleCx, (y + newRadius) - oHoleCy);
                    const insideOHole = distToOHole + newRadius + minGap <= oActualInnerR + 0.5;
                    if (insideOHole) {
                        // Малый круг внутри отверстия другого кольца → НЕ блокируем
                        continue;
                    }
                    // Не внутри отверстия — проверяем как обычный круг
                    

                    

                    if (dist < newRadius + oActualInnerR + minGap - 0.01) {
                        // Внутри внутреннего радиуса — это пустота кольца, ОК
                        

                        

                        

                        if (dist < newRadius + or2 + minGap - 0.01) {
                            rejectReason = `ring_other:dist=${dist.toFixed(1)}<${(newRadius+or2+minGap).toFixed(1)}`;
                            canPlace = false; break;
                        }
                    }
                    // Снаружи outerR — не блокируем
                    continue;
                }
                if (dist < newRadius + or2 + minGap - 0.01) {
                    rejectReason = `circle:dist=${dist.toFixed(1)}<${(newRadius+or2+minGap).toFixed(1)}`;
                    canPlace = false; break;
                }
            } else if (other.positionedHull?.length) {
                if (N.polygonsIntersect(positionedHull, other.positionedHull, minGap)) {
                    rejectReason = 'hull_intersect';
                    canPlace = false; break;
                }
            } else {
                const pw = other.width || other.bboxWidth || 0;
                const ph = other.height || other.bboxHeight || 0;
                if (x < other.x + pw + minGap && x + bbox.width + minGap > other.x &&
                    y < other.y + ph + minGap && y + bbox.height + minGap > other.y) {
                    rejectReason = 'bbox_overlap';
                    canPlace = false; break;
                }
            }
        }

        if (canPlace) {
            N.debug(`📐 [NESTING ENGINE] 💍 Circle-in-Ring: "${newPart.name||newPart.id}" внутри "${ringPart.partId}" → (${Math.round(x)},${Math.round(y)}) (${cand.arrangement}, innerR=${Math.round(cand.innerR)}мм, d=${Math.round(cand.fitD)}мм)`);
            return { x, y, rotation: 0, angle: 0, positionedHull, refPoint, bboxWidth: bbox.width, bboxHeight: bbox.height };
        } else {
            // v3.85: Логируем причину отказа (первые 3 уникальные)
            const rKey = rejectReason || 'unknown';
            rejectReasons[rKey] = (rejectReasons[rKey] || 0) + 1;
        }
    }

    // v3.85: Логируем сводку отказов
    const reasonStr = Object.entries(rejectReasons).map(([k,v]) => `${k}×${v}`).join(', ');
    N.debug(`💍 [Circle-in-Ring] все ${candidates.length} кандидатов отклонены для "${newPart.name||newPart.id}": ${reasonStr}`);

    return null;
}
})(window.Nesting = window.Nesting || {});