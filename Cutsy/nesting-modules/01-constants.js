// ════════════════════════════════════════════════════════════════
// SilikinK Nesting Engine — Constants & Config (Module 01)
// ════════════════════════════════════════════════════════════════
(function(N) {
    'use strict';
    
// ═══════════════════════════════════════════════════════════════
// SilikinK Nesting Engine — Core Module v3.66
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// Debug & Precision System
// ─────────────────────────────────────────────────────────────
N.DEBUG = false; // Установить true для полной диагностики
N.VERSION = '4.22';

// debug — обычная диагностика (только при DEBUG=true)
N.debug = function debug(...args) {
    if (N.DEBUG) console.log('[NEST]', ...args);
}

// info — ключевые сообщения (ВСЕГДА видны в консоли)
// Запуск раскладки, размещения деталей, верификация, итоги
N.info = function info(...args) {
    console.log('[NEST]', ...args);
}

// warn — важные предупреждения (ВСЕГДА видны в консоли)
// Коллизии, отказы размещения, срабатывания safety net
N.warn = function warn(...args) {
    console.warn('[NEST]', ...args);
}

// v3.53: Утилита для определения типа объекта формы.
// Классы из shapes.js (Circle, Rect, etc.) могут не иметь
// свойства .type. Определяем тип по конструктору и свойствам.
N.getShapeType = function getShapeType(obj) {
    if (!obj) return 'unknown';
    if (obj.type) return obj.type;
    // Fallback: определяем по конструктору/свойствам
    // v3.67: Порядок важен! arc/polygon должны идти BEFORE circle,
    // т.к. у них есть те же свойства (cx, cy, radius), плюс доп. поля.
    // Раньше circle шёл первым → arc с cx+cy+radius (без .type)
    // классифицировался как circle → неверная растеризация/халл.
    if (obj.cx !== undefined && obj.cy !== undefined && obj.radius !== undefined && obj.startAngle !== undefined) return 'arc';
    if (obj.cx !== undefined && obj.cy !== undefined && obj.radius !== undefined && obj.sides !== undefined) return 'polygon';
    if (obj.cx !== undefined && obj.cy !== undefined && obj.radius !== undefined) return 'circle';
    if (obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) return 'rect';
    if (obj.x1 !== undefined && obj.y1 !== undefined && obj.x2 !== undefined && obj.y2 !== undefined) return 'line';
    if (obj.points || obj.vertices) return 'polyline';
    return 'unknown';
}

// Единая система epsilon-сравнений
N.EPS = 0.001;       // Общий epsilon для геометрии
N.MERGE_EPS = 0.05;  // Порог слияния вершин (для flood fill)

// v3.59: Консолидированные геометрические константы.
// Раньше магические числа были разбросаны по файлу (0.01, 0.0001, 0.5,
// 0.92, 0.3...) — теперь все в одном месте с говорящими именами.
N.CHAIN_TOLERANCE = Math.max(N.MERGE_EPS * 2, 0.5);  // 0.5мм — для chain-linking сегментов
N.COLLINEAR_EPS = 0.0001;                          // для проверки коллинеарности в onSegment
N.POSITION_EPS = 0.01;                             // для findPositionWithCommonEdge
N.CONCAVE_COVERAGE_THRESHOLD = 0.3;                // extractConcaveOutline: coverage < 30% → fallback на convex hull
N.HULL_BBOX_RATIO = 0.92;                          // getPartBoundingHull: hull > 92% bbox → заменить на bbox
N.CIRCLE_SEGS_FACTOR = 0.4;                        // сегментов = max(16, ceil(radius * 0.4))
N.PIERCE_FULL_CIRCLE_THRESHOLD = Math.PI * 1.95;   // дуга > 350° = полный круг = прокол

N.partHullCache = new Map();
N.SPATIAL_CELL_SIZE = 100; // Адаптивный — пересчитывается в performNesting
N.MAX_CANDIDATES_BASE = 5000; // Базовый лимит (адаптивный)

// v3.39: Адаптивный лимит кандидатов.
// Фиксированный 5000 может быть слишком мал для больших партий
// (5100-й кандидат теряется) или слишком велик для мелких.
// Формула: min(50000, placedParts*40 + base)
N.getMaxCandidates = function getMaxCandidates(placedPartsCount) {
    return Math.min(50000, placedPartsCount * 40 + N.MAX_CANDIDATES_BASE);
}

// v3.40: Адаптивный порог для batch angle estimation.
// Фиксированный 0.75 не учитывает размер партии:
// - 10 деталей: ratio=0.81 → оба угла, но 90° объективно лучше
// - 30 деталей: ratio=0.80 → оба угла, но разница значительна
// Динамический порог: больше деталей → строже отбор
N.getBatchAngleThreshold = function getBatchAngleThreshold(quantity) {
    if (quantity > 20) return 0.90;
    if (quantity > 10) return 0.85;
    return 0.75;
}

// FIX #11: Адаптивный gridSize для occupancy grid.
// Фиксированный 5/10 мм — плохо для очень мелких и крупных деталей.
// Мелкие детали (10мм) при gridSize=10 получают 1 ячейку — неточность.
// Крупные (500мм) при gridSize=5 получают 100×100 — лишняя память.
// v4.01: Для тонкостенных деталей (fillRate < 30%) используем
// более мелкий grid — толстый grid пропускает наложения стенок.
N.getAdaptiveGridSize = function getAdaptiveGridSize(part, minGap) {
    const minDim = Math.min(part.bounds?.width || 100, part.bounds?.height || 100);
    let gridSize = Math.max(
        Math.min(minDim / 40, 10),  // не крупнее 10мм
        minGap / 2,                  // не крупнее половины gap
        2                            // минимум 2мм
    );
    // v4.03: Для тонкостенных деталей (дуги, П-образные) используем
    // очень мелкий grid (1мм). Толстый grid (2-3мм) пропускает наложения
    // тонких стенок (5мм) — стены всего 2-3 ячейки, и при сканировании
    // материал может «проскочить» между ячейками.
    const isThinWalled = part._cachedFillRate !== undefined
        ? part._cachedFillRate < 0.25
        : (N.isLineHeavyPart && N.isLineHeavyPart(part));
    if (isThinWalled) {
        gridSize = Math.max(1, Math.min(gridSize / 3, 1.5));
    }
    return gridSize;
}

N.clearPartHullCache = function clearPartHullCache() {
    // v3.59: Это была неточная копия clearAllCaches, к тому же
    // ссылавшаяся на clearPartHolesCache/N.partGridCache/N.filledGridCache
    // ДО их объявления через const (TDZ при раннем вызове).
    // Теперь — единая точка очистки.
    N.clearAllCaches();
}

// FIX #7: Полная очистка всех кешей — вызывать при:
// - новом проекте
// - очистке сцены
// - изменении gap
// - изменении gridSize
// Без этого при импорте 200 DXF → удалении → новых DXF
// Chrome память будет пухнуть (Map кеши никогда не чистятся)
N.clearAllCaches = function clearAllCaches() {
    N.partHullCache.clear();
    N.partHolesCache.clear();
    N.partGridCache.clear();
    N.filledGridCache.clear();
    // WeakMap (N.polygonBBoxCache) автоматически освобождает
    // память когда объекты-poly собираются GC.
    // Для Map кешей — полная очистка обязательна.
    // Кеши очищены (без лога)
}

// Экспортируем для вызова из UI
window.clearNestingCaches = N.clearAllCaches;

// Cache declarations (used across modules, defined here for availability)
N.partGridCache = new Map();
N.partHolesCache = new Map();
N.filledGridCache = new Map();
N.polygonBBoxCache = new WeakMap();

})(window.Nesting = window.Nesting || {});
