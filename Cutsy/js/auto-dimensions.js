// ═══════════════════════════════════════════════════════════════
// auto-dimensions.js — v1.3 — Автоматические размеры
// ═══════════════════════════════════════════════════════════════
// Генерирует размерные линии:
//   - Габаритные (dim='gabarit-*') — общий bbox всех объектов
//   - Индивидуальные (dim='individual-*') — bbox каждого объекта
//
// Чекбокс "Только габариты":
//   ВКЛ  — показывать только габаритные, игнорировать остальные
//   ВЫКЛ — показывать все размеры (габаритные + индивидуальные + пользовательские)
// ═══════════════════════════════════════════════════════════════

(function() {
'use strict';

let gabaritOnlyMode = false;
window.gabaritOnlyMode = gabaritOnlyMode;

/**
 * Генерирует размеры для видимых деталей или объектов на холсте.
 * v1.3: генерирует габаритные + индивидуальные размеры.
 * v1.4: stagger — разноска размерных линий для предотвращения наложения текста.
 */
window.autoDimension = function() {
    clearAutoDimensions();

    let hasVisibleParts = false;
    if (typeof parts !== 'undefined' && parts && parts.length > 0) {
        const visibleParts = parts.filter(p => p.visible === true);
        if (visibleParts.length > 0) {
            hasVisibleParts = true;
            for (const part of visibleParts) {
                generatePartDimensions(part);
            }
        }
    }

    if (!hasVisibleParts) {
        if (typeof objects === 'undefined' || !objects || objects.length === 0) {
            alert('⚠️ Нет объектов для простановки размеров');
            return;
        }
        generateObjectDimensions(objects);
    }

    // v1.4: Разносим накладывающиеся размерные линии
    staggerDimensions();

    if (typeof render === 'function') render();
    console.log(`📏 Авто-размеры: сгенерировано`);
};

/**
 * Получить bbox объекта.
 */
function getObjectBBox(obj) {
    if (!obj) return null;
    if (obj.type === 'line') {
        return {
            minX: Math.min(obj.x1, obj.x2), minY: Math.min(obj.y1, obj.y2),
            maxX: Math.max(obj.x1, obj.x2), maxY: Math.max(obj.y1, obj.y2)
        };
    }
    if (obj.type === 'circle' || obj.type === 'arc') {
        const r = Math.abs(obj.radius || 0);
        return { minX: obj.cx - r, minY: obj.cy - r, maxX: obj.cx + r, maxY: obj.cy + r };
    }
    if (obj.type === 'rect') {
        return { minX: obj.x, minY: obj.y, maxX: obj.x + obj.width, maxY: obj.y + obj.height };
    }
    if (obj.type === 'polygon' && obj.points && obj.points.length > 0) {
        return {
            minX: Math.min(...obj.points.map(p => p.x)),
            minY: Math.min(...obj.points.map(p => p.y)),
            maxX: Math.max(...obj.points.map(p => p.x)),
            maxY: Math.max(...obj.points.map(p => p.y))
        };
    }
    if (obj.getPoints && typeof obj.getPoints === 'function') {
        const pts = obj.getPoints();
        if (pts && pts.length > 0) {
            return {
                minX: Math.min(...pts.map(p => p.x)),
                minY: Math.min(...pts.map(p => p.y)),
                maxX: Math.max(...pts.map(p => p.x)),
                maxY: Math.max(...pts.map(p => p.y))
            };
        }
    }
    return null;
}

/**
 * Генерирует размеры для одной детали: габаритные + индивидуальные.
 */
function generatePartDimensions(part) {
    if (!part || !part.bounds) return;
    const b = part.bounds;
    const minX = b.minX || 0;
    const minY = b.minY || 0;
    const maxX = b.maxX || (minX + b.width);
    const maxY = b.maxY || (minY + b.height);
    const w = b.width || (maxX - minX);
    const h = b.height || (maxY - minY);

    // Габаритные размеры (dim='gabarit-*')
    const offsetBottom = 15;
    dimensionLines.push({
        x1: minX, y1: maxY + offsetBottom, x2: maxX, y2: maxY + offsetBottom,
        value: parseFloat(w.toFixed(2)), type: 'auto', partId: part.id, dim: 'gabarit-width'
    });
    const offsetRight = 15;
    dimensionLines.push({
        x1: maxX + offsetRight, y1: minY, x2: maxX + offsetRight, y2: maxY,
        value: parseFloat(h.toFixed(2)), type: 'auto', partId: part.id, dim: 'gabarit-height'
    });

    // Индивидуальные размеры объектов (dim='individual-*')
    if (part.objects && part.objects.length > 0) {
        for (const obj of part.objects) {
            generateIndividualDimension(obj, minX, minY);
        }
    }
}

/**
 * Генерирует размеры для объектов на холсте: габаритные + индивидуальные.
 */
function generateObjectDimensions(objs) {
    let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
    let found = false;

    for (const obj of objs) {
        const bb = getObjectBBox(obj);
        if (!bb) continue;
        gMinX = Math.min(gMinX, bb.minX);
        gMinY = Math.min(gMinY, bb.minY);
        gMaxX = Math.max(gMaxX, bb.maxX);
        gMaxY = Math.max(gMaxY, bb.maxY);
        found = true;
        // Индивидуальные размеры для каждого объекта
        generateIndividualDimension(obj, 0, 0);
    }

    if (!found) return;

    const w = gMaxX - gMinX;
    const h = gMaxY - gMinY;
    if (w < 0.1 && h < 0.1) return;

    // Габаритные размеры (dim='gabarit-*')
    const offsetBottom = 15;
    dimensionLines.push({
        x1: gMinX, y1: gMaxY + offsetBottom, x2: gMaxX, y2: gMaxY + offsetBottom,
        value: parseFloat(w.toFixed(2)), type: 'auto', dim: 'gabarit-width'
    });
    const offsetRight = 15;
    dimensionLines.push({
        x1: gMaxX + offsetRight, y1: gMinY, x2: gMaxX + offsetRight, y2: gMaxY,
        value: parseFloat(h.toFixed(2)), type: 'auto', dim: 'gabarit-height'
    });
}

/**
 * Генерирует индивидуальные размеры для одного объекта (ширина + высота bbox).
 */
function generateIndividualDimension(obj, normX, normY) {
    const bb = getObjectBBox(obj);
    if (!bb) return;
    const w = bb.maxX - bb.minX;
    const h = bb.maxY - bb.minY;
    if (w < 0.1 && h < 0.1) return;

    // Индивидуальный размер ширины (сверху объекта, отступ 8мм)
    const offsetTop = 8;
    dimensionLines.push({
        x1: bb.minX, y1: bb.minY - offsetTop, x2: bb.maxX, y2: bb.minY - offsetTop,
        value: parseFloat(w.toFixed(2)), type: 'auto', dim: 'individual-width'
    });
    // Индивидуальный размер высоты (слева от объекта, отступ 8мм)
    const offsetLeft = 8;
    dimensionLines.push({
        x1: bb.minX - offsetLeft, y1: bb.minY, x2: bb.minX - offsetLeft, y2: bb.maxY,
        value: parseFloat(h.toFixed(2)), type: 'auto', dim: 'individual-height'
    });
}

/**
 * v1.4: Разноска накладывающихся размерных линий.
 * Группирует горизонтальные размеры (ширина) с близкими Y-координатами
 * и вертикальные размеры (высота) с близкими X-координатами,
 * затем увеличивает отступ для каждой следующей линии в группе.
 */
function staggerDimensions() {
    if (!dimensionLines || dimensionLines.length === 0) return;

    const STAGGER_STEP = 14;   // шаг разноски (мм)
    const STAGGER_TOL = 12;    // допуск для определения "близости" (мм)
    const MIN_TEXT_SPACE = 30; // минимальное расстояние между текстами (мм в модельных координатах)

    // Разделяем на горизонтальные (dy≈0) и вертикальные (dx≈0)
    const horizontal = []; // ширина — линия горизонтальная
    const vertical = [];   // высота — линия вертикальная

    for (const dim of dimensionLines) {
        if (dim.type !== 'auto') continue;
        const dx = Math.abs(dim.x2 - dim.x1);
        const dy = Math.abs(dim.y2 - dim.y1);
        if (dx > dy) horizontal.push(dim);
        else vertical.push(dim);
    }

    // --- Горизонтальные размеры: проверяем близость по Y и по X-диапазону ---
    // Сортируем по Y позиции
    horizontal.sort((a, b) => (a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2);

    for (let i = 0; i < horizontal.length; i++) {
        const dim = horizontal[i];
        const midY = (dim.y1 + dim.y2) / 2;
        const midX = (dim.x1 + dim.x2) / 2;
        const halfLen = Math.abs(dim.x2 - dim.x1) / 2;

        // Считаем сколько предыдущих размерных линий близко по Y и пересекаются по X
        let staggerLevel = 0;
        for (let j = 0; j < i; j++) {
            const other = horizontal[j];
            const otherMidY = (other.y1 + other.y2) / 2;
            const otherMidX = (other.x1 + other.x2) / 2;
            const otherHalfLen = Math.abs(other.x2 - other.x1) / 2;
            // Близость по Y
            if (Math.abs(midY - otherMidY) < STAGGER_TOL + staggerLevel * STAGGER_STEP) {
                // Проверяем перекрытие по X (с учётом ширины текста ~MIN_TEXT_SPACE/2)
                const xOverlap = Math.abs(midX - otherMidX) < (halfLen + otherHalfLen + MIN_TEXT_SPACE / 2);
                if (xOverlap) {
                    staggerLevel++;
                }
            }
        }

        if (staggerLevel > 0) {
            // Сдвигаем по Y (от объекта)
            // Для individual-width (сверху, y < объекта) — сдвигаем вверх (больше отрицательный)
            // Для gabarit-width (снизу, y > объекта) — сдвигаем вниз
            const isGabaritBottom = dim.dim && dim.dim.indexOf('gabarit') === 0;
            const dir = isGabaritBottom ? 1 : -1;
            const shift = staggerLevel * STAGGER_STEP * dir;
            dim.y1 += shift;
            dim.y2 += shift;
        }
    }

    // --- Вертикальные размеры: проверяем близость по X и по Y-диапазону ---
    vertical.sort((a, b) => (a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2);

    for (let i = 0; i < vertical.length; i++) {
        const dim = vertical[i];
        const midX = (dim.x1 + dim.x2) / 2;
        const midY = (dim.y1 + dim.y2) / 2;
        const halfLen = Math.abs(dim.y2 - dim.y1) / 2;

        let staggerLevel = 0;
        for (let j = 0; j < i; j++) {
            const other = vertical[j];
            const otherMidX = (other.x1 + other.x2) / 2;
            const otherMidY = (other.y1 + other.y2) / 2;
            const otherHalfLen = Math.abs(other.y2 - other.y1) / 2;
            if (Math.abs(midX - otherMidX) < STAGGER_TOL + staggerLevel * STAGGER_STEP) {
                const yOverlap = Math.abs(midY - otherMidY) < (halfLen + otherHalfLen + MIN_TEXT_SPACE / 2);
                if (yOverlap) {
                    staggerLevel++;
                }
            }
        }

        if (staggerLevel > 0) {
            // Для individual-height (слева, x < объекта) — сдвигаем влево
            // Для gabarit-height (справа, x > объекта) — сдвигаем вправо
            const isGabaritRight = dim.dim && dim.dim.indexOf('gabarit') === 0;
            const dir = isGabaritRight ? 1 : -1;
            const shift = staggerLevel * STAGGER_STEP * dir;
            dim.x1 += shift;
            dim.x2 += shift;
        }
    }
}

/**
 * Удаляет только авторазмеры (type='auto'), сохраняет пользовательские.
 */
function clearAutoDimensions() {
    if (typeof dimensionLines === 'undefined') return;
    for (let i = dimensionLines.length - 1; i >= 0; i--) {
        if (dimensionLines[i].type === 'auto') {
            dimensionLines.splice(i, 1);
        }
    }
}

/**
 * Очищает все размерные линии.
 */
window.clearDimensions = function() {
    if (typeof dimensionLines === 'undefined') return;
    if (typeof saveState === 'function') saveState();
    dimensionLines.length = 0;
    if (typeof selectedDimension !== 'undefined') selectedDimension = null;
    if (typeof render === 'function') render();
    console.log('📏 Все размеры очищены');
};

/**
 * Переключатель режима "только габариты".
 * ВКЛ — рендер показывает только dim='gabarit-*', игнорирует индивидуальные + custom
 * ВЫКЛ — рендер показывает все размеры
 */
window.toggleGabaritOnly = function(checked) {
    gabaritOnlyMode = checked === true;
    window.gabaritOnlyMode = gabaritOnlyMode;
    if (typeof render === 'function') render();
    console.log(`📏 Режим "только габариты": ${gabaritOnlyMode ? 'ВКЛ' : 'ВЫКЛ'}`);
};

console.log('✅ auto-dimensions.js v1.4 загружен');
})();
