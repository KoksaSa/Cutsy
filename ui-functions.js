// ═══════════════════════════════════════════════════════════════
// UI ФУНКЦИИ (USER INTERFACE)
// ═══════════════════════════════════════════════════════════════
// Вынесено из index.html для удобства поддержки

// ═══════════════════════════════════════════════════════════════
// ПОКАЗ СВОЙСТВ ОБЪЕКТА
// ═══════════════════════════════════════════════════════════════

function showProperties(obj) {
    const noSel = document.getElementById('noSelection'), form = document.getElementById('propertiesForm');
    const multiInfo = document.getElementById('multiSelectInfo');
    const dimProps = document.getElementById('dimensionProps');
    const dimEditProps = document.getElementById('dimensionEditProps');
    const edgeProps = document.getElementById('edgeProps');
    const textProps = document.getElementById('textProps');

    // Если выбрана размерная линия (не авто-размер)
    if (selectedDimension !== null && dimensionLines[selectedDimension].type === 'custom') {
        const dim = dimensionLines[selectedDimension];
        dimEditProps.style.display = 'flex';
        document.getElementById('dimensionEditValue').value = dim.value;
        dimProps.style.display = 'none';
        edgeProps.style.display = 'none';
        textProps.style.display = 'none';
        noSel.style.display = 'none';
        form.style.display = 'none';
        multiInfo.style.display = 'none';
        return;
    }

    dimEditProps.style.display = 'none';

    // Если выбрана грань
    if (selectedEdge) {
        edgeProps.style.display = 'flex';
        document.getElementById('edgeLength').value = Math.round(selectedEdge.edge.length);
        dimProps.style.display = 'none';
        textProps.style.display = 'none';
        noSel.style.display = 'none';
        form.style.display = 'none';
        multiInfo.style.display = 'none';
        return;
    }

    edgeProps.style.display = 'none';

    // Если выбран текст
    if (selectedObjects.length === 1 && selectedObjects[0].type === 'text') {
        const txt = selectedObjects[0];
        noSel.style.display = 'none';
        form.style.display = 'block';
        document.getElementById('objType').value = 'Текст';
        document.getElementById('lineProps').style.display = 'none';
        document.getElementById('circleProps').style.display = 'none';
        document.getElementById('rectProps').style.display = 'none';
        document.getElementById('polygonProps').style.display = 'none';
        document.getElementById('dimensionProps').style.display = 'none';
        document.getElementById('dimensionEditProps').style.display = 'none';
        document.getElementById('edgeProps').style.display = 'none';
        document.getElementById('textProps').style.display = 'flex';
        document.getElementById('textContent').value = txt.text;
        document.getElementById('textFontSize').value = txt.fontSize;
        multiInfo.style.display = 'none';
        return;
    }

    textProps.style.display = 'none';

    // Если выбран размер (авто-размер)
    if (selectedDimension !== null) {
        const dim = dimensionLines[selectedDimension];
        dimProps.style.display = 'flex';
        document.getElementById('dimensionValue').value = dim.value;
        noSel.style.display = 'none';
        form.style.display = 'none';
        multiInfo.style.display = 'none';
        return;
    }

    dimProps.style.display = 'none';

    if (selectedObjects.length > 1) {
        multiInfo.style.display = 'block';
        document.getElementById('multiCount').textContent = selectedObjects.length;
        noSel.style.display = 'none'; form.style.display = 'none'; return;
    }
    multiInfo.style.display = 'none';
    if (!obj) { noSel.style.display = 'block'; form.style.display = 'none'; return; }
    noSel.style.display = 'none'; form.style.display = 'block';
    document.getElementById('objType').value = getTypeName(obj.type);
    document.getElementById('lineProps').style.display = 'none';
    document.getElementById('circleProps').style.display = 'none';
    document.getElementById('rectProps').style.display = 'none';
    document.getElementById('polygonProps').style.display = 'none';
    document.getElementById('lineAlignProps').style.display = 'none';

    if (obj.type === 'line') {
        document.getElementById('lineProps').style.display = 'flex';
        document.getElementById('lineLength').value = Math.round(obj.length);
        // Показываем блок выравнивания для линий
        document.getElementById('lineAlignProps').style.display = 'block';
    } else if (obj.type === 'circle') {
        document.getElementById('circleProps').style.display = 'flex';
        document.getElementById('circleD').value = Math.round(obj.radius * 2);
    } else if (obj.type === 'rect') {
        document.getElementById('rectProps').style.display = 'flex';
        document.getElementById('rectW').value = Math.round(obj.absWidth);
        document.getElementById('rectH').value = Math.round(obj.absHeight);
    } else if (obj.type === 'polygon') {
        document.getElementById('polygonProps').style.display = 'flex';
        document.getElementById('polygonSides').value = obj.sides;
        document.getElementById('polygonRadius').value = Math.round(obj.radius);
    }
}

