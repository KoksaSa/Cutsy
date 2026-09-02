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
        document.getElementById('edgeLength').value = parseFloat(selectedEdge.edge.length.toFixed(2));
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
        document.getElementById('lineLength').value = (obj.length || 0).toFixed(2);
        // Показываем блок выравнивания для линий
        document.getElementById('lineAlignProps').style.display = 'block';
    } else if (obj.type === 'circle') {
        document.getElementById('circleProps').style.display = 'flex';
        document.getElementById('circleD').value = ((obj.radius || 0) * 2).toFixed(2);
    } else if (obj.type === 'rect') {
        document.getElementById('rectProps').style.display = 'flex';
        document.getElementById('rectW').value = (obj.absWidth || 0).toFixed(2);
        document.getElementById('rectH').value = (obj.absHeight || 0).toFixed(2);
    } else if (obj.type === 'polygon') {
        document.getElementById('polygonProps').style.display = 'flex';
        document.getElementById('polygonSides').value = obj.sides;
        document.getElementById('polygonRadius').value = (obj.radius || 0).toFixed(2);
    }
}

function getTypeName(type) {
    return { line: 'Линия', circle: 'Круг', rect: 'Прямоугольник', polygon: 'Многоугольник' }[type] || type;
}

// ═══════════════════════════════════════════════════════════════
// ПАЛИТРА ЦВЕТОВ И ЦВЕТОВОЙ ВЫБОР
// ═══════════════════════════════════════════════════════════════

// Единый массив цветов для объекта и выпадающего списка
const COLOR_PALETTE = [
    { value: '#00aadd', name: 'Голубой' },
    { value: '#000000', name: 'Чёрный' },
    { value: '#4DFF4D', name: 'Зелёный' },
    { value: '#FFA6D3', name: 'Розовый' },
    { value: '#FFFF79', name: 'Жёлтый' },
    { value: '#FFA6A6', name: 'Красный' },
    { value: '#A64DFF', name: 'Фиолетовый' },
    { value: '#4DA6A6', name: 'Бирюзовый' },
    { value: '#FFA679', name: 'Оранжевый' },
    { value: '#4DA64D', name: 'Тёмно-зелёный' },
    { value: '#FF4DA6', name: 'Малиновый' },
    { value: '#4DA6FF', name: 'Синий' },
    { value: '#4DFFA6', name: 'Салатовый' },
    { value: '#FF4DFF', name: 'Пурпурный' },
    { value: '#4D4DFF', name: 'Тёмно-синий' },
    { value: '#A6A6FF', name: 'Лавандовый' },
];

// Контрастный цвет текста по фону
function contrastTextColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum > 150 ? '#000' : '#fff';
}

