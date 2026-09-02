// ═══════════════════════════════════════════════════════════
// dxf-dragdrop.js — v4.63 — Drag & Drop импорт DXF и КОМПАС .FRW файлов
// ═══════════════════════════════════════════════════════════
// Перетаскивание DXF/FRW файла на страницу → автоматический импорт
// объектов на главный холст для редактирования.
//
// DXF: использует importDXF() из dxf-import.js (надёжный парсинг).
// FRW: использует importFRW() из frw-import.js (эвристический
//      экстрактор геометрии из проприетарного бинарного формата
//      КОМПАС-3D). Если эвристика не нашла геометрию — показывает
//      инструкцию по экспорту в DXF.
//
// После импорта объекты добавляются в глобальный массив `objects`
// и холст автоматически отрисовывается.
// ═══════════════════════════════════════════════════════════

(function() {
'use strict';

let dragOverlay = null;
let dragCounter = 0; // Для обработки вложенных dragenter/dragleave

// ═══════════════════════════════════════════════════════════════
// СОЗДАНИЕ OVERLAY (визуальная подсказка при перетаскивании)
// ═══════════════════════════════════════════════════════════════

function createDragOverlay() {
    if (dragOverlay) return dragOverlay;

    dragOverlay = document.createElement('div');
    dragOverlay.id = 'dxfDragOverlay';
    dragOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 122, 204, 0.15);
        border: 3px dashed #00aaff;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        backdrop-filter: blur(2px);
    `;

    const inner = document.createElement('div');
    inner.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 2px solid #00aaff;
        border-radius: 16px;
        padding: 40px 60px;
        text-align: center;
        box-shadow: 0 8px 32px rgba(0, 170, 255, 0.4);
    `;
    inner.innerHTML = `
        <div style="font-size: 64px; margin-bottom: 16px;">📂</div>
        <div style="color: #00aaff; font-size: 22px; font-weight: bold; margin-bottom: 8px;">Отпустите для импорта DXF / FRW</div>
        <div style="color: #aaa; font-size: 14px;">Файл будет открыт на холсте для редактирования</div>
    `;
    dragOverlay.appendChild(inner);

    document.body.appendChild(dragOverlay);
    return dragOverlay;
}

function showDragOverlay() {
    createDragOverlay();
    dragOverlay.style.display = 'flex';
}

function hideDragOverlay() {
    if (dragOverlay) {
        dragOverlay.style.display = 'none';
    }
}

// ═══════════════════════════════════════════════════════════════
// ОБРАБОТКА ПЕРЕТАСКИВАНИЯ
// ═══════════════════════════════════════════════════════════════

// dragenter — счётчик увеличивается
document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Проверяем что перетаскивается файл
    if (!e.dataTransfer || !e.dataTransfer.types || !e.dataTransfer.types.includes('Files')) {
        return;
    }

    dragCounter++;
    showDragOverlay();
});

// dragover — предотвращаем дефолтное поведение (иначе drop не сработает)
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
    }
});

// dragleave — счётчик уменьшается
document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter--;
    if (dragCounter <= 0) {
        dragCounter = 0;
        hideDragOverlay();
    }
});

