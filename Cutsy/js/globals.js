// ═══════════════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ═══════════════════════════════════════════════════════════════

// Элементы canvas
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvasContainer');
const dimensionLabel = document.getElementById('dimensionLabel');
const lineDimensionInput = document.getElementById('lineDimensionInput');
const snapIndicator = document.getElementById('snapIndicator');

// По умолчанию сетка включена
window.showGrid = true;

// Объекты на холсте
let objects = [];              // Все объекты
window.objects = objects;      // Делаем глобальной для доступа из других файлов
let selectedObjects = [];      // Выбранные объекты
window.selectedObjects = selectedObjects;  // Делаем глобальной
let currentTool = 'select';    // Текущий инструмент
let isDrawing = false;         // Рисуем ли сейчас
let startPoint = null;         // Начальная точка рисования
let currentShape = null;       // Текущая фигура при рисовании

// Перетаскивание
let isDragging = false;        // Перетаскивание активно
let clickedOnSheet = false;    // Клик был по листу (а не по холсту)
let dragOffset = { x: 0, y: 0 };
let hasDragged = false;
let dragStartPos = { x: 0, y: 0 };
let potentialDragObject = null;
let isCtrlPressed = false;

// Привязки
let snapEnabled = true;
const SNAP_DISTANCE = 6; // v4.67: базовый радиус привязки (мм), но при зуме
                         // эффективный радиус уменьшается (см. getEffectiveSnapDistance)
const SNAP_DISTANCE_MAX_PX = 15; // v4.68: макс. радиус привязки в экранных пикселях
let snapPoint = null;

// Ортогональность (рисование под углами 0°, 45°, 90°, 135°...)
let orthoEnabled = false;
const ORTHO_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]; // Углы в градусах

// v4.60: Режим прямоугольника — 'corner' (от угла) или 'center' (из центра)
let rectDrawMode = 'corner';
window.rectDrawMode = rectDrawMode;

// Для хранения начальных позиций объектов при перетаскивании
let initialObjectPositions = [];

// Для управления деталями на листе (раскладка)
let selectedNestedParts = [];  // Выбранные детали на листе (массив для множественного выделения)
window.selectedNestedParts = selectedNestedParts;  // Делаем глобальной
let isDraggingNested = false;   // Перетаскивание детали на листе
let nestedDragOffsets = [];     // Смещения для каждой перетаскиваемой детали
let isShiftPressed = false;     // Зажат ли Shift для множественного выделения

// Делаем переменные доступными для других модулей
window.isShiftPressed = isShiftPressed;
window.isCtrlPressed = isCtrlPressed;

// Масштаб и панорамирование
let zoom = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let panStart = { x: 0, y: 0 };

// v4.68: Эффективный радиус привязки с учётом зума.
// При большом зуме SNAP_DISTANCE (6мм) = огромное расстояние в пикселях.
// Ограничиваем до SNAP_DISTANCE_MAX_PX пикселей на экране.
// При zoom=1: 6мм ( SNAP_DISTANCE), при zoom=10: 1.5мм (15px/10)
window.getEffectiveSnapDistance = function() {
    const z = (typeof zoom !== 'undefined') ? zoom : 1;
    const pxDist = SNAP_DISTANCE_MAX_PX / z; // мм, соответствующие 15px при текущем зуме
    return Math.min(SNAP_DISTANCE, pxDist);
};

// Масштаб листа раскладки (независимый зум)
let sheetZoom = 1;
let sheetPanX = 0;  // Смещение содержимого листа по X (при зуме > 1)
let sheetPanY = 0;  // Смещение содержимого листа по Y
let isSheetPanning = false;  // Флаг: перетаскиваем содержимое листа
let sheetPanStart = { x: 0, y: 0 };

