/**
 * Cutsy CAD — Production Build Script v2.3
 * Обфускация, минификация, удаление логов и комментариев
 *
 * Изменения v2.1:
 * - Исправлен removeComments(): обработка regex-литералов и незакрытых /*
 * - Исправлен stripVersionParams(): CDN-ссылки больше не ломаются
 * - Обрезан reservedName: убраны методы Array/String/Object (обфускатор не трогает прототипы)
 * - Отключены debugProtection и deadCodeInjection (ломали прод и замедляли)
 * - Снижен controlFlowFlatteningThreshold (0.3 → 0.15) для скорости
 * - Убраны дубликаты privacy.html/terms.html из COPY_AS_IS
 * - Добавлена проверка index.html перед integrity check
 * - Исправлена нумерация шагов сборки
 *
 * Изменения v2.2:
 * - JS_FILES полностью синхронизирован с актуальным index.html (порядок + наличие)
 * - Удалены отсутствующие в index.html файлы: domain-guard.js, part-perimeter.js, account-ui.js
 * - Добавлены js/lzstring.min.js и js/gcode-editor.js (для gcode-editor.html)
 * - js/cache-storage.js перемещён после sheet-remnant.js (как в index.html)
 * - js/pricing.js перемещён после nesting-ui.js (как в index.html)
 * - js/merge-touching-parts.js добавлен между cps2-contour-merger и cps2-export
 * - Порядок инструментов исправлен: tool-handlers → microjoint-tool → flip-selection
 *
 * Изменения v2.3 (v4.60):
 * - Добавлен js/dxf-dragdrop.js (Drag & Drop импорт DXF)
 * - Добавлен js/part-fill.js (полупрозрачная заливка деталей)
 * - Добавлен js/part-perimeter.js (расчёт периметра — все типы объектов)
 * - js/part-fill.js добавлен в NO_OBFUSCATE_FILES (global exports)
 * - anti-debug.js: отключена перезапись console в DEBUG режиме
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');

// ═══════════════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════════════════════

const SRC_DIR = __dirname;
const DIST_DIR = path.join(SRC_DIR, 'dist');

// Файлы и папки, которые копируются как есть (ресурсы)
const COPY_AS_IS = [
    'favicon.png',
    'logo.png',
    'Presentation.html',
    'gcode-editor.html',
    // privacy.html и terms.html обрабатываются в HTML_FILES — не дублируем
    'robots.txt',        // ✅ SEO: robots.txt
    'sitemap.xml',       // ✅ SEO: sitemap.xml
    'manifest.json',     // ✅ PWA: manifest.json
    'og-image-placeholder.png', // ✅ SEO: Open Graph изображение (PNG)
    'yandex_b7842c43293d7cfb.html', // ✅ Yandex.Webmaster верификация
    // ⚠️ НЕ добавлять screenshots/ — тестовые файлы, не нужны в прод
    'razvertki/',              // ✅ Развёртки противней — открываются по кнопке
    // nesting-modules обрабатывается отдельно с удалением комментариев
];

// JS-файлы, которые нужно обфусцировать (в порядке загрузки из index.html)
// ⚠️ ВАЖНО: порядок должен СТРОГО совпадать с порядком <script> в index.html
// v4.57: Синхронизировано с актуальным index.html (порядок + наличие файлов)
const JS_FILES = [
    // Head scripts
    'splash.js',

    // Body scripts — в порядке загрузки из index.html
    'js/flip-selection-btn.js',
    'flip-nested.js',
    'js/svg-export.js',
    'js/detail-export.js',
    'js/shapes.js',
    'js/ui-functions.js',
    'js/snapping.js',
    'dimensions.js',

    // Core modules
    'js/globals.js',
    'js/config.js',
    'js/render.js',
    'js/license.js',
    'js/emailjs-init.js',
    'js/license-gate.js',
    'js/anti-debug.js',

    // Sheet & cache
    'js/sheet-remnant.js',
    'js/cache-storage.js',

    // (nesting-modules/01-17 загружаются в index.html, но обрабатываются
    //  отдельно в шаге 2 — removeComments без обфускации)

    // Translations
    'translations.js',

    // DXF import
    'js/dxf-import.js',
    'js/frw-import.js',
    'js/dxf-import-ui.js',

    // v4.60: Drag & Drop импорт DXF
    'js/dxf-dragdrop.js',

    // v4.60: Полупрозрачная заливка деталей
    'js/part-fill.js',

    // State & validation
    'js/store.js',
    'js/validators.js',
    'js/sound.js',
    'js/join-parts.js',

    // v1.0: Перемещение объектов стрелками клавиатуры (1мм, удержание 10мм)
    'js/keyboard-move.js',

    // v1.0: Инструмент Offset (Эквидистанта / Подобие объекта)
    'js/offset-tool.js',

    // v1.0: Инструмент Отражение (Симметрия по произвольной линии)
    'js/mirror-tool.js',

    // v1.0: Инструмент Вращение объектов
    'js/rotate-tool.js',

    // v1.0: Инструмент Фаска (chamfer)
    'js/chamfer-tool.js',

    // v1.0: Инструменты Паттерн (прямоугольный и круговой)
    'js/pattern-tool.js',

    // v1.3: Автоматические габаритные размеры
    'js/auto-dimensions.js',

    // v1.0: Группировка/Разгруппировка объектов
    'js/group-tool.js',

    // v1.0: Импорт STEP + развёртка листового металла
    'js/step-unfold.js',

    // v1.0: Ластик (trim + erase)
    'js/eraser-tool.js',

    // Input handlers
    'js/keyboard-events.js',
    'js/mouse-events.js',
    'js/touch-events.js',
    'js/part-thumbnail.js',   // v1.0: Генератор миниатюр деталей (контекстное меню)
    'js/context-menus.js',

    // Reports & pricing
    'js/pdf-report.js',
    'pricing-mutual-exclusion.js',

    // Undo/redo & geometry
    'js/undo-redo.js',
    'js/geometry-utils.js',
    'js/markup-rect-ui.js',
    'js/part-creation.js',
    'js/part-perimeter.js',

    // Tools & panels
    'js/tool-handlers.js',
    'js/microjoint-tool.js',
    'flip-selection.js',

    // Nesting UI & algorithms
    'js/nesting/nested-part-operations.js',
    'js/nesting/find-alignment.js',
    'js/properties-panel.js',

    // DXF parser & PDF export
    'js/dxf-parser.js',
    'js/pdf-export.js',

    // CPS2 / G-code / merge
    'js/cps2-contour-merger.js',
    'js/merge-touching-parts.js',
    'js/cps2-export.js',
    'js/gcode-export.js',

    // Ruler tool for nesting sheet
    'js/ruler-tool.js',

    // Parts list & sheet management
    'js/parts-list-ui.js',
    'js/sheet-management.js',
    'js/markup-tools.js',
    'js/nesting/nesting-ui.js',

    // Pricing & export cleanup
    'js/pricing.js',
    'js/export-clear.js',

    // Final init
    'js/panel-resize.js',
    'js/app-init.js',

    // G-code editor (отдельная страница gcode-editor.html)
    // Не загружается в index.html, но нужна в dist/ для gcode-editor.html
    'js/lzstring.min.js',
    'js/gcode-editor.js'
];

// Файлы, которые НЕ нужно обфусцировать (критичные для производительности или стабильности)
const NO_OBFUSCATE_FILES = [
    'js/shapes.js',               // Классы фигур с прототипами — обфускация ломает наследование
    'js/sheet-remnant.js',        // Работа с остатками — критичные глобальные экспорты
    'js/globals.js',              // Глобальные переменные и состояния
    'js/microjoint-tool.js',      // Микростык — обфускация ломает глобальные колбэки
    'js/context-menus.js',        // Контекстные меню — обфускация ломает глобальные колбэки
    'js/parts-list-ui.js',        // Список деталей — обфускация ломает глобальные свойства
    'js/nesting/nesting-ui.js',   // UI нестинга — обфускация ломает глобальные свойства
    'js/lzstring.min.js',         // Внешняя библиотека сжатия — уже минифицирована
    'js/gcode-editor.js',         // G-code editor — отдельное приложение, обфускация ломает
    // ⚠️ mouse-events.js, keyboard-events.js, touch-events.js, render.js, part-creation.js
    //    перенесены в LIGHT_OBFUSCATE_FILES — лёгкая обфускация без runtime-накладных расходов
];

// Файлы с лёгкой обфускацией (минификация + переименование локальных переменных, без runtime-накладных расходов)
// Подходит для файлов с частыми событиями (мышь, клавиатура, тач) где важна скорость
const LIGHT_OBFUSCATE_FILES = [
    'js/mouse-events.js',      // mousemove 60+ вызовов/сек — нулевая толерантность к лагам
    'js/keyboard-events.js',   // Горячие клавиши — нужен мгновенный отклик
    'js/touch-events.js',      // Touch-события — критична скорость
    'js/render.js',            // requestAnimationFrame — каждый кадр считает
    'js/part-creation.js',     // Создание деталей — безопасно с LIGHT (строки и глобальные имена сохранены)
    'js/snapping.js',          // Привязки — обфускация ломает obj.length (getter в классе Line)
    'js/properties-panel.js',  // Панель свойств — обфускация ломает obj.length и obj.getAngle
    'js/offset-tool.js',       // Offset — лёгкая обфускация безопасна (глобальные имена в reservedName)
    'js/chamfer-tool.js',      // Фаска — IIFE, глобальные имена в reservedName
    'js/pattern-tool.js',      // Паттерн — IIFE, глобальные имена в reservedName
    'js/auto-dimensions.js',   // Авто-размеры — IIFE, глобальные имена в reservedName
    'js/group-tool.js',        // Группировка — IIFE, глобальные имена в reservedName
    'js/step-unfold.js',       // STEP-развёртка — IIFE, глобальные имена в reservedName
    'js/eraser-tool.js',       // Ластик — trim + erase
    'js/panel-resize.js',      // Resize панелей — только DOM + render, без критичных глобалов
    'js/ruler-tool.js',        // Линейка — глобальные имена добавлены в reservedName
    'js/part-fill.js',         // Заливка деталей — глобальные имена добавлены в reservedName
];

// HTML-файлы для минификации
const HTML_FILES = ['index.html', 'privacy.html', 'terms.html'];

// CSS-файлы для минификации
const CSS_FILES = ['styles.css'];

// JS-файлы, полностью исключаемые из сборки (не копируются, <script> удаляется из HTML)
const EXCLUDE_FILES = [];

// JS-файлы, которые копируются БЕЗ ВСЯКИХ изменений (ни обфускация, ни stripConsoleLogs)
// Критично для файлов, чья логика зависит от console-вызовов
const COPY_VERBATIM_FILES = [
    'js/anti-debug.js',          // console.debug('x') — ядро детекции открытой консоли, stripConsoleLogs убьёт логику
    'js/cps2-export.js',         // Бинарный CPS2 — stripConsoleLogs ломает строковые конкатенации
];

// Настройки обфускатора (агрессивные, но безопасные для продакшена)
const OBFUSCATOR_OPTIONS = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,  // ✅ Агрессивный flattening — усложняет чтение потока
    deadCodeInjection: true,               // ✅ Добавляет мусорный код — усложняет анализ
    debugProtection: false,                // ✅ ОТКЛЮЧЕНО — ломает DevTools у клиентов
    debugProtectionInterval: 0,
    disableConsoleOutput: true,            // ✅ Удаляет console.log/warn/info
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,               // ВАЖНО: сохраняем глобальные имена
    reservedName: [
        // Браузерные глобальные объекты (обфускатор сам их сохраняет, но для надёжности)
        'window', 'document', 'console', 'localStorage', 'navigator', 'screen',
        'location', 'Math', 'JSON', 'Date', 'Map', 'Set',
        // Глобальные переменные приложения (используются между файлами через window / глобальную область)
        'canvas', 'ctx', 'objects', 'parts', 'nestedParts',
        'selectedObjects', 'currentTool', 'isDrawing', 'startPoint',
        'currentShape', 'isDragging', 'dragOffset', 'snapEnabled',
        'orthoEnabled', 'zoom', 'panX', 'panY', 'sheetSize',
        'showSheetView', 'allSheets', 'currentSheetIndex',
        'markupRects', 'isDrawingRect', 'currentRect', 'selectedRectIndex',
        'cutRemnantLine', 'showCutRemnantLine', 'isDraggingCutLine',
        'diagonalLayoutEnabled', 'diagonalPatternSource',
        'diagonalPatternStartPoint', 'diagonalPatternEndPoint',
        'diagonalPatternDragging', 'isCalibrating', 'calibratePoint1',
        'calibratePoint2', 'sheetBackgroundImage', 'sheetImageScale',
        'sheetRemnant', 'useRemnant',
        'isShiftPressed', 'selectedNestedParts',
        'isDraggingNested', 'nestedDragOffsets', 'sheetZoom',
        'sheetPanX', 'sheetPanY', 'isSheetPanning', 'isSheetSelecting',
        'sheetSelectStart', 'sheetSelectEnd', 'allowOverlap',
        'isEditingPart', 'editingPartId', 'dimensionLines',
        'angleDimensions', 'clipboard', 'clipboardNested',
        // Глобальные функции (вызываются между файлами)
        'render', 'rotatePolygon', 'translatePolygon', 'getReferencePoint',
        'getBoundingBox', 'flipNestedPart', 'findAlignment', 'checkDirection',
        'samePartId', 'getPartConvexHull', 'computeNFP', 'minkowskiSum',
        'polygonArea', 'isPointInPolygon', 'isConvex', 'getConvexHull',
        'getPartPolygons', 'generateCandidatePositions',
        'tryPlacePartsOnSheet', 'performNesting', 'checkCollision',
        'checkPolygonCollision', 'buildSpatialGrid', 'saveState',
        'SPATIAL_CELL_SIZE', 'partHullCache', 'clearPartHullCache',
        // Классы (создаются через new в одних файлах, используются в других)
        'Line', 'Circle', 'Rect', 'Polygon', 'Text', 'Store', 'StoreHelpers',
        'LicenseManager', 'Arc', 'CustomPolygon',
        // Глобальные функции из part-fill.js и ruler-tool.js
        'mergeObjectsToContours', 'getSheetGeometry',
        // Критичные имена свойств деталей (читаются как detail.x, detail.partId и т.д.)
        'x', 'y', 'width', 'height', 'angle', 'partId', 'polygon', 'refPoint',
        'baseWidth', 'baseHeight', 'spacing', 'oneCutEnabled', 'noRotate',
        'nestingEnabled', 'thickness', 'quantity', 'visible', 'rotation',
        'rotationMode', 'positionedHull', 'sheetRemnant', 'useRemnant'
    ],
    rotateStringArray: true,
    selfDefending: true,              // ✅ ВКЛЮЧЕНО — защита от изменения кода в DevTools
    stringArray: true,
    stringArrayEncoding: ['rc4'],     // ✅ RC4 шифрование строк — сложнее взломать
    stringArrayThreshold: 0.8,        // ✅ Больше строк шифруется
    transformObjectKeys: false,         // ВАЖНО: не ломаем obj['key']
    unicodeEscapeSequence: false
};

// Лёгкий профиль обфускации — минификация + переименование локальных переменных
// БЕЗ controlFlowFlattening, БЕЗ stringArray, БЕЗ numbersToExpressions
// → нулевой runtime-оверхед, но код нечитаем и короче
const OBFUSCATOR_OPTIONS_LIGHT = {
    compact: true,
    controlFlowFlattening: false,          // ❌ Отключено — основной источник замедления
    deadCodeInjection: false,
    debugProtection: false,
    debugProtectionInterval: 0,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: false,           // ❌ Отключено — лишние вычисления
    renameGlobals: false,
    reservedName: OBFUSCATOR_OPTIONS.reservedName,  // Те же защищённые имена
    selfDefending: false,
    stringArray: false,                    // ❌ Отключено — каждый доступ к строке = вызов функции
    stringArrayThreshold: 0,
    transformObjectKeys: false,
    unicodeEscapeSequence: false
};

// Настройки минификации HTML
const HTML_MINIFY_OPTIONS = {
    collapseBooleanAttributes: false,
    collapseWhitespace: true,
    decodeEntities: true,
    html5: true,
    minifyCSS: false,
    minifyJS: false,
    removeAttributeQuotes: false,
    removeComments: true,
    removeEmptyAttributes: true,
    removeOptionalTags: false,
    removeRedundantAttributes: false,
    removeScriptTypeAttributes: false,
    removeStyleLinkTypeAttributes: false,
    sortAttributes: false,
    sortClassName: false,
    useShortDoctype: true
};

// ═══════════════════════════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════════════════════════

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function copyFile(src, dest) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            copyFile(srcPath, destPath);
        }
    }
}

/**
 * Удаляет ?v=X.XX из атрибутов src и href в HTML
 * Пример: src="js/globals.js?v=3.27" → src="js/globals.js"
 * Внешние CDN-ссылки (http://, https://) НЕ трогаются — им нужен ?v= для cache-busting
 */