// drop — основной обработчик
document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    hideDragOverlay();

    if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) {
        return;
    }

    const files = Array.from(e.dataTransfer.files);
    const dxfFiles = files.filter(f => f.name.toLowerCase().endsWith('.dxf'));
    const frwFiles = files.filter(f => f.name.toLowerCase().endsWith('.frw'));

    if (dxfFiles.length === 0 && frwFiles.length === 0) {
        // Есть файлы, но не DXF/FRW
        const otherFiles = files.filter(f =>
            !f.name.toLowerCase().endsWith('.dxf') &&
            !f.name.toLowerCase().endsWith('.frw'));
        if (otherFiles.length > 0) {
            alert(`⚠️ Поддерживаются только DXF и FRW файлы!\n\nПолучено: ${otherFiles.length} файл(ов)\nИз них DXF: 0, FRW: 0`);
        }
        return;
    }

    // Импортируем каждый DXF файл
    for (let i = 0; i < dxfFiles.length; i++) {
        const file = dxfFiles[i];
        console.log(`📂 [DXF-DROP] Импорт "${file.name}" (${i + 1}/${dxfFiles.length})...`);

        try {
            // Вызываем существующую функцию importDXF
            if (typeof importDXF !== 'function') {
                alert('❌ Ошибка: функция importDXF не найдена. Убедитесь что dxf-import.js загружен.');
                return;
            }

            const result = await importDXF(file);

            if (!result || !result.objects || result.objects.length === 0) {
                console.warn(`⚠️ [DXF-DROP] Файл "${file.name}" не содержит объектов`);
                continue;
            }

            console.log(`✅ [DXF-DROP] "${file.name}": ${result.objects.length} объектов, bounds=${result.bounds.width.toFixed(1)}×${result.bounds.height.toFixed(1)}мм`);

            // v4.63: нормализация + сдвиг + добавление на холст вынесено в функцию
            // addImportedObjectsToCanvas() — используется и для DXF, и для FRW.
            await addImportedObjectsToCanvas(result, 'DXF');

        } catch (err) {
            console.error(`❌ [DXF-DROP] Ошибка импорта "${file.name}":`, err);
            alert(`❌ Ошибка импорта "${file.name}":\n${err.message}`);
        }
    }

    // Импортируем каждый FRW файл (эвристический экстрактор)
    for (let i = 0; i < frwFiles.length; i++) {
        const file = frwFiles[i];
        console.log(`📐 [FRW-DROP] Импорт "${file.name}" (${i + 1}/${frwFiles.length})...`);

        try {
            // Проверяем что importFRW доступна
            if (typeof importFRW !== 'function') {
                alert('❌ Ошибка: функция importFRW не найдена. Убедитесь что frw-import.js загружен.');
                continue;
            }

            const result = await importFRW(file);

            if (!result || !result.objects || result.objects.length === 0) {
                console.warn(`⚠️ [FRW-DROP] Эвристический экстрактор не нашёл геометрию в "${file.name}"`);
                // v4.63: Понятное сообщение + инструкция по экспорту в DXF
                alert(
                    `⚠️ Не удалось извлечь геометрию из файла:\n  ${file.name}\n\n` +
                    `.FRW — проприетарный бинарный формат КОМПАС-3D (ASCON).\n` +
                    `Публичной спецификации формата нет, поэтому надёжный\n` +
                    `парсинг в браузере невозможен. Эвристический экстрактор\n` +
                    `не нашёл распознаваемую геометрию.\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `РЕКОМЕНДАЦИЯ: экспортируйте файл в DXF из КОМПАС-3D:\n\n` +
                    `  1. Откройте файл в КОМПАС-3D\n` +
                    `  2. Файл → Сохранить как…\n` +
                    `  3. Тип файла: «DXF (*.dxf)»\n` +
                    `  4. Сохранить и перетащите .dxf на этот холст\n\n` +
                    `DXF импортируется полностью и точно.`
                );
                continue;
            }

            console.log(`✅ [FRW-DROP] "${file.name}": ${result.objects.length} объектов (эвристика: ${result.heuristic ? 'да' : 'нет'}, источник: ${result.source || 'unknown'}), bbox=${result.bounds.width.toFixed(1)}×${result.bounds.height.toFixed(1)}мм`);

            // Предупреждение для эвристически извлечённой геометрии
            if (result.heuristic) {
                console.warn(`⚠️ [FRW-DROP] ВНИМАНИЕ: геометрия извлечена эвристически — может быть неполной или искажённой. Для точного результата экспортируйте в DXF.`);
            }

            // Тот же код нормализации/сдвига, что и для DXF
            await addImportedObjectsToCanvas(result, 'FRW');

        } catch (err) {
            console.error(`❌ [FRW-DROP] Ошибка импорта "${file.name}":`, err);
            alert(`❌ Ошибка импорта "${file.name}":\n${err.message}`);
        }
    }

    // Обновляем холст
    if (typeof render === 'function') {
        render();
    }
    if (typeof updateObjectsList === 'function') {
        updateObjectsList();
    }

    // Показываем уведомление
    const totalImported = dxfFiles.length + frwFiles.length;
    if (totalImported === 1) {
        const name = dxfFiles.length ? dxfFiles[0].name : frwFiles[0].name;
        console.log(`🎉 [DROP] Импорт завершён: "${name}"`);
    } else if (totalImported > 1) {
        console.log(`🎉 [DROP] Импорт завершён: ${totalImported} файлов`);
    }
});

// Предотвращаем дефолтное поведение для всего окна
// (иначе браузер может открыть файл вместо импорта)
window.addEventListener('dragover', (e) => {
    e.preventDefault();
});

window.addEventListener('drop', (e) => {
    e.preventDefault();
});

// ═══════════════════════════════════════════════════════════════
// v4.63: Переиспользуемая функция добавления импортированных объектов
// на холст. Используется и для DXF, и для FRW. Нормализует координаты
// к (0,0), сдвигает вправо от существующих объектов, добавляет в
// глобальный массив `objects`, сохраняет undo-состояние.
// ═══════════════════════════════════════════════════════════════
async function addImportedObjectsToCanvas(result, source) {
    if (!result || !result.objects || result.objects.length === 0) return;
    if (!result.bounds) return;

    // Нормализуем координаты к (0, 0)
    const offsetX = -result.bounds.minX;
    const offsetY = -result.bounds.minY;

    // Если холст не пуст — сдвигаем новые объекты вправо от существующих
    let shiftX = 0;
    if (typeof objects !== 'undefined' && objects.length > 0) {
        let maxExistingX = -Infinity;
        for (const obj of objects) {
            if (!obj) continue;
            let objMaxX = 0;
            if (obj.type === 'line') objMaxX = Math.max(obj.x1, obj.x2);
            else if (obj.x !== undefined) objMaxX = obj.x + (obj.width || 0);
            else if (obj.cx !== undefined) objMaxX = obj.cx + (obj.radius || 0);
            else if (obj.points) objMaxX = Math.max(...obj.points.map(p => p.x));
            if (objMaxX > maxExistingX) maxExistingX = objMaxX;
        }
        shiftX = maxExistingX + 20; // Отступ 20мм
    }

    const totalOffsetX = offsetX + shiftX;
    const totalOffsetY = offsetY;

    for (const obj of result.objects) {
        if (!obj) continue;

        if (obj.type === 'line') {
            obj.x1 += totalOffsetX; obj.y1 += totalOffsetY;
            obj.x2 += totalOffsetX; obj.y2 += totalOffsetY;
        } else if (obj.type === 'circle') {
            obj.cx += totalOffsetX; obj.cy += totalOffsetY;
        } else if (obj.type === 'rect') {
            obj.x += totalOffsetX; obj.y += totalOffsetY;
        } else if (obj.type === 'polygon') {
            // CustomPolygon из FRW имеет points[], НЕ cx/cy — обрабатываем отдельно
            if (obj.points) {
                obj.points.forEach(p => { p.x += totalOffsetX; p.y += totalOffsetY; });
            } else {
                obj.cx += totalOffsetX; obj.cy += totalOffsetY;
            }
        } else if (obj.type === 'arc') {
            obj.cx += totalOffsetX; obj.cy += totalOffsetY;
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            if (obj.points) obj.points.forEach(p => { p.x += totalOffsetX; p.y += totalOffsetY; });
            if (obj.vertices) obj.vertices.forEach(p => { p.x += totalOffsetX; p.y += totalOffsetY; });
        } else if (obj.type === 'spline') {
            ['fitPoints', 'controlPoints', 'points', 'vertices'].forEach(key => {
                if (obj[key]) obj[key].forEach(p => { p.x += totalOffsetX; p.y += totalOffsetY; });
            });
        } else if (obj.type === 'ellipse') {
            obj.cx += totalOffsetX; obj.cy += totalOffsetY;
        }

        if (typeof objects !== 'undefined') {
            objects.push(obj);
        }
    }

    // Сохраняем состояние для Undo
    if (typeof saveState === 'function') {
        saveState();
    }
}

console.log('✅ dxf-dragdrop.js загружен (v4.63) — перетащите DXF или FRW файл на страницу');

})();