// ═══════════════════════════════════════════════════════════════
// ВЫДЕЛЕНИЕ РАМКОЙ НА ЛИСТЕ (Rubber Band Selection)
// ═══════════════════════════════════════════════════════════════
let isSheetSelecting = false;
let sheetSelectStart = { x: 0, y: 0 };
let sheetSelectEnd = { x: 0, y: 0 };

// ═══════════════════════════════════════════════════════════════
// ФОТО-ОСТАТОК ЛИСТА (Sheet Remnant)
// ═══════════════════════════════════════════════════════════════
let sheetBackgroundImage = null;       // Загруженное изображение (Image)
let sheetImageScale = 1;               // Масштаб фото (пиксели → мм)
let sheetImageOffset = { x: 0, y: 0 }; // Смещение фото на холсте (мм)
let sheetImageSize = { width: 0, height: 0 }; // Размер фото в мм

// Калибровка фото
let isCalibrating = false;             // Режим калибровки
let calibratePoint1 = null;            // Точка 1 (x, y в мировых координатах)
let calibratePoint2 = null;            // Точка 2 (x, y в мировых координатах)

// Остаток листа (созданный из контура)
let sheetRemnant = null;               // { contourObjects: [], image: Image, scale: number, size: {width, height} }
let useRemnant = false;                // Флаг: использовать ли остаток для раскладки

// Делаем переменные доступными для других модулей
window.sheetBackgroundImage = sheetBackgroundImage;
window.sheetImageScale = sheetImageScale;
window.sheetRemnant = sheetRemnant;
window.useRemnant = useRemnant;
window.isCalibrating = isCalibrating;
window.nestingAxis = window.nestingAxis || 'length'; // 'length' | 'width'

// Синхронизация window переменных при изменении
function syncSheetRemnantVars() {
    window.sheetBackgroundImage = sheetBackgroundImage;
    window.sheetImageScale = sheetImageScale;
    window.sheetRemnant = sheetRemnant;
    window.useRemnant = useRemnant;
    window.isCalibrating = isCalibrating;
}

// Отмена/повтор действий
let undoStack = [];
let redoStack = [];
const MAX_UNDO = 50;

// Многоугольник по умолчанию
let polygonSides = 6;
let polygonRadius = 50;

// Для параллельности/перпендикулярности
let alignMode = null;
let referenceLine = null;

// Для перетаскивания конечных точек
let draggedPoint = null;
let hoveredPoint = null;  // Точка, на которую наведены (для подсветки в режиме Select)
let angleHoveredPoint = null;  // Точка, на которую наведены (для подсветки в режиме Угол)
const POINT_SNAP_DISTANCE = 1;

// Для автоматических размеров
let dimensionLines = [];
let selectedDimension = null;

// Для угловых размеров
let angleDimensions = [];  // Угловые размеры: { x, y, radius, startAngle, endAngle, value }
let selectedAngleDimension = null;

// Для выбора граней
let selectedEdge = null;

// Для ручного размера
let isDimensionMode = false;
let dimensionStartPoint = null;

// Для перетаскивания размерных линий
let isDraggingDimension = false;
let draggedDimensionIndex = -1;
let dimensionDragOffset = { x: 0, y: 0 };

// Для параллельности/перпендикулярности (новый режим)
let parallelMode = null;
let parallelStep = 0;
let referenceLineForParallel = null;

// Для раскладки (Nesting)
let parts = [];           // Массив деталей: { id, objects: [], quantity: number, bounds: {} }
window.parts = parts;     // Делаем глобальной для доступа из других файлов
let currentPartId = 0;
window.currentPartId = currentPartId;  // Делаем глобальной

// ═══════════════════════════════════════════════════════
// РЕДАКТИРОВАНИЕ ДЕТАЛИ (Part Editing Mode)
// ═══════════════════════════════════════════════════════
let isEditingPart = false;        // Флаг: редактируется ли деталь сейчас
let editingPartId = null;         // ID детали, которая сейчас редактируется

