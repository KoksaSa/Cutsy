// ════════════════════════════════════════════════════════════════
// SilikinK Nesting Engine — Sheet Bounds & Remnant Checks (Module 07)
// ════════════════════════════════════════════════════════════════
(function(N) {
    'use strict';
    
N.isPolygonInsideSheet = function isPolygonInsideSheet(polygon, sheetWidth, sheetHeight, minGap, edgeGap = null, remnant = null) {
    // v3.58: Edge gap всегда ≥ 0 — детали не должны выходить за край листа
    const gap = Math.max(edgeGap !== null ? edgeGap : minGap, 0);
    for (const p of polygon) {
        if (p.x < gap || p.x > sheetWidth - gap || p.y < gap || p.y > sheetHeight - gap) return false;
    }
    // FIX #5: Если remnant не передан, пробуем глобальный (обратная совместимость)
    // v4.60 FIX: В Web Worker переменные объявлены как self.sheetRemnant,
    // а не var sheetRemnant → typeof sheetRemnant === 'undefined'.
    // Также в Worker нет window, только self.
    if (!remnant) {
        if (typeof sheetRemnant !== 'undefined') {
            remnant = sheetRemnant;
        } else if (typeof self !== 'undefined' && self.sheetRemnant) {
            remnant = self.sheetRemnant;
        } else if (typeof window !== 'undefined' && window.sheetRemnant) {
            remnant = window.sheetRemnant;
        }
    }
    // v4.60 FIX: useRemnant тоже может быть self.useRemnant в Worker
    let _useRemnant = false;
    if (typeof useRemnant !== 'undefined') {
        _useRemnant = useRemnant;
    } else if (typeof self !== 'undefined' && typeof self.useRemnant !== 'undefined') {
        _useRemnant = self.useRemnant;
    } else if (typeof window !== 'undefined' && typeof window.useRemnant !== 'undefined') {
        _useRemnant = window.useRemnant;
    }
    // Если остаток не активен — пропускаем проверку контура
    if (remnant?.outerContour?.length > 0 && _useRemnant) {
        // v4.60 FIX: Получаем isPointInsideContour с поддержкой Worker
        let _ipc = null;
        if (typeof isPointInsideContour === 'function') _ipc = isPointInsideContour;
        else if (typeof self !== 'undefined' && typeof self.isPointInsideContour === 'function') _ipc = self.isPointInsideContour;
        else if (typeof window !== 'undefined' && typeof window.isPointInsideContour === 'function') _ipc = window.isPointInsideContour;

        if (!_ipc) return true; // Нет функции проверки — пропускаем

        // ─── БЫСТРЫЙ ОТБРОС: проверяем центроид полигона ────────
        if (polygon.length >= 3) {
            let cxSum = 0, cySum = 0;
            for (const p of polygon) { cxSum += p.x; cySum += p.y; }
            const centroidX = cxSum / polygon.length;
            const centroidY = cySum / polygon.length;
            if (!_ipc(centroidX, centroidY, remnant.outerContour)) {
                return false;
            }
        }

        // Проверяем КАЖДУЮ вершину полигона против контура остатка
        for (let i = 0; i < polygon.length; i++) {
            const p = polygon[i];
            if (!_ipc(p.x, p.y, remnant.outerContour)) {
                return false;
            }
        }
        // Проверяем, что полигон не пересекает внутренние отверстия
        if (remnant.innerContours && remnant.innerContours.length > 0) {
            for (const hole of remnant.innerContours) {
                for (let i = 0; i < polygon.length; i++) {
                    const p = polygon[i];
                    if (_ipc(p.x, p.y, hole)) {
                        return false;
                    }
                }
            }
        }

        // Проверяем середины рёбер (для вогнутых остатков)
        for (let i = 0; i < polygon.length; i++) {
            const j = (i + 1) % polygon.length;
            const mx = (polygon[i].x + polygon[j].x) / 2;
            const my = (polygon[i].y + polygon[j].y) / 2;
            if (!_ipc(mx, my, remnant.outerContour)) {
                return false;
            }
        }
    }
    return true;
}

N.sheetToLocal = function sheetToLocal(sheetX, sheetY, placedX, placedY, placedAngle, placedW, placedH, origW, origH) {
    if (!placedAngle || Math.abs(placedAngle) < 0.001) {
        // Без поворота — просто сдвиг
        return { x: sheetX - placedX, y: sheetY - placedY };
    }
    // v4.39 FIX #34: используем ОРИГИНАЛЬНЫЕ размеры (origW/origH) для центра вращения.
    // placedW/placedH — это rotated bbox, который при 90°/270° даёт swap W↔H →
    // центр вращения смещается → координаты отверстий рассчитываются неверно.
    // origW/origH — оригинальные размеры детали (до поворота).
    // Если не переданы — fallback на placedW/placedH (backward compat).
    const useW = origW != null ? origW : placedW;
    const useH = origH != null ? origH : placedH;
    // Сдвигаем к началу координат хоста
    const dx = sheetX - placedX;
    const dy = sheetY - placedY;
    // Обратное вращение вокруг центра bbox хоста (оригинальные размеры!)
    const cx = useW / 2, cy = useH / 2;
    const localPt = N.rotatePoint(cx + dx, cy + dy, -placedAngle, cx, cy);
    return { x: localPt.x, y: localPt.y };
}
})(window.Nesting = window.Nesting || {});