// ═══════════════════════════════════════════════════════════
// markup-rect-ui.js — извлечено из index.html
// ═══════════════════════════════════════════════════════════

window.openMarkupRectMenu = function(rectIndex, clientX, clientY) {
    console.log('📦 Открытие меню заполнения для элемента разметки:', rectIndex);

    currentMarkupRectIndex = rectIndex;
    const rects = window.markupRects || markupRects || [];
    const item = rects[rectIndex];

    if (!item) {
        console.error('❌ Элемент разметки не найден');
        return;
    }

    // Вычисляем bounding box и площадь в зависимости от типа
    let infoHTML = '';
    let itemWidth, itemHeight, itemArea;

    if (item.type === 'circle') {
        itemWidth = item.radius * 2;
        itemHeight = item.radius * 2;
        itemArea = Math.PI * Math.pow(item.radius, 2);
        infoHTML = `
            <strong>⭕ Тип:</strong> Круг<br>
            <strong>📐 Радиус:</strong> ${parseFloat(item.radius.toFixed(2))} мм | Диаметр: ${parseFloat(itemWidth.toFixed(2))} мм<br>
            <strong>📊 Площадь:</strong> ${parseFloat(itemArea.toFixed(2))} мм²
        `;
    } else if (item.type === 'polygon') {
        // Bounding box полигона
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of item.points) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        itemWidth = maxX - minX;
        itemHeight = maxY - minY;
        // Площадь полигона (формула шнуровки)
        itemArea = 0;
        for (let i = 0; i < item.points.length; i++) {
            const j = (i + 1) % item.points.length;
            itemArea += item.points[i].x * item.points[j].y;
            itemArea -= item.points[j].x * item.points[i].y;
        }
        itemArea = Math.abs(itemArea) / 2;
        infoHTML = `
            <strong>🔷 Тип:</strong> Полигон (${item.points.length} точек)<br>
            <strong>📐 Размер остатка:</strong> ${parseFloat(itemWidth.toFixed(2))} × ${parseFloat(itemHeight.toFixed(2))} мм<br>
            <strong>📊 Площадь:</strong> ${parseFloat(itemArea.toFixed(2))} мм²
        `;
    } else {
        // Прямоугольник (по умолчанию)
        itemWidth = item.width;
        itemHeight = item.height;
        itemArea = item.width * item.height;
        infoHTML = `
            <strong>▭ Тип:</strong> Прямоугольник<br>
            <strong>📐 Размер остатка:</strong> ${parseFloat(itemWidth.toFixed(2))} × ${parseFloat(itemHeight.toFixed(2))} мм<br>
            <strong>📊 Площадь:</strong> ${parseFloat(itemArea.toFixed(2))} мм²
        `;
    }

    // Показываем информацию об элементе разметки
    const markupRectInfo = document.getElementById('markupRectInfo');
    if (markupRectInfo) {
        markupRectInfo.innerHTML = infoHTML;
    }

    // Заполняем выпадающий список доступными деталями
    const partSelect = document.getElementById('markupRectPartSelect');
    partSelect.innerHTML = '';

    let hasAvailableParts = false;
    const edgeGap = 6; // Зазор с обеих сторон

    parts.forEach(part => {
        // Пропускаем "Ломаную линию" — это вспомогательный объект, не деталь
        if (part.name === 'Ломаная линия') return;

        // Проверяем, есть ли ещё доступные детали (не все размещены)
        const placedCount = nestedParts.filter(n => n.partId === part.id).length;
        const remaining = part.quantity - placedCount;

        // Проверяем, влезет ли деталь в bounding box элемента разметки
        const fitsNormal = part.bounds.width <= itemWidth - edgeGap && part.bounds.height <= itemHeight - edgeGap;
        const fitsRotated = part.bounds.width <= itemHeight - edgeGap && part.bounds.height <= itemWidth - edgeGap;
        const fits = fitsNormal || fitsRotated;

        if (remaining > 0 && fits) {
            hasAvailableParts = true;
            const option = document.createElement('option');
            option.value = part.id;
            option.textContent = `${part.name || `Деталь #${part.id}`} (${parseFloat(part.bounds.width.toFixed(2))}×${parseFloat(part.bounds.height.toFixed(2))} мм) - Осталось: ${remaining}`;
            partSelect.appendChild(option);
        }
    });

    if (!hasAvailableParts) {
        partSelect.innerHTML = '<option value="">❌ Нет доступных деталей</option>';
    }

    // Устанавливаем количество = 1
    document.getElementById('markupRectQuantity').value = '1';

    // Показываем меню заполнения остатка
    const markupRectFillMenu = document.getElementById('markupRectFillMenu');
    if (markupRectFillMenu) {
        markupRectFillMenu.style.display = 'block';
        markupRectFillMenu.style.left = (clientX + 10) + 'px';
        markupRectFillMenu.style.top = (clientY + 10) + 'px';
    }
};