function stripVersionParams(html) {
    return html.replace(/(src|href)="((?!https?:\/\/)[^"?]+)\?[^"]*"/g, '$1="$2"');
}

/**
 * Удаляет <script> теги для файлов из EXCLUDE_FILES из HTML
 */
function stripExcludedScripts(html) {
    let result = html;
    for (const file of EXCLUDE_FILES) {
        // Экранируем точки в пути для regex
        const escaped = file.replace(/\./g, '\\.');
        // Удаляем <script src="FILE"></script> (с optional ?v=...)
        const pattern = new RegExp(`<script[^>]*src="${escaped}(\\?[^"]*)?"[^>]*>\\s*</script>`, 'gi');
        const before = result;
        result = result.replace(pattern, '');
        if (before !== result) {
            console.log(`   🗑️  Удалён <script> для ${file} из HTML`);
        }
    }
    return result;
}

/**
 * Создаёт gzip-версию файла для прекомпрессии
 * nginx/caddy автоматически отдаст .gz версию если есть заголовок Accept-Encoding: gzip
 */
function gzipFile(filePath) {
    return new Promise((resolve, reject) => {
        const input = fs.createReadStream(filePath);
        const output = fs.createWriteStream(filePath + '.gz');
        const gzip = zlib.createGzip({ level: 9 });
        input.pipe(gzip).pipe(output);
        output.on('finish', resolve);
        output.on('error', reject);
    });
}