function getTypeName(type) {
    return { line: 'Линия', circle: 'Круг', rect: 'Прямоугольник', polygon: 'Многоугольник' }[type] || type;
}

// ═══════════════════════════════════════════════════════════════
// ОБНОВЛЕНИЕ СПИСКА ОБЪЕКТОВ
// ═══════════════════════════════════════════════════════════════

function updateObjectsList() {
    const list = document.getElementById('objectsList'); list.innerHTML = '';
    objects.forEach((obj, index) => {
        const item = document.createElement('div');
        item.className = 'object-item';
        if (selectedObjects.includes(obj)) item.classList.add('selected');

        // Добавляем размер к названию объекта
        let sizeText = '';
        if (obj.type === 'line') {
            sizeText = `L ${Math.round(obj.length)} мм`;
        } else if (obj.type === 'circle') {
            sizeText = `D ${Math.round(obj.radius * 2)} мм`;
        } else if (obj.type === 'rect') {
            sizeText = `${Math.round(obj.absWidth)} × ${Math.round(obj.absHeight)} мм`;
        } else if (obj.type === 'polygon') {
            sizeText = `${obj.sides} уг. D ${Math.round(obj.radius * 2)} мм`;
        }

        item.innerHTML = `<span>${getTypeName(obj.type)} #${index + 1} <small style="color:#aaa; margin-left:5px">(${sizeText})</small></span><button class="delete-obj">×</button>`;
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-obj')) return;
            if (isCtrlPressed) { const idx = selectedObjects.indexOf(obj); if (idx >= 0) selectedObjects.splice(idx, 1); else selectedObjects.push(obj); }
            else selectedObjects = [obj];
            currentTool = 'select';
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('[data-tool="select"]').classList.add('active');
            document.getElementById('currentTool').textContent = 'Инструмент: Выбрать';
            showProperties(selectedObjects.length === 1 ? selectedObjects[0] : null); render();
        });
        item.querySelector('.delete-obj').addEventListener('click', (e) => {
            e.stopPropagation(); saveState();
            objects = objects.filter(o => o !== obj);
            if (selectedObjects.includes(obj)) { selectedObjects = selectedObjects.filter(o => o !== obj); showProperties(selectedObjects.length === 1 ? selectedObjects[0] : null); }
            render();
        });
        list.appendChild(item);
    });
}

// ═══════════════════════════════════════════════════════════════
// ОБНОВЛЕНИЕ СТАТУС-БАРА
// ═══════════════════════════════════════════════════════════════

function updateStatusBar() {
    document.getElementById('objectCount').textContent = `Объектов: ${objects.length}`;
    document.getElementById('selectedCount').textContent = `Выбрано: ${selectedObjects.length}`;
    document.getElementById('undoStack').textContent = `История: ${undoStack.length}`;

    // Обновляем индикатор выделенных деталей на листе
    const nestedSelectInfo = document.getElementById('nestedSelectInfo');
    const nestedSelectedCount = document.getElementById('nestedSelectedCount');
    if (showSheetView && selectedNestedParts.length > 0) {
        nestedSelectInfo.style.display = 'flex';
        nestedSelectedCount.textContent = `Выделено деталей: ${selectedNestedParts.length}`;
    } else {
        nestedSelectInfo.style.display = 'none';
    }
}

// ═══════════════════════════════════════════════════════════════
// ОБНОВЛЕНИЕ СПИСКА ДЕТАЛЕЙ
// ═══════════════════════════════════════════════════════════════