// Стандартные размеры листов (для отчёта)
const STANDARD_SHEETS = [
    { width: 1000, height: 2000, name: '1000 × 2000 мм' },
    { width: 1250, height: 2500, name: '1250 × 2500 мм' },
    { width: 1500, height: 1500, name: '1500 × 1500 мм' },
    { width: 1500, height: 3000, name: '1500 × 3000 мм' }
];

// Максимально допустимый размер листа
const MAX_SHEET_WIDTH = 1500;
const MAX_SHEET_HEIGHT = 3000;

let sheetSize = { width: 1250, height: 2500 };  // Размер листа по умолчанию
let showSheetView = false;    // По умолчанию лист скрыт
let nestedParts = [];     // Размещённые детали на листе

// Разрешение наложения деталей при раскладке
let allowOverlap = false;  // По умолчанию выключено
window.allowOverlap = allowOverlap;  // Делаем доступной для nesting.js

// Для хранения результата подбора оптимального листа
let optimalSheetRecommendation = null;

// Для раскладки на несколько листов
let allSheets = [];       // Все листы с раскладкой
let currentSheetIndex = 0;  // Текущий отображаемый лист

// Для буфера обмена (копировать/вставить)
let clipboard = [];       // Скопированные объекты
let clipboardNested = null; // Скопированная деталь с листа (может быть массивом)
let pasteOffset = { x: 20, y: 20 }; // Смещение при вставке

// Для микростыка (перемычки в контуре)
let microjointEnabled = false;      // Режим микростыка активен
let microjointGap = 1.0;            // Размер промежутка (мм)
let microjointLineStart = null;     // Начало линии (x, y)
let microjointLineEnd = null;       // Конец линии (x, y)
let microjointIsDrawing = false;    // Процесс рисования линии

// Для выделения рамкой
let isSelecting = false;
let selectStart = { x: 0, y: 0 };
let selectEnd = { x: 0, y: 0 };

// Для разметки остатка прямоугольниками
let markupRects = [];           // Нарисованные прямоугольники разметки (текущий лист)
let isDrawingRect = false;      // Режим рисования разметки
let currentMarkupMode = 'rect'; // Текущий тип разметки: 'rect' | 'circle' | 'polygon'
let currentRect = null;         // Текущий рисуемый прямоугольник
let currentCircle = null;       // Текущий рисуемый круг
let markupPolygonPoints = [];   // Точки ломаной линии (полигона)
let isDrawingMarkupPolygon = false; // Режим рисования полигона
let selectedRectIndex = -1;     // Индекс выделенного элемента разметки

// Для линии обрезки остатка
let cutRemnantLine = null;          // Линия обрезки { y: number }
let showCutRemnantLine = false;     // Показать/скрыть линию
let isDraggingCutLine = false;      // Перетаскивание линии

// Для диагонального паттерна (Fusion 360 style)
let diagonalLayoutEnabled = false;               // Режим диагональной раскладки
let diagonalPatternSource = null;               // Исходная деталь для паттерна
let diagonalPatternLine = null;                 // Пунктирная линия направления
let diagonalPatternStartPoint = null;           // Начальная точка (центр исходной детали)
let diagonalPatternEndPoint = null;             // Конечная точка (куда тянут)
let diagonalPatternDragging = false;            // Перетаскивание в режиме паттерна

// Для угловых привязок линии (Fusion 360 style)
let lineSnapConstraint = null;                  // { type: 'perpendicular'|'parallel', obj, angle, label }

// Для змеевидной раскладки (Snake Chain)
let snakeChains = [];                           // Массив цепей: [{ parts: [], cutPath: [] }]
let snakeKerf = 0.5;                            // Толщина реза (kerf) в мм
window.snakeChains = snakeChains;
window.snakeKerf = snakeKerf;