/**
 * Рекурсивно подсчитывает размер папки
 */
function getFolderSize(dir) {
    let size = 0;
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const filePath = path.join(dir, file.name);
        if (file.isDirectory()) {
            size += getFolderSize(filePath);
        } else {
            size += fs.statSync(filePath).size;
        }
    }
    return size;
}

// ═══════════════════════════════════════════════════════════════
// СБОРКА
// ═══════════════════════════════════════════════════════════════

async function build() {
    const startTime = Date.now();
    console.log('🔨 Cutsy CAD Production Build v2.0');
    console.log('═══════════════════════════════════════');

    // Очистка dist
    if (fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true });
        console.log('🗑️  Очищена папка dist/');
    }
    ensureDir(DIST_DIR);

    // ═══════════════════════════════════════════════════════════
    // 1. ОБРАБОТКА JS ФАЙЛОВ
    // ═══════════════════════════════════════════════════════════
    console.log('\n📦 Обфускация JavaScript...');
    console.log('   Легенда: ✅ полная | ⚡ лёгкая | 🔓 без обфускации | ⚠️ пропущен/фолбэк');
    let jsCount = 0;
    let skippedCount = 0;
    let noObfuscateCount = 0;
    let lightObfuscateCount = 0;
    let fullObfuscateCount = 0;

    // Основные JS-файлы
    for (const file of JS_FILES) {
        const srcPath = path.join(SRC_DIR, file);
        const destPath = path.join(DIST_DIR, file);

        if (!fs.existsSync(srcPath)) {
            console.warn(`   ⚠️  Пропущен (не найден): ${file}`);
            skippedCount++;
            continue;
        }

        const code = fs.readFileSync(srcPath, 'utf8');

        // Копирование без изменений (ни обфускация, ни stripConsoleLogs)
        if (COPY_VERBATIM_FILES.includes(file)) {
            ensureDir(path.dirname(destPath));
            fs.writeFileSync(destPath, code);
            console.log(`   📋 ${file} — копия без изменений (verbatim)`);
            jsCount++;
            continue;
        }

        // Лёгкая обфускация для performance-критичных файлов (мышь, клавиатура, рендер)
        if (LIGHT_OBFUSCATE_FILES.includes(file)) {
            try {
                const obfuscationResult = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS_LIGHT);
                const obfuscatedCode = obfuscationResult.getObfuscatedCode();
                ensureDir(path.dirname(destPath));
                fs.writeFileSync(destPath, obfuscatedCode);
                const originalSize = Buffer.byteLength(code, 'utf8');
                const newSize = Buffer.byteLength(obfuscatedCode, 'utf8');
                console.log(`   ⚡ ${file} — лёгкая обфускация (${(originalSize/1024).toFixed(1)}KB → ${(newSize/1024).toFixed(1)}KB, -${((1 - newSize/originalSize) * 100).toFixed(0)}%)`);
                jsCount++;
                lightObfuscateCount++;
            } catch (err) {
                console.error(`   ❌ Ошибка лёгкой обфускации ${file}: ${err.message}`);
                ensureDir(path.dirname(destPath));
                fs.writeFileSync(destPath, stripConsoleLogs(code));
                console.log(`   ⚠️  ${file} — фолбэк: лёгкая обфускация не удалась, console убраны`);
                jsCount++;
            }
            continue;
        }

        // Пропускаем обфускацию для критичных файлов
        if (NO_OBFUSCATE_FILES.includes(file)) {
            // Даже без обфускации — убираем console.log для продакшена
            const cleanedCode = stripConsoleLogs(code);
            ensureDir(path.dirname(destPath));
            fs.writeFileSync(destPath, cleanedCode);
            noObfuscateCount++;
            const origSize = Buffer.byteLength(code, 'utf8');
            const cleanSize = Buffer.byteLength(cleanedCode, 'utf8');
            console.log(`   🔓 ${file} — без обфускации, console убраны (${(origSize/1024).toFixed(1)}KB → ${(cleanSize/1024).toFixed(1)}KB, -${((1 - cleanSize/origSize) * 100).toFixed(0)}%)`);
            jsCount++;
            continue;
        }

        try {
            const obfuscationResult = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS);
            const obfuscatedCode = obfuscationResult.getObfuscatedCode();

            ensureDir(path.dirname(destPath));
            fs.writeFileSync(destPath, obfuscatedCode);
            jsCount++;
            fullObfuscateCount++;

            const originalSize = Buffer.byteLength(code, 'utf8');
            const newSize = Buffer.byteLength(obfuscatedCode, 'utf8');
            console.log(`   ✅ ${file} — полная обфускация (${(originalSize/1024).toFixed(1)}KB → ${(newSize/1024).toFixed(1)}KB, -${((1 - newSize/originalSize) * 100).toFixed(0)}%)`);
        } catch (err) {
            console.error(`   ❌ Ошибка обфускации ${file}: ${err.message}`);
            // Фолбэк — копируем как есть
            ensureDir(path.dirname(destPath));
            fs.writeFileSync(destPath, stripConsoleLogs(code));
            console.log(`   ⚠️  ${file} — фолбэк: обфускация не удалась, console убраны`);
            jsCount++;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 2. ОБРАБОТКА NESTING-MODULES (удаление комментариев)
    // ═══════════════════════════════════════════════════════════
    console.log('\n📦 Обработка nesting-modules (удаление комментариев)...');
    const nestingModulesSrc = path.join(SRC_DIR, 'nesting-modules');
    const nestingModulesDest = path.join(DIST_DIR, 'nesting-modules');
    
    if (fs.existsSync(nestingModulesSrc)) {
        ensureDir(nestingModulesDest);
        const moduleFiles = fs.readdirSync(nestingModulesSrc).filter(f => f.endsWith('.js'));
        
        for (const file of moduleFiles) {
            const srcPath = path.join(nestingModulesSrc, file);
            const destPath = path.join(nestingModulesDest, file);
            
            const code = fs.readFileSync(srcPath, 'utf8');
            const codeWithoutComments = removeComments(code);
            fs.writeFileSync(destPath, codeWithoutComments);
            
            const originalSize = Buffer.byteLength(code, 'utf8');
            const newSize = Buffer.byteLength(codeWithoutComments, 'utf8');
            console.log(`   🧹 ${file} — комментарии удалены (${(originalSize/1024).toFixed(1)}KB → ${(newSize/1024).toFixed(1)}KB, -${((1 - newSize/originalSize) * 100).toFixed(0)}%)`);
        }
    } else {
        console.warn(`   ⚠️  nesting-modules не найден`);
    }

    // ═══════════════════════════════════════════════════════════
    // 3. МИНИФИКАЦИЯ HTML
    // ═══════════════════════════════════════════════════════════
    console.log('\n📄 Минификация HTML...');
    for (const file of HTML_FILES) {
        const srcPath = path.join(SRC_DIR, file);
        const destPath = path.join(DIST_DIR, file);

        if (!fs.existsSync(srcPath)) {
            console.warn(`   ⚠️  Пропущен: ${file}`);
            continue;
        }

        const html = fs.readFileSync(srcPath, 'utf8');
        let minified = await minifyHtml(html, HTML_MINIFY_OPTIONS);

        // ✅ Удаляем ?v=3.27 из script/link тегов
        minified = stripVersionParams(minified);

        // ✅ Удаляем <script> теги для файлов из EXCLUDE_FILES
        minified = stripExcludedScripts(minified);

        fs.writeFileSync(destPath, minified);
        const originalSize = Buffer.byteLength(html, 'utf8');
        const newSize = Buffer.byteLength(minified, 'utf8');
        console.log(`   ✅ ${file} (${(originalSize/1024).toFixed(1)}KB → ${(newSize/1024).toFixed(1)}KB)`);
    }

    // ═══════════════════════════════════════════════════════════
    // 4. МИНИФИКАЦИЯ CSS
    // ═══════════════════════════════════════════════════════════
    console.log('\n🎨 Минификация CSS...');
    const cleanCss = new CleanCSS({ level: 2 });
    for (const file of CSS_FILES) {
        const srcPath = path.join(SRC_DIR, file);
        const destPath = path.join(DIST_DIR, file);

        if (!fs.existsSync(srcPath)) {
            console.warn(`   ⚠️  Пропущен: ${file}`);
            continue;
        }

        const css = fs.readFileSync(srcPath, 'utf8');
        const result = cleanCss.minify(css);

        if (result.errors.length > 0) {
            console.error(`   ❌ Ошибки в ${file}:`, result.errors);
        }

        fs.writeFileSync(destPath, result.styles);
        console.log(`   ✅ ${file} (${(result.stats.originalSize/1024).toFixed(1)}KB → ${(result.stats.minifiedSize/1024).toFixed(1)}KB)`);
    }

    // ═══════════════════════════════════════════════════════════
    // 5. КОПИРОВАНИЕ СТАТИЧЕСКИХ РЕСУРСОВ
    // ═══════════════════════════════════════════════════════════
    console.log('\n📂 Копирование ресурсов...');
    for (const item of COPY_AS_IS) {
        // Пропускаем HTML — они уже обработаны в шаге 3
        if (HTML_FILES.includes(item)) continue;

        const srcPath = path.join(SRC_DIR, item);
        let destPath = path.join(DIST_DIR, item);

        if (!fs.existsSync(srcPath)) {
            console.warn(`   ⚠️  Пропущен: ${item}`);
            continue;
        }

        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            copyFile(srcPath, destPath);
        }
        console.log(`   ✅ ${item}`);
    }

    // ═══════════════════════════════════════════════════════════
    // 6. ПРЕКОМПРЕССИЯ GZIP
    // ═══════════════════════════════════════════════════════════
    console.log('\n🗜️  Прекомпрессия gzip...');
    let gzipCount = 0;

    async function gzipDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const filePath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await gzipDir(filePath);
            } else if (/\.(html|css|js|json|svg)$/i.test(entry.name)) {
                try {
                    await gzipFile(filePath);
                    gzipCount++;
                } catch (err) {
                    console.warn(`   ⚠️  Gzip ошибка: ${entry.name}`);
                }
            }
        }
    }

    await gzipDir(DIST_DIR);
    console.log(`   ✅ Сжато ${gzipCount} файлов (.gz)`);

    // ═══════════════════════════════════════════════════════════
    // 7. ПРОВЕРКА ЦЕЛОСТНОСТИ
    // ═══════════════════════════════════════════════════════════
    console.log('\n🔍 Проверка целостности...');

    // Проверяем что index.html существует перед анализом
    let missingCount = 0;
    const distIndexPath = path.join(DIST_DIR, 'index.html');
    if (!fs.existsSync(distIndexPath)) {
        console.error('   ❌ dist/index.html не найден! Проверка целостности пропущена.');
        console.error('   ⚠️  Приложение не запустится — проверьте минификацию HTML.');
        missingCount = -1;
    } else {
        // Читаем dist/index.html и проверяем что все script src существуют
        const distHtml = fs.readFileSync(distIndexPath, 'utf8');
        const scriptSrcRegex = /src="([^"]+\.js)"/g;
        let match;
        while ((match = scriptSrcRegex.exec(distHtml)) !== null) {
            const src = match[1];
            // Пропускаем внешние CDN
            if (src.startsWith('http://') || src.startsWith('https://')) continue;
            const distFilePath = path.join(DIST_DIR, src);
            if (!fs.existsSync(distFilePath)) {
                console.error(`   ❌ ОТСУТСТВУЕТ в dist: ${src}`);
                missingCount++;
            }
        }
    }

    if (missingCount > 0) {
        console.error(`\n   ⛔ ${missingCount} файл(ов) отсутствует в dist! Приложение не запустится.`);
    } else if (missingCount === 0) {
        console.log('   ✅ Все JS-файлы из index.html присутствуют в dist/');
    }

    // ═══════════════════════════════════════════════════════════
    // ИТОГИ
    // ═══════════════════════════════════════════════════════════
    const distSize = getFolderSize(DIST_DIR);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n═══════════════════════════════════════');
    console.log(`✅ Сборка завершена за ${elapsed}с!`);
    console.log(`   📁 Папка: dist/`);
    console.log(`   📦 JS файлов: ${jsCount} (✅ полная: ${fullObfuscateCount}, ⚡ лёгкая: ${lightObfuscateCount}, 🔓 без: ${noObfuscateCount})`);
    if (skippedCount > 0) console.log(`   ⚠️  Пропущено (не найдено): ${skippedCount}`);
    console.log(`   🗜️  Gzip файлов: ${gzipCount}`);
    console.log(`   💾 Общий размер: ${(distSize/1024).toFixed(1)} KB`);
    if (missingCount > 0) console.log(`   ❌ Отсутствует файлов: ${missingCount}`);
    console.log('\n💡 Для запуска: откройте dist/index.html');
    console.log('💡 Для деплоя: загрузите содержимое dist/ на хостинг');
    console.log('💡 Для nginx: включите gzip_static on; для .gz файлов');
    console.log('═══════════════════════════════════════');
}

