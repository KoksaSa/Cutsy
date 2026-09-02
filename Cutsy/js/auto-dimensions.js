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

console.log('✅ auto-dimensions.js v1.3 загружен');
})();
