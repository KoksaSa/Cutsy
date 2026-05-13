/**
 * Cutsy CAD — Production Build Script
 * Обфускация, минификация, удаление логов и комментариев
 */

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');

// ═══════════════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════════════════════

const SRC_DIR = __dirname;
const DIST_DIR = path.join(SRC_DIR, 'dist');  // Сборка в папке dist/ внутри проекта

// Файлы и папки, которые копируются как есть (ресурсы)
const COPY_AS_IS = [
    'favicon.png',
    'logo.png',
    'Presentation.html'
    // ⚠️ НЕ добавлять screenshots/ — тестовые файлы, не нужны в продакшене
    // Если нужно добавить другие ресурсы, добавьте их сюда
];

// JS-файлы, которые нужно обфусцировать (в порядке загрузки важно сохранять имена)
const JS_FILES = [
    'splash.js',
    'flip-nested.js',
    'svg-export.js',
    'detail-export.js',
    'shapes.js',
    'ui-functions.js',
    'render.js',
    'snapping.js',
    'dimensions.js',
    'js/globals.js',
    'js/config.js',
    'js/license.js',
    'js/license-gate.js',
    'nesting.js',
    'translations.js',
    'sheet-remnant.js',
    'dxf-import.js',
    'dxf-import-ui.js',
    'js/store.js',
    'js/validators.js',
    'js/sound.js',
    'js/join-parts.js',
    'js/keyboard-events.js',
    'js/mouse-events.js',
    'js/context-menus.js',
    'pdf-report.js',
    'pricing-mutual-exclusion.js',
    'js/undo-redo.js'
];

// Файлы, которые НЕ нужно обфусцировать (сложная логика, динамические вызовы)
const NO_OBFUSCATE_FILES = [
    'nesting.js',          // Тяжёлые математические циклы — обфускация тормозит
    'shapes.js',
    'js/mouse-events.js',
    'render.js',           // Отрисовка зависит от глобальных переменных
    'js/globals.js',       // Глобальные переменные и состояния
    'js/keyboard-events.js' // Горячие клавиши
];

// HTML-файлы для минификации
const HTML_FILES = ['index.html', 'privacy.html', 'terms.html'];

// CSS-файлы для минификации
const CSS_FILES = ['styles.css'];

// Настройки обфускатора (агрессивные, но безопасные)
const OBFUSCATOR_OPTIONS = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.3,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.05,
    debugProtection: true,
    debugProtectionInterval: 2000,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,           // ВАЖНО: сохраняем глобальные имена
    reservedName: [                // Глобальные имена, которые НЕЛЬЗЯ трогать
        'canvas', 'ctx', 'objects', 'parts', 'Store', 'StoreHelpers',
        'LicenseManager', 'window', 'document', 'console', 'localStorage',
        'navigator', 'screen', 'location', 'Math', 'JSON', 'Date',
        'selectedObjects', 'currentTool', 'isDrawing', 'startPoint',
        'currentShape', 'isDragging', 'dragOffset', 'snapEnabled',
        'orthoEnabled', 'zoom', 'panX', 'panY', 'sheetSize',
        'showSheetView', 'nestedParts', 'allSheets', 'currentSheetIndex',
        'markupRects', 'isDrawingRect', 'currentRect', 'selectedRectIndex',
        'cutRemnantLine', 'showCutRemnantLine', 'isDraggingCutLine',
        'diagonalLayoutEnabled', 'diagonalPatternSource',
        'diagonalPatternStartPoint', 'diagonalPatternEndPoint',
        'diagonalPatternDragging', 'isCalibrating', 'calibratePoint1',
        'calibratePoint2', 'sheetBackgroundImage', 'sheetImageScale',
        'sheetRemnant', 'isShiftPressed', 'selectedNestedParts',
        'isDraggingNested', 'nestedDragOffsets', 'sheetZoom',
        'sheetPanX', 'sheetPanY', 'isSheetPanning', 'isSheetSelecting',
        'sheetSelectStart', 'sheetSelectEnd', 'allowOverlap',
        'isEditingPart', 'editingPartId', 'dimensionLines',
        'angleDimensions', 'clipboard', 'clipboardNested',
        // Методы Map и Set
        'Map', 'Set', 'get', 'set', 'has', 'delete', 'clear', 'size',
        // Методы массивов
        'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'concat',
        'indexOf', 'includes', 'find', 'findIndex', 'filter', 'map', 'forEach',
        'reduce', 'some', 'every', 'sort', 'reverse',
        // Методы строк
        'toString', 'substring', 'substr', 'slice', 'indexOf', 'includes',
        // Методы объектов
        'constructor', 'prototype', 'name', 'length', 'keys', 'values',
        // Критичные для nesting.js
        'partHullCache', 'clearPartHullCache', 'getPartConvexHull',
        'computeNFP', 'minkowskiSum', 'polygonArea', 'isPointInPolygon',
        'isConvex', 'getConvexHull', 'rotatePolygon', 'translatePolygon',
        'getPartPolygons', 'getPartConvexHull', 'generateCandidatePositions',
        'tryPlacePartsOnSheet', 'performNesting', 'checkCollision',
        'checkPolygonCollision', 'buildSpatialGrid', 'SPATIAL_CELL_SIZE',
        // Методы классов фигур
        'Line', 'Circle', 'Rect', 'Polygon', 'Text', 'draw', 'contains',
        'getPoints', 'getVertices', 'bounds', 'width', 'height',
        // Прочие критичные имена
        'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'radius',
        'angle', 'rotation', 'rotationMode', 'thickness', 'quantity',
        'visible', 'nestingEnabled', 'spacing', 'oneCutEnabled', 'noRotate',
        'refPoint', 'polygon', 'positionedHull', 'baseWidth', 'baseHeight'
    ],
    rotateStringArray: true,
    selfDefending: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.6,
    transformObjectKeys: false,     // ВАЖНО: не ломаем obj['key']
    unicodeEscapeSequence: false
};