// Закрыть все открытые выпадающие палитры
function closeAllColorDropdowns() {
    document.querySelectorAll('.color-dropdown.open').forEach(dd => dd.remove());
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
            sizeText = `L ${(obj.length || 0).toFixed(2)} мм`;
        } else if (obj.type === 'circle') {
            sizeText = `D ${((obj.radius || 0) * 2).toFixed(2)} мм`;
        } else if (obj.type === 'rect') {
            sizeText = `${(obj.absWidth || 0).toFixed(2)} × ${(obj.absHeight || 0).toFixed(2)} мм`;
        } else if (obj.type === 'polygon') {
            sizeText = `${obj.sides} уг. D ${((obj.radius || 0) * 2).toFixed(2)} мм`;
        }

        // Текущий цвет объекта
        const color = obj.color || '#00aadd';
        const textColor = contrastTextColor(color);
        const colorName = (COLOR_PALETTE.find(c => c.value.toLowerCase() === color.toLowerCase()) || {}).name || 'Другой';

        item.innerHTML = `
            <span>${getTypeName(obj.type)} #${index + 1} <small style="color:#aaa; margin-left:5px">(${sizeText})</small></span>
            <div style="display:flex;align-items:center;gap:4px;">
                <button class="color-picker-btn" data-obj-index="${index}" style="display:flex;align-items:center;justify-content:center;padding:2px;width:24px;height:20px;background:${color};border:1px solid #555;border-radius:3px;cursor:pointer;" title="${colorName}">
                    <span style="width:12px;height:12px;border-radius:2px;background:${color};border:1px solid rgba(255,255,255,0.3);"></span>
                </button>
                <button class="delete-obj">×</button>
            </div>
        `;
        
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-obj')) return;
            if (e.target.closest('.color-picker-btn')) return;
            if (isCtrlPressed) { const idx = selectedObjects.indexOf(obj); if (idx >= 0) selectedObjects.splice(idx, 1); else selectedObjects.push(obj); }
            else selectedObjects.length = 0; selectedObjects.push(obj);
            currentTool = 'select';
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('[data-tool="select"]').classList.add('active');
            document.getElementById('currentTool').textContent = 'Инструмент: Выбрать';
            if (typeof lineDimensionInput !== 'undefined' && lineDimensionInput) {
                lineDimensionInput.style.display = 'none';
                lineDimensionInput.value = '';
            }
            if (typeof shapeInputStage !== 'undefined') shapeInputStage = 0;
            if (typeof isDrawing !== 'undefined') { isDrawing = false; currentShape = null; }
            showProperties(selectedObjects.length === 1 ? selectedObjects[0] : null); render();
        });
        
        // Обработчик клика по кнопке цвета — открыть палитру
        item.querySelector('.color-picker-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllColorDropdowns();

            const btn = e.currentTarget;
            const rect = btn.getBoundingClientRect();

            // Создаём выпадающую палитру (только цветные квадраты)
            const dropdown = document.createElement('div');
            dropdown.className = 'color-dropdown open';
            // Вычисляем позицию: если не влезает вниз — открываем вверх
            const dropdownHeight = COLOR_PALETTE.length * 24 + 12; // примерная высота
            const spaceBelow = window.innerHeight - rect.bottom - 4;
            const spaceAbove = rect.top - 4;
            let dropdownTop;
            if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
                dropdownTop = rect.bottom + 2;
            } else {
                dropdownTop = Math.max(4, rect.top - dropdownHeight - 2);
            }

            dropdown.style.cssText = `
                position:fixed;
                left:${rect.left}px;
                top:${dropdownTop}px;
                z-index:10000;
                background:#2a2a2a;
                border:1px solid #555;
                border-radius:6px;
                padding:4px;
                display:grid;
                grid-template-columns:1fr;
                gap:2px;
                box-shadow:0 4px 16px rgba(0,0,0,0.5);
                max-height:calc(100vh - 8px);
                overflow-y:auto;
            `;

            // Кастомный скроллбар для тёмной темы
            dropdown.classList.add('color-dropdown-scroll');

            COLOR_PALETTE.forEach(c => {
                const isSelected = c.value.toLowerCase() === color.toLowerCase();
                const swatchBtn = document.createElement('button');
                swatchBtn.title = c.name;
                swatchBtn.style.cssText = `
                    width:28px;height:20px;
                    background:${c.value};
                    border:2px solid ${isSelected ? '#00aaff' : 'transparent'};
                    border-radius:3px;cursor:pointer;
                    padding:0;
                `;
                if (isSelected) swatchBtn.style.boxShadow = '0 0 0 1px #00aaff';
                swatchBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    obj.color = c.value;
                    closeAllColorDropdowns();
                    render();
                    if (typeof saveState === 'function') saveState();
                    // Обновляем список, чтобы перекрасить свотч и кнопку
                    updateObjectsList();
                });
                dropdown.appendChild(swatchBtn);
            });

            document.body.appendChild(dropdown);

            // Закрыть при клике вне
            const closeHandler = (ev) => {
                if (!dropdown.contains(ev.target) && ev.target !== btn) {
                    dropdown.remove();
                    document.removeEventListener('click', closeHandler, true);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
        });
        
        item.querySelector('.delete-obj').addEventListener('click', (e) => {
            e.stopPropagation(); saveState();
            const _idx = objects.indexOf(obj); if (_idx >= 0) objects.splice(_idx, 1); // v4.69: in-place
            if (selectedObjects.includes(obj)) { const _si = selectedObjects.indexOf(obj); if (_si >= 0) selectedObjects.splice(_si, 1); showProperties(selectedObjects.length === 1 ? selectedObjects[0] : null); }
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
        const spacingValue = (typeof part.spacing === 'number') ? part.spacing : 3;  // Зазор по умолчанию 3 мм

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
                ${(part.bounds.width || 0).toFixed(2)} × ${(part.bounds.height || 0).toFixed(2)} мм • ${part.objects.length} об.
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="color:#aaa;font-size:11px;">Кол-во:</span>
                <input type="number" value="${part.quantity}" min="1" max="9999"
                    data-part-id="${part.id}"
                    style="width:70px;padding:4px 6px;background:#007acc;color:#fff;border:none;border-radius:4px;text-align:center;font-size:13px;font-weight:bold;"
                    onclick="event.stopPropagation();"
                    onwheel="event.stopPropagation();">
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="color:#aaa;font-size:11px;">Зазор:</span>
                <input type="number" class="part-spacing-input" data-part-id="${part.id}" 
                    value="${spacingValue}" min="-10" max="500" step="0.1"
                    style="width:60px;padding:4px 6px;background:#2a2a2a;color:#007acc;border:1px solid #555;border-radius:4px;text-align:center;font-size:13px;font-weight:bold;"
                    title="Отступ между деталями при раскладке (мм). Отрицательное = перекрытие"
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

    // Обработчики для поля зазора (PartSpacing)
    list.querySelectorAll('.part-spacing-input').forEach(input => {
        input.addEventListener('change', (e) => {
            e.stopPropagation();
            const partId = parseInt(e.target.dataset.partId);
            const part = parts.find(p => p.id === partId);
            if (!part) return;
            
            const spacing = parseFloat(e.target.value);
            
            if (isNaN(spacing) || spacing < -10 || spacing > 500) {
                const defaultValue = (typeof part.spacing === 'number') ? part.spacing : 3;
                e.target.value = defaultValue;
                return;
            }
            
            part.spacing = spacing;
            if (typeof saveToCache === 'function') saveToCache();
        });
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            e.target.select();
        });
        input.addEventListener('wheel', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newValue = parseFloat(e.target.value) + delta;
            if (newValue >= -10 && newValue <= 500) {
                e.target.value = Number(newValue.toFixed(1));
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
            const _rem = objects.filter(obj => !part.objects.includes(obj)); objects.length = 0; objects.push(..._rem);
            selectedObjects.length = 0; selectedObjects.push(...selectedObjects.filter(obj => !part.objects.includes(obj)));
        }
    }
    const _pi = parts.findIndex(p => p.id === partId); if (_pi >= 0) parts.splice(_pi, 1); // v4.69: in-place
    updatePartsList();
    render();
};