// Делаем переменные доступными для render.js
window.markupRects = markupRects;
window.selectedRectIndex = selectedRectIndex;
window.currentRect = currentRect;
window.currentCircle = currentCircle;
window.markupPolygonPoints = markupPolygonPoints;
window.isDrawingMarkupPolygon = isDrawingMarkupPolygon;
window.currentMarkupMode = currentMarkupMode;
window.cutRemnantLine = cutRemnantLine;
window.showCutRemnantLine = showCutRemnantLine;
window.isDraggingCutLine = isDraggingCutLine;

// Диагональный паттерн
window.diagonalLayoutEnabled = diagonalLayoutEnabled;
window.diagonalPatternSource = diagonalPatternSource;
window.diagonalPatternStartPoint = diagonalPatternStartPoint;
window.diagonalPatternEndPoint = diagonalPatternEndPoint;
window.diagonalPatternDragging = diagonalPatternDragging;
window.lineSnapConstraint = lineSnapConstraint;

// ═══════════════════════════════════════════════════════════════
// НАСТРОЙКИ (localStorage)
// ═══════════════════════════════════════════════════════════════

const SETTINGS_KEY = 'cad_settings_v1';

function saveSettings() {
    const settings = {
        sheetSize: document.getElementById('sheetSize').value,
        sheetWidth: document.getElementById('sheetWidth').value,
        sheetHeight: document.getElementById('sheetHeight').value
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return;

    try {
        const settings = JSON.parse(saved);

        // ═══════════════════════════════════════════════════════════
        // ЗАГРУЗКА РАЗМЕРА ЛИСТА
        // ═══════════════════════════════════════════════════════════
        // ПО УМОЛЧАНИЮ ВСЕГДА 1250×2500 (игнорируем старые настройки)
        const DEFAULT_SHEET_SIZE = '1250x2500';

        // Устанавливаем размер листа по умолчанию (1250×2500)
        document.getElementById('sheetSize').value = DEFAULT_SHEET_SIZE;

        // ═══════════════════════════════════════════════════════════
        // ОБНОВЛЯЕМ sheetSize В СООТВЕТСТВИИ С ВЫБРАННЫМ РАЗМЕРОМ
        // ═══════════════════════════════════════════════════════════
        // Всегда устанавливаем 1250×2500 по умолчанию
        sheetSize = { width: 1250, height: 2500 };
        
        // Скрываем поля для своего размера
        const customSizes = document.getElementById('customSheetSize');
        customSizes.style.display = 'none';
    } catch (e) {
        console.error('Ошибка загрузки настроек:', e);
    }
}

// ═══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════

// Проверка точки внутри полигона (обёртка для функции из nesting.js)
function pointInPolygon(x, y, polygon) {
    if (typeof window.pointInPolygon === 'function') {
        return window.pointInPolygon({ x, y }, polygon);
    }
    // Fallback реализация если nesting.js ещё не загружен
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        if (((polygon[i].y > y) !== (polygon[j].y > y)) &&
            (x < (polygon[j].x - polygon[i].x) * (y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
            inside = !inside;
        }
    }
    return inside;
}

// Расчёт границ объектов (для bounding box детали)
function calculateBounds(objects) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    objects.forEach(obj => {
        // Если есть метод getPoints - используем его
        if (typeof obj.getPoints === 'function') {
            const points = obj.getPoints();
            points.forEach(pt => {
                minX = Math.min(minX, pt.x);
                minY = Math.min(minY, pt.y);
                maxX = Math.max(maxX, pt.x);
                maxY = Math.max(maxY, pt.y);
            });
        } else {
            // Для простых объектов из DXF
            if (obj.type === 'line') {
                minX = Math.min(minX, obj.x1, obj.x2);
                maxX = Math.max(maxX, obj.x1, obj.x2);
                minY = Math.min(minY, obj.y1, obj.y2);
                maxY = Math.max(maxY, obj.y1, obj.y2);
            } else if (obj.type === 'circle') {
                minX = Math.min(minX, obj.cx - obj.radius);
                maxX = Math.max(maxX, obj.cx + obj.radius);
                minY = Math.min(minY, obj.cy - obj.radius);
                maxY = Math.max(maxY, obj.cy + obj.radius);
            } else if (obj.type === 'rect') {
                minX = Math.min(minX, obj.x);
                maxX = Math.max(maxX, obj.x + obj.width);
                minY = Math.min(minY, obj.y);
                maxY = Math.max(maxY, obj.y + obj.height);
            } else if (obj.type === 'polygon' || obj.type === 'polyline' || obj.type === 'lwpolyline') {
                const points = obj.points || obj.vertices || [];
                points.forEach(pt => {
                    minX = Math.min(minX, pt.x);
                    minY = Math.min(minY, pt.y);
                    maxX = Math.max(maxX, pt.x);
                    maxY = Math.max(maxY, pt.y);
                });
            } else if (obj.type === 'arc') {
                const acx = obj.cx || 0, acy = obj.cy || 0, r = Math.abs(obj.radius || 0);
                if (r > 0) {
                    const sa = obj.startAngle ?? 0, ea = obj.endAngle ?? (2 * Math.PI);
                    const dir = obj.direction !== undefined ? obj.direction : 1;
                    let sweep;
                    if (dir >= 0) { sweep = ea - sa; if (sweep <= 0) sweep += 2 * Math.PI; }
                    else { sweep = sa - ea; if (sweep <= 0) sweep += 2 * Math.PI; }
                    // Точки начала/конца
                    const sx = acx + Math.cos(sa) * r, sy = acy + Math.sin(sa) * r;
                    const ex = acx + Math.cos(ea) * r, ey = acy + Math.sin(ea) * r;
                    minX = Math.min(minX, sx, ex); maxX = Math.max(maxX, sx, ex);
                    minY = Math.min(minY, sy, ey); maxY = Math.max(maxY, sy, ey);
                    // Крайние точки на осях, попадающие в дугу
                    const angles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
                    for (const a of angles) {
                        let aNorm = ((a % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
                        let sNorm = ((sa % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
                        let eNorm = ((ea % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
                        let inArc;
                        if (dir >= 0) {
                            if (eNorm >= sNorm) inArc = aNorm >= sNorm && aNorm <= eNorm;
                            else inArc = aNorm >= sNorm || aNorm <= eNorm;
                        } else {
                            if (sNorm >= eNorm) inArc = aNorm <= sNorm && aNorm >= eNorm;
                            else inArc = aNorm <= sNorm || aNorm >= eNorm;
                        }
                        if (inArc) {
                            minX = Math.min(minX, acx + Math.cos(a) * r);
                            maxX = Math.max(maxX, acx + Math.cos(a) * r);
                            minY = Math.min(minY, acy + Math.sin(a) * r);
                            maxY = Math.max(maxY, acy + Math.sin(a) * r);
                        }
                    }
                }
            }
        }
    });
    // Нормализация: размеры не могут быть отрицательными
    const width = Math.abs(maxX - minX);
    const height = Math.abs(maxY - minY);
    return { minX, minY, maxX, maxY, width, height };
}

// ═══════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════════

function resizeCanvas() {
    canvas.width = canvasContainer.clientWidth;
    canvas.height = canvasContainer.clientHeight;
    if (typeof render === 'function') {
        render();
    }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Загружаем настройки при старте
loadSettings();

// ═══════════════════════════════════════════════════════════════
// СИНХРОНИЗАЦИЯ С STORE (для совместимости)
// ═══════════════════════════════════════════════════════════════

// Функция синхронизации глобальных переменных с Store
function syncGlobalsToStore() {
    if (typeof Store !== 'undefined') {
        // Синхронизируем window.XXX с локальными переменными
        allSheets = window.allSheets || allSheets;
        currentSheetIndex = window.currentSheetIndex || currentSheetIndex;
        markupRects = window.markupRects || markupRects;
        
        Store.set('parts', parts, { silent: true });
        Store.set('nestedParts', nestedParts, { silent: true });
        Store.set('sheetSize', sheetSize, { silent: true });
        Store.set('showSheetView', showSheetView, { silent: true });
        Store.set('allSheets', allSheets, { silent: true });
        Store.set('currentSheetIndex', currentSheetIndex, { silent: true });
        Store.set('markupRects', markupRects, { silent: true });
        Store.set('allowOverlap', allowOverlap, { silent: true });
    }
}

// При изменении Store, обновляем глобальные переменные
if (typeof Store !== 'undefined') {
    // Подписка на изменения
    Store.subscribe('parts', (newVal) => {
        if (newVal) parts = newVal;
    });
    
    Store.subscribe('nestedParts', (newVal) => {
        if (newVal) nestedParts = newVal;
    });

    Store.subscribe('selectedNestedParts', (newVal) => {
        // НЕ синхронизируем! selectedNestedParts управляется только через UI
        // if (newVal) selectedNestedParts = newVal;
    });

    Store.subscribe('showSheetView', (newVal) => {
        if (newVal !== undefined) showSheetView = newVal;
    });

    Store.subscribe('markupRects', (newVal) => {
        if (newVal) markupRects = newVal;
        window.markupRects = newVal;
    });

    Store.subscribe('sheetSize', (newVal) => {
        if (newVal) sheetSize = newVal;
    });

    Store.subscribe('allowOverlap', (newVal) => {
        if (newVal !== undefined) {
            allowOverlap = newVal;
            window.allowOverlap = newVal;
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// АВТОСОХРАНЕНИЕ НАСТРОЕК (толщина металла и цена)
// ═══════════════════════════════════════════════════════════════

function initSettingsAutoSave() {}

// Инициализируем после загрузки страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsAutoSave);
} else {
    initSettingsAutoSave();
}

// ═══════════════════════════════════════════════════════════════
// ОБРАБОТЧИКИ КЛАВИАТУРЫ (для isShiftPressed, isCtrlPressed)
// ВЫНЕСЕНЫ ИЗ DOMContentLoaded — они должны работать сразу
// ═══════════════════════════════════════════════════════════════
window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') {
        isShiftPressed = true;
        window.isShiftPressed = true;
    }
    if (e.key === 'Control') {
        isCtrlPressed = true;
        window.isCtrlPressed = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
        isShiftPressed = false;
        window.isShiftPressed = false;
    }
    if (e.key === 'Control') {
        isCtrlPressed = false;
        window.isCtrlPressed = false;
    }
});

// Сброс при потере фокуса окном (чтобы не "залипал" Shift/Ctrl)
window.addEventListener('blur', () => {
    isShiftPressed = false;
    window.isShiftPressed = false;
    isCtrlPressed = false;
    window.isCtrlPressed = false;
});

// ═══════════════════════════════════════════════════════════════
// ИНСТРУМЕНТ ЛАСТИК (Усечь кривую)
// ═══════════════════════════════════════════════════════════════
// v4.98: Допуск ластика зависит от зума — при сильном увеличении
// точность повышается. В пикселях на экране допуск ~6px.
const ERASER_TOLERANCE = 3; // мм — сохранено для обратной совместимости
window.getEffectiveEraserTolerance = function() {
    const z = (typeof zoom !== 'undefined' && zoom > 0) ? zoom : 1;
    const pxDist = 6 / z; // 6 пикселей на экране → модельные мм
    return Math.min(ERASER_TOLERANCE, pxDist);
};

function isObjectHitByEraser(obj, eraserLine, tolerance) {
    const e = eraserLine;
    if (obj.type === 'line') {
        if (typeof findLineIntersection === 'function' && findLineIntersection(e, obj)) return true;
        if (pointToLineDistance(obj.x1, obj.y1, e.x1, e.y1, e.x2, e.y2) < tolerance) return true;
        if (pointToLineDistance(obj.x2, obj.y2, e.x1, e.y1, e.x2, e.y2) < tolerance) return true;
        return false;
    }
    if (obj.type === 'circle') {
        if (typeof findLineCircleIntersection === 'function') {
            const pts = findLineCircleIntersection(e, obj);
            if (pts && pts.length > 0) return true;
        }
        const d = pointToLineDistance(obj.cx, obj.cy, e.x1, e.y1, e.x2, e.y2);
        if (d < obj.radius + tolerance) {
            const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
            const lenSq = dx * dx + dy * dy;
            if (lenSq === 0) {
                return Math.sqrt(Math.pow(obj.cx - e.x1, 2) + Math.pow(obj.cy - e.y1, 2)) < obj.radius + tolerance;
            }
            const t = ((obj.cx - e.x1) * dx + (obj.cy - e.y1) * dy) / lenSq;
            if (t >= -tolerance / Math.sqrt(lenSq) && t <= 1 + tolerance / Math.sqrt(lenSq)) return true;
            if (Math.sqrt(Math.pow(obj.cx - e.x1, 2) + Math.pow(obj.cy - e.y1, 2)) < obj.radius + tolerance) return true;
            if (Math.sqrt(Math.pow(obj.cx - e.x2, 2) + Math.pow(obj.cy - e.y2, 2)) < obj.radius + tolerance) return true;
        }
        return false;
    }
    if (obj.type === 'rect' || obj.type === 'polygon') {
        const edges = (typeof getObjectEdges === 'function') ? getObjectEdges(obj) : [];
        for (const edge of edges) {
            const edgeLine = new Line(edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
            if (typeof findLineIntersection === 'function' && findLineIntersection(e, edgeLine)) return true;
            if (pointToLineDistance(edge.p1.x, edge.p1.y, e.x1, e.y1, e.x2, e.y2) < tolerance) return true;
            if (pointToLineDistance(edge.p2.x, edge.p2.y, e.x1, e.y1, e.x2, e.y2) < tolerance) return true;
        }
        return false;
    }
    if (obj.type === 'text') {
        const c = obj.center || { x: obj.x, y: obj.y };
        return pointToLineDistance(c.x, c.y, e.x1, e.y1, e.x2, e.y2) < tolerance;
    }
    if (obj.type === 'customPolygon') {
        for (let i = 0; i < obj.points.length; i++) {
            const next = (i + 1) % obj.points.length;
            const edgeLine = new Line(obj.points[i].x, obj.points[i].y, obj.points[next].x, obj.points[next].y);
            if (typeof findLineIntersection === 'function' && findLineIntersection(e, edgeLine)) return true;
            if (pointToLineDistance(obj.points[i].x, obj.points[i].y, e.x1, e.y1, e.x2, e.y2) < tolerance) return true;
        }
        return false;
    }
    if (obj.type === 'arc') {
        const pts = (typeof obj.getPoints === 'function') ? obj.getPoints(12) : [];
        if (pts.length < 2) return false;
        for (let i = 0; i < pts.length - 1; i++) {
            const edgeLine = new Line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
            if (typeof findLineIntersection === 'function' && findLineIntersection(e, edgeLine)) return true;
            if (pointToLineDistance(pts[i].x, pts[i].y, e.x1, e.y1, e.x2, e.y2) < tolerance) return true;
        }
        return false;
    }
    if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        const pts = obj.points || obj.vertices || [];
        if (pts.length < 2) return false;
        for (let i = 0; i < pts.length - 1; i++) {
            const edgeLine = new Line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
            if (typeof findLineIntersection === 'function' && findLineIntersection(e, edgeLine)) return true;
            if (pointToLineDistance(pts[i].x, pts[i].y, e.x1, e.y1, e.x2, e.y2) < tolerance) return true;
        }
        if (obj.closed && pts.length > 2) {
            const edgeLine = new Line(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y);
            if (typeof findLineIntersection === 'function' && findLineIntersection(e, edgeLine)) return true;
        }
        return false;
    }
    return false;
}