// Настройки минификации HTML
const HTML_MINIFY_OPTIONS = {
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    decodeEntities: true,
    html5: true,
    minifyCSS: true,
    minifyJS: false,  // ВАЖНО: отключено, чтобы не ломать встроенные скрипты
    removeAttributeQuotes: true,
    removeComments: true,
    removeEmptyAttributes: true,
    removeOptionalTags: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    sortAttributes: true,
    sortClassName: true,
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

// ═══════════════════════════════════════════════════════════════
// СБОРКА
// ═══════════════════════════════════════════════════════════════

async function build() {
    console.log('🔨 Cutsy CAD Production Build');
    console.log('═══════════════════════════════════════');

    // Очистка dist
    if (fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true });
        console.log('🗑️  Очищена папка dist/');
    }
    ensureDir(DIST_DIR);

    // 1. Обфускация JS
    console.log('\n📦 Обфускация JavaScript...');
    let jsCount = 0;
    for (const file of JS_FILES) {
        const srcPath = path.join(SRC_DIR, file);
        const destPath = path.join(DIST_DIR, file);

        if (!fs.existsSync(srcPath)) {
            console.warn(`   ⚠️  Пропущен (не найден): ${file}`);
            continue;
        }

        const code = fs.readFileSync(srcPath, 'utf8');
        
        // Пропускаем обфускацию для критичных файлов
        if (NO_OBFUSCATE_FILES.includes(file)) {
            console.log(`   🔓 ${file} (без обфускации)`);
            ensureDir(path.dirname(destPath));
            fs.writeFileSync(destPath, code);
            jsCount++;
            continue;
        }

        const obfuscationResult = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS);
        const obfuscatedCode = obfuscationResult.getObfuscatedCode();

        ensureDir(path.dirname(destPath));
        fs.writeFileSync(destPath, obfuscatedCode);
        jsCount++;

        const originalSize = Buffer.byteLength(code, 'utf8');
        const newSize = Buffer.byteLength(obfuscatedCode, 'utf8');
        console.log(`   ✅ ${file} (${(originalSize/1024).toFixed(1)}KB → ${(newSize/1024).toFixed(1)}KB)`);
    }

    // 2. Минификация HTML
    console.log('\n📄 Минификация HTML...');
    for (const file of HTML_FILES) {
        const srcPath = path.join(SRC_DIR, file);
        const destPath = path.join(DIST_DIR, file);

        if (!fs.existsSync(srcPath)) {
            console.warn(`   ⚠️  Пропущен: ${file}`);
            continue;
        }

        const html = fs.readFileSync(srcPath, 'utf8');
        const minified = await minifyHtml(html, HTML_MINIFY_OPTIONS);

        // Удаляем ненужные скрипты/ссылки (server.js, bat-файлы и т.д.)
        let cleaned = minified;

        fs.writeFileSync(destPath, cleaned);
        console.log(`   ✅ ${file}`);
    }

    // 3. Минификация CSS
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

    // 4. Копирование статических ресурсов
    console.log('\n📂 Копирование ресурсов...');
    for (const item of COPY_AS_IS) {
        const srcPath = path.join(SRC_DIR, item);
        const destPath = path.join(DIST_DIR, item);

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

    // 5. Подсчёт размера
    const getFolderSize = (dir) => {
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
    };

    const distSize = getFolderSize(DIST_DIR);
    console.log('\n═══════════════════════════════════════');
    console.log(`✅ Сборка завершена!`);
    console.log(`   📁 Папка: dist/`);
    console.log(`   📦 JS файлов обфусцировано: ${jsCount}`);
    console.log(`   💾 Общий размер: ${(distSize/1024).toFixed(1)} KB`);
    console.log('\n💡 Для запуска откройте dist/index.html');
    console.log('═══════════════════════════════════════');
}

build().catch(err => {
    console.error('❌ Ошибка сборки:', err);
    process.exit(1);
});