document.getElementById('markupRectCancel').addEventListener('click', () => {
    // Очищаем поля
    const partSelect = document.getElementById('markupRectPartSelect');
    if (partSelect) partSelect.innerHTML = '';
    document.getElementById('markupRectQuantity').value = '1';
    markupRectFillMenu.style.display = 'none';
});

document.getElementById('markupRectOk').addEventListener('click', () => {
    if (currentMarkupRectIndex < 0) {
        markupRectFillMenu.style.display = 'none';
        return;
    }

    // Получаем выбранные деталь и количество
    const partSelect = document.getElementById('markupRectPartSelect');
    const partId = parseFloat(partSelect.value);
    const qty = parseInt(document.getElementById('markupRectQuantity').value) || 1;

    if (!partId || qty <= 0) {
        alert('❌ Выберите деталь и укажите количество');
        return;
    }

    // Находим деталь
    const part = parts.find(p => p.id === partId);
    if (!part) {
        alert('❌ Деталь не найдена');
        return;
    }

    console.log('📋 [FILL REMNANT] Размещаем деталь:');
    console.log(`  - Деталь "${part.name}" (ID: ${part.id}): ${qty} шт`);

    // Получаем выбранный прямоугольник
    const rects = window.markupRects || markupRects || [];
    const rect = rects[currentMarkupRectIndex];
    if (!rect) {
        alert('❌ Прямоугольник не найден');
        markupRectFillMenu.style.display = 'none';
        return;
    }

    // Собираем данные для размещения
    const partsToPlace = [{ part, qty }];

    // Размещаем детали в прямоугольнике с использованием NFP
    placePartsInMarkupRect(rect, partsToPlace, currentMarkupRectIndex);

    markupRectFillMenu.style.display = 'none';
    render();
    updatePartsList();
    console.log(`✅ Размещено деталей в остаток: ${qty}`);
});

document.getElementById('contextMenuOk').addEventListener('click', () => {
    createPartFromSelection(
        parseInt(contextPartQuantity.value) || 1,
        contextPartName.value.trim(),
        parseFloat(document.getElementById('contextPartThickness').value) || 0.8,
        parseFloat(document.getElementById('contextPartSpacing').value) || 3
    );
    contextMenu.style.display = 'none';
});

// Кнопка "Создать остаток листа" — оборачиваем в DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('contextMenuCreateRemnant');
        if (btn) {
            btn.addEventListener('click', () => {
                contextMenu.style.display = 'none';
                const fn = window.createSheetRemnantFromSelection;
                if (typeof fn === 'function') {
                    fn();
                } else {
                    console.error('❌ createSheetRemnantFromSelection не найдена');
                    alert('⚠️ Функция создания остатка недоступна. Перезагрузите страницу.');
                }
            });
        }
    });
} else {
    const btn = document.getElementById('contextMenuCreateRemnant');
    if (btn) {
        btn.addEventListener('click', () => {
            contextMenu.style.display = 'none';
            const fn = window.createSheetRemnantFromSelection;
            if (typeof fn === 'function') {
                fn();
            } else {
                console.error('❌ createSheetRemnantFromSelection не найдена');
                alert('⚠️ Функция создания остатка недоступна. Перезагрузите страницу.');
            }
        });
    }
}