window.updatePartsList = function updatePartsList() {
    const list = document.getElementById('partsList');
    if (parts.length === 0) {
        list.innerHTML = '<div style="color:#666;padding:15px;text-align:center;font-size:12px;">📭 Нет деталей<br><small style="color:#555">Выделите объекты<br>и кликните ПКМ → "Создать деталь"</small></div>';
        return;
    }

    // Находим ID размещённых деталей на листе
    const placedPartIds = new Set(nestedParts.map(n => n.partId));

    list.innerHTML = parts.map((part, idx) => {
        // Проверяем, есть ли эта деталь на листе
        const isPlaced = placedPartIds.has(part.id);
        const placedCount = nestedParts.filter(n => n.partId === part.id).length;
        const isSelected = selectedNestedParts.some(idx => nestedParts[idx] && nestedParts[idx].partId === part.id);
        const isNestingEnabled = part.nestingEnabled !== false;  // По умолчанию true
        const isVisible = part.visible === true;  // Видима ли деталь на холсте

        return `
        <div class="part-card" data-part-id="${part.id}" style="padding:8px;margin-bottom:6px;background:${isSelected ? '#1a3a52' : '#252526'};border-radius:4px;border:2px solid ${isSelected ? '#00aaff' : '#3c3c3c'};cursor:pointer;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="display:flex;align-items:center;gap:8px;flex:1;">
                    <input type="checkbox"
                        class="nesting-checkbox"
                        data-part-id="${part.id}"
                        ${isNestingEnabled ? 'checked' : ''}
                        title="Раскладывать эту деталь"
                        onclick="event.stopPropagation();"
                        style="width:16px;height:16px;cursor:pointer;">
                    <span class="part-name" data-part-id="${part.id}" style="color:#007acc;font-weight:bold;font-size:13px;cursor:pointer;" title="📝 Кликните для редактирования названия">📦 ${part.name || `Деталь #${part.id}`}</span>
                </div>
                <div style="display:flex;gap:4px;">
                    <button onclick="viewPart(${part.id}); event.stopPropagation();" style="background:${isVisible ? '#2d7d2d' : '#007acc'};color:#fff;border:none;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;" title="${isVisible ? 'Скрыть деталь' : 'Показать деталь'}">${isVisible ? '✓' : '👁️'}</button>
                    <button onclick="deletePart(${part.id}); event.stopPropagation();" style="background:#c72e2e;color:#fff;border:none;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;">×</button>
                </div>
            </div>
            <div style="color:#888;font-size:11px;margin-bottom:6px;">
                ${Math.round(part.bounds.width)} × ${Math.round(part.bounds.height)} мм • ${part.objects.length} об.
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="color:#aaa;font-size:11px;">Кол-во:</span>
                <input type="number" value="${part.quantity}" min="1" max="9999"
                    data-part-id="${part.id}"
                    style="width:70px;padding:4px 6px;background:#007acc;color:#fff;border:none;border-radius:4px;text-align:center;font-size:13px;font-weight:bold;"
                    onclick="event.stopPropagation();"
                    onwheel="event.stopPropagation();">
            </div>
            ${isPlaced ? `<div style="color:#2d7d2d;font-size:10px;">✅ Размещено на листе: ${placedCount} шт</div>` : '<div style="color:#666;font-size:10px;">⚠️ Не размещено</div>'}
        </div>
    `}).join('');

    // Обработчики чекбоксов раскладки
    list.querySelectorAll('.nesting-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            const partId = parseInt(checkbox.dataset.partId);
            const part = parts.find(p => p.id === partId);
            if (!part) return;

            // Если отметили эту деталь - снимаем с остальных (режим "только одна")
            if (checkbox.checked) {
                parts.forEach(p => {
                    if (p.id !== partId) {
                        p.nestingEnabled = false;
                    } else {
                        p.nestingEnabled = true;
                    }
                });
            } else {
                // Если сняли отметку - просто обновляем
                part.nestingEnabled = false;
            }

            updatePartsList();
        });
    });

    // Обработчик клика на карточку детали - выделение на листе
    list.querySelectorAll('.part-card').forEach(cardEl => {
        cardEl.addEventListener('click', (e) => {
            // Если кликнули по назанию - редактируем
            if (e.target.classList.contains('part-name')) {
                e.stopPropagation();
                const partId = parseInt(e.target.dataset.partId);
                const part = parts.find(p => p.id === partId);
                if (!part) return;

                const newName = prompt('✏️ Введите новое название детали:', part.name || `Деталь #${part.id}`);
                if (newName !== null && newName.trim() !== '') {
                    part.name = newName.trim();
                    updatePartsList();
                    render();
                }
                return;
            }

            // Клик по карточке - выделение всех деталей на листе
            const partId = parseInt(cardEl.dataset.partId);

            if (showSheetView) {
                // Находим все размещённые детали этого типа на листе
                selectedNestedParts = [];
                nestedParts.forEach((nested, idx) => {
                    if (nested.partId === partId) {
                        selectedNestedParts.push(idx);
                    }
                });

                if (selectedNestedParts.length > 0) {
                    render();
                    updatePartsList(); // Обновляем подсветку в списке
                    // Показываем информацию в статус-баре
                    document.getElementById('nestedSelectedCount').textContent = `Выделено деталей: ${selectedNestedParts.length}`;
                    document.getElementById('nestedSelectInfo').style.display = 'flex';
                }
            }
        });
    });

    list.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('change', (e) => {
            const partId = parseInt(e.target.dataset.partId);
            const part = parts.find(p => p.id === partId);
            if (part) {
                part.quantity = parseInt(e.target.value) || 1;
            }
        });
        input.addEventListener('click', (e) => e.target.select());
        input.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -1 : 1;
            const newValue = parseInt(e.target.value) + delta;
            if (newValue >= 1 && newValue <= 9999) {
                e.target.value = newValue;
                e.target.dispatchEvent(new Event('change'));
            }
        });
    });
}

// Удаление детали (глобальная функция)
window.deletePart = function(partId) {
    const part = parts.find(p => p.id === partId);
    if (part) {
        // Если деталь видима, удаляем её объекты с холста
        if (part.visible) {
            objects = objects.filter(obj => !part.objects.includes(obj));
            selectedObjects = selectedObjects.filter(obj => !part.objects.includes(obj));
        }
    }
    parts = parts.filter(p => p.id !== partId);
    updatePartsList();
    render();
};