// ═══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════

/**
 * Удаляет console.log/console.warn/console.info из кода
 * Оставляет console.error — полезно для отладки в продакшене
 *
 * Заменяет вызовы на void 0, сохраняя синтаксис.
 * Корректно обрабатывает вложенные скобки, строки и regex-литералы.
 */
function stripConsoleLogs(code) {
    const methods = ['log', 'warn', 'info', 'debug'];
    let result = code;

    for (const method of methods) {
        const pattern = new RegExp(`\\bconsole\\.${method}\\s*\\(`, 'g');
        let match;
        const replacements = [];

        while ((match = pattern.exec(result)) !== null) {
            const start = match.index;
            
            // ✅ Проверяем, что console.xxx не находится внутри строкового литерала
            let before = result.slice(0, start);
            let quoteCount = 0;
            let escaped = false;
            for (let i = 0; i < before.length; i++) {
                if (escaped) { escaped = false; continue; }
                if (before[i] === '\\') { escaped = true; continue; }
                if (before[i] === '"' || before[i] === "'" || before[i] === '`') {
                    quoteCount++;
                }
            }
            // Если нечётное число кавычек — мы внутри строки, пропускаем
            if (quoteCount % 2 !== 0) {
                continue;
            }

            let i = match.index + match[0].length;
            let depth = 1;

            while (i < result.length && depth > 0) {
                const ch = result[i];
                if (ch === '(') {
                    depth++;
                    i++;
                } else if (ch === ')') {
                    depth--;
                    i++;
                } else if (ch === '"' || ch === "'" || ch === '`') {
                    const quote = ch;
                    i++;
                    while (i < result.length) {
                        if (result[i] === '\\') {
                            i += 2;
                        } else if (result[i] === quote) {
                            i++;
                            break;
                        } else {
                            i++;
                        }
                    }
                } else if (ch === '/' && result[i + 1] === '/') {
                    while (i < result.length && result[i] !== '\n') i++;
                } else if (ch === '/' && result[i + 1] === '*') {
                    i += 2;
                    while (i < result.length - 1 && !(result[i] === '*' && result[i + 1] === '/')) i++;
                    i += 2;
                } else {
                    i++;
                }
            }

            replacements.push({ start, end: i, replacement: 'void 0' });
        }

        for (let i = replacements.length - 1; i >= 0; i--) {
            const { start, end, replacement } = replacements[i];
            result = result.slice(0, start) + replacement + result.slice(end);
        }
    }

    return result;
}

