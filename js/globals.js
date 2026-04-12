// ═══════════════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ═══════════════════════════════════════════════════════════════

// Элементы canvas
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvasContainer');
const dimensionLabel = document.getElementById('dimensionLabel');
const snapIndicator = document.getElementById('snapIndicator');

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
const SNAP_DISTANCE = 15;
let snapPoint = null;

// Ортогональность (рисование под углами 0°, 45°, 90°, 135°...)
let orthoEnabled = false;
const ORTHO_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]; // Углы в градусах

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

// Масштаб и панорамирование
let zoom = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let panStart = { x: 0, y: 0 };

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

// Делаем переменные доступными для других модулей
window.sheetBackgroundImage = sheetBackgroundImage;
window.sheetImageScale = sheetImageScale;
window.sheetRemnant = sheetRemnant;
window.isCalibrating = isCalibrating;

// Синхронизация window переменных при изменении
function syncSheetRemnantVars() {
    window.sheetBackgroundImage = sheetBackgroundImage;
    window.sheetImageScale = sheetImageScale;
    window.sheetRemnant = sheetRemnant;
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
let hoveredPoint = null;  // Точка, на которую наведены (для подсветки)
const POINT_SNAP_DISTANCE = 15;

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
let allowOverlap = false;  // По умолчанию выключено (сбрасывается при новой раскладке)
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

// Для выделения рамкой
let isSelecting = false;
let selectStart = { x: 0, y: 0 };
let selectEnd = { x: 0, y: 0 };

// Для разметки остатка прямоугольниками
let markupRects = [];           // Нарисованные прямоугольники разметки (текущий лист)
let isDrawingRect = false;      // Режим рисования прямоугольника
let currentRect = null;         // Текущий рисуемый прямоугольник
let selectedRectIndex = -1;     // Индекс выделенного прямоугольника

// Делаем переменные доступными для render.js
window.markupRects = markupRects;
window.selectedRectIndex = selectedRectIndex;
window.currentRect = currentRect;

// ═══════════════════════════════════════════════════════════════
// НАСТРОЙКИ (localStorage)
// ═══════════════════════════════════════════════════════════════

const SETTINGS_KEY = 'cad_settings_v1';

function saveSettings() {
    const settings = {
        metalThickness: document.getElementById('metalThickness').value,
        pricePerKg: document.getElementById('pricePerKg').value,
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
        if (settings.metalThickness) {
            document.getElementById('metalThickness').value = settings.metalThickness;
        }
        if (settings.pricePerKg) {
            // Обновляем старое значение 150 на 210
            if (settings.pricePerKg === '150' || settings.pricePerKg === 150) {
                document.getElementById('pricePerKg').value = '210';
            } else {
                document.getElementById('pricePerKg').value = settings.pricePerKg;
            }
        } else {
            document.getElementById('pricePerKg').value = '210';
        }
        
        // ═══════════════════════════════════════════════════════════
        // ЗАГРУЗКА РАЗМЕРА ЛИСТА
        // ═══════════════════════════════════════════════════════════
        // ПО УМОЛЧАНИЮ ВСЕГДА 1250×2500 (игнорируем старые настройки)
        const DEFAULT_SHEET_SIZE = '1250x2500';
        let loadedSheetSize = DEFAULT_SHEET_SIZE;

        // Проверяем сохранённые настройки (но не используем для размера листа)
        if (settings.sheetSize && settings.sheetSize !== DEFAULT_SHEET_SIZE) {
            console.log(`⚠️ В настройках сохранён размер "${settings.sheetSize}", но используем "${DEFAULT_SHEET_SIZE}"`);
        }

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
        
        console.log(`📐 Размер листа установлен: ${sheetSize.width}×${sheetSize.height} мм (по умолчанию)`);
    } catch (e) {
        console.error('Ошибка загрузки настроек:', e);
    }
}

// ═══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════

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
            }
        }
    });
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// ═══════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════════

function resizeCanvas() {
    canvas.width = canvasContainer.clientWidth;
    canvas.height = canvasContainer.clientHeight;
    render();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Загружаем настройки при старте
loadSettings();

// ═══════════════════════════════════════════════════════════════
// СИНХРОНИЗАЦИЯ С STORE (для совместимости)
// ═══════════════════════════════════════════════════════════════

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

    console.log('✅ Синхронизация Store настроена');
}

// ═══════════════════════════════════════════════════════════════
// АВТОСОХРАНЕНИЕ НАСТРОЕК (толщина металла и цена)
// ═══════════════════════════════════════════════════════════════

function initSettingsAutoSave() {
    // Толщина металла
    const metalThicknessSelect = document.getElementById('metalThickness');
    if (metalThicknessSelect) {
        metalThicknessSelect.addEventListener('change', () => {
            saveSettings();
            console.log(`💾 Толщина металла сохранена: ${metalThicknessSelect.value} мм`);
        });
    }

    // Цена за кг
    const pricePerKgInput = document.getElementById('pricePerKg');
    if (pricePerKgInput) {
        pricePerKgInput.addEventListener('change', () => {
            saveSettings();
            console.log(`💾 Цена за кг сохранена: ${pricePerKgInput.value} ₽`);
        });
        
        // Также сохраняем при потере фокуса
        pricePerKgInput.addEventListener('blur', () => {
            saveSettings();
            console.log(`💾 Цена за кг сохранена (blur): ${pricePerKgInput.value} ₽`);
        });
    }

    console.log('✅ Автосохранение настроек инициализировано');
}

// Инициализируем после загрузки страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsAutoSave);
} else {
    initSettingsAutoSave();
}

console.log('✅ Глобальные переменные загружены');