/**
 * Удаляет все комментарии из JavaScript кода
 * Удаляет: // однострочные и /* ... *\/ многострочные
 * Корректно обрабатывает: строки, regex-литералы, незакрытые комментарии
 */
function removeComments(code) {
    let result = '';
    let i = 0;
    const len = code.length;

    /**
     * Проверяет, является ли '/' на позиции pos началом regex-литерала.
     * Regex следует после: =, (, [, !, &, |, ^, ~, +, -, *, /, %, <, >, ?, :, ;, {, }, ,
     * или в начале файла/строки.
     */
    function isRegexStart(pos) {
        if (pos === 0) return true;
        // Ищем последний непробельный символ перед '/'
        let j = pos - 1;
        while (j >= 0 && (code[j] === ' ' || code[j] === '\t' || code[j] === '\n' || code[j] === '\r')) {
            j--;
        }
        if (j < 0) return true;
        const prevCh = code[j];
        // После этих символов '/' — начало regex
        return '=(!&|^~+-*/%<>?:;{},'.includes(prevCh);
    }

    while (i < len) {
        // Проверяем начало regex-литерала
        if (code[i] === '/' && isRegexStart(i)) {
            // Читаем regex до закрывающего '/'
            result += code[i]; // открывающий '/'
            i++;
            // Флаг: предыдущий символ был экранирован (\\ внутри regex)
            while (i < len) {
                if (code[i] === '\\') {
                    // Экранированный символ внутри regex
                    result += code[i] + (code[i + 1] || '');
                    i += 2;
                } else if (code[i] === '/') {
                    // Закрывающий '/' regex
                    result += code[i];
                    i++;
                    // Читаем флаги (g, i, m, s, u, y)
                    while (i < len && /[gimsuy]/.test(code[i])) {
                        result += code[i];
                        i++;
                    }
                    break;
                } else if (code[i] === '[') {
                    // Класс символов внутри regex — всё до ']' без экранирования '/'
                    result += code[i];
                    i++;
                    while (i < len && code[i] !== ']') {
                        if (code[i] === '\\') {
                            result += code[i] + (code[i + 1] || '');
                            i += 2;
                        } else {
                            result += code[i];
                            i++;
                        }
                    }
                    if (i < len) {
                        result += code[i]; // ']'
                        i++;
                    }
                } else {
                    result += code[i];
                    i++;
                }
            }
        }
        // Проверяем начало однострочного комментария
        else if (code[i] === '/' && code[i + 1] === '/') {
            // Пропускаем до конца строки
            while (i < len && code[i] !== '\n' && code[i] !== '\r') {
                i++;
            }
            // Сохраняем перенос строки для корректного подсчёта строк
            if (i < len) {
                result += '\n';
                i++;
            }
        }
        // Проверяем начало многострочного комментария
        else if (code[i] === '/' && code[i + 1] === '*') {
            // Пропускаем до */
            i += 2;
            let closed = false;
            while (i < len - 1) {
                if (code[i] === '*' && code[i + 1] === '/') {
                    i += 2;
                    closed = true;
                    break;
                }
                if (code[i] === '\n') {
                    result += '\n'; // Сохраняем переносы строк
                }
                i++;
            }
            // Защита от незакрытого /* — если дошли до конца, сохраняем переносы
            if (!closed && i >= len - 1) {
                console.warn('⚠️  Незакрытый комментарий /* в nesting-modules — обрезан');
            }
        }
        // Проверяем строковые литералы (чтобы не удалить комментарии внутри строк)
        else if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
            const quote = code[i];
            result += code[i];
            i++;
            while (i < len) {
                if (code[i] === '\\') {
                    result += code[i] + code[i + 1];
                    i += 2;
                } else if (code[i] === quote) {
                    result += code[i];
                    i++;
                    break;
                } else if (code[i] === '\n' && quote !== '`') {
                    // Необработанная новая строка в строке — завершаем
                    break;
                } else {
                    result += code[i];
                    i++;
                }
            }
        }
        // Обычный символ
        else {
            result += code[i];
            i++;
        }
    }

    return result;
}

build().catch(err => {
    console.error('❌ Ошибка сборки:', err);
    process.exit(1);
});