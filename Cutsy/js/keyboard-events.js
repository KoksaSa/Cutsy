// ═══════════════════════════════════════════════════════════════
// ОБРАБОТЧИК КЛАВИАТУРЫ (глобальный)
// ═══════════════════════════════════════════════════════════════

document.addEventListener('keydown', (e) => {
    if (e.key === 'Control' || e.key === 'Ctrl') isCtrlPressed = true;
    if (e.key === 'Shift') {
        isShiftPressed = true;
        window.isShiftPressed = true;  // Обновляем глобально
        
        // ═══════════════════════════════════════════════════════════
        // ОРТОГОНАЛЬНОСТЬ ПРИ ЗАЖАТОМ SHIFT (только для инструмента "Линия")
        // ═══════════════════════════════════════════════════════════
        if (currentTool === 'line') {
            orthoEnabled = true;
        }
    }
    
    // Ctrl+S / Ctrl+Ы - сохранение (английская/русская раскладка)
    if ((e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'ы') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (typeof manualSave === 'function') {
            manualSave();
        }
        return;
    }
    
    // Ctrl+Z / Ctrl+Я - отмена (английская/русская раскладка)
    if ((e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'я') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
    }
    // Ctrl+Y / Ctrl+Н - повтор (английская/русская раскладка)
    if ((e.key.toLowerCase() === 'y' || e.key.toLowerCase() === 'н') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        redo();
    }
    // Delete / Del - удалить угловой размер (ПРИОРИТЕТ)
    if (e.key === 'Delete' && typeof selectedAngleDimension !== 'undefined' && selectedAngleDimension !== null) {
        e.preventDefault();
        deleteSelectedAngleDimension();
    }
    // Delete / Del - удалить обычный размер
    if (e.key === 'Delete' && selectedDimension !== null) {
        deleteSelectedDimension();
    }
    // Delete / Del - удалить выделенные объекты (на холсте или на листе)
    if (e.key === 'Delete' || e.key === 'Del') {
        // Если выделены объекты на холсте - удаляем их
        if (selectedObjects && selectedObjects.length > 0) {
            e.preventDefault();
            saveState();

            // Удаляем объекты из холста
            objects = objects.filter(o => !selectedObjects.includes(o));

            // Удаляем объекты из всех деталей (part.objects) и обновляем границы
            parts.forEach(part => {
                if (part.objects) {
                    const hadChanges = part.objects.some(obj => selectedObjects.includes(obj));
                    part.objects = part.objects.filter(obj => !selectedObjects.includes(obj));

                    // Если удалили объекты из детали, обновляем её границы
                    if (hadChanges && part.objects.length > 0) {
                        updatePartBounds(part);
                    }
                }
            });

            selectedObjects = [];
            showProperties(null);
            render();
            return;
        }
        
        // Если выделены детали на листе - удаляем их
        if (showSheetView && selectedNestedParts && selectedNestedParts.length > 0) {
            e.preventDefault();
            // Сортируем индексы по убыванию чтобы удалять с конца
            const indices = selectedNestedParts.sort((a, b) => b - a);
            indices.forEach(idx => {
                nestedParts.splice(idx, 1);
            });
            selectedNestedParts = [];
            // Скрываем кнопки отражения детали
            document.getElementById('nestedPartTools').style.display = 'none';
            render();
            return;
        }
    }
    // Delete / Del - удалить выделенный прямоугольник разметки
    if ((e.key === 'Delete' || e.key === 'Del') && showSheetView && selectedRectIndex >= 0) {
        e.preventDefault();
        markupRects.splice(selectedRectIndex, 1);
        selectedRectIndex = -1;
        render();
    }
    // ESC - сброс выбора на листе
    if (e.key === 'Escape') {
        // Если рисуем размеры — завершаем режим
        if (currentTool === 'dimension' && isDrawing && dimensionStartPoint) {
            isDrawing = false;
            dimensionStartPoint = null;
            dimensionLabel.style.display = 'none';
            console.log('📏 [Esc] Завершение рисования размеров');
            render();
            return;
        }
        
        if (showSheetView) {
            selectedNestedParts = [];
            // Скрываем кнопки отражения детали
            document.getElementById('nestedPartTools').style.display = 'none';
            // Сброс режима разметки
            if (isDrawingRect) {
                isDrawingRect = false;
                currentRect = null;
                selectedRectIndex = -1;
                const btn = document.getElementById('toggleMarkupRect');
                btn.style.background = '#5a4a2d';
                btn.textContent = '⬜ Разметка остатка';
            }
            render();
        } else {
            selectedObjects = [];
            selectedDimension = null;
            selectedEdge = null;
            isSelecting = false;
            isDragging = false;
            hasDragged = false;
            currentTool = 'select';
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('[data-tool="select"]').classList.add('active');
            document.getElementById('currentTool').textContent = 'Инструмент: Выбрать';
            showProperties(null);
            render();
        }
    }
    // Ctrl+C / Ctrl+С - копировать выделенные детали с листа (английская/русская раскладка)
    if ((e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'с') && (e.ctrlKey || e.metaKey) && showSheetView && selectedNestedParts.length > 0) {
        e.preventDefault();
        clipboardNested = selectedNestedParts.map(idx => ({ ...nestedParts[idx] }));
    }
    // Ctrl+V / Ctrl+М - вставить детали на лист (английская/русская раскладка)
    if ((e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'м') && (e.ctrlKey || e.metaKey) && showSheetView && clipboardNested) {
        e.preventDefault();
        const newSelectedIndices = [];  // Индексы новых вставленных деталей

        if (Array.isArray(clipboardNested)) {
            // Вставляем массив деталей с одинаковым смещением (сохраняем форму группы)
            const baseOffset = 50;  // Базовое смещение для всей группы

            clipboardNested.forEach((nested) => {
                const newNested = {
                    ...nested,
                    x: nested.x + baseOffset,
                    y: nested.y + baseOffset
                };
                nestedParts.push(newNested);
                newSelectedIndices.push(nestedParts.length - 1);  // Запоминаем индекс новой детали
            });
        } else {
            // Вставляем одну деталь (старый формат)
            const newNested = {
                ...clipboardNested,
                x: clipboardNested.x + 50,
                y: clipboardNested.y + 50
            };
            nestedParts.push(newNested);
            newSelectedIndices.push(nestedParts.length - 1);  // Запоминаем индекс новой детали
            clipboardNested.x += 50;
            clipboardNested.y += 50;
        }

        // Переключаем выделение на новые детали
        selectedNestedParts = newSelectedIndices;

        render();
    }
    // Ctrl+X / Ctrl+Ч - вырезать объекты (английская/русская раскладка)
    if ((e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 'ч') && (e.ctrlKey || e.metaKey) && selectedObjects.length > 0 && !showSheetView) {
        e.preventDefault();
        clipboard = selectedObjects.map(obj => ({
            type: obj.type,
            x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2,
            cx: obj.cx, cy: obj.cy, radius: obj.radius,
            x: obj.x, y: obj.y, width: obj.width, height: obj.height,
            sides: obj.sides,
            text: obj.text, fontSize: obj.fontSize
        }));
        // Удаляем выделенные объекты
        selectedObjects.forEach(obj => {
            const idx = objects.indexOf(obj);
            if (idx >= 0) objects.splice(idx, 1);
        });
        selectedObjects = [];
        saveState();
        render();
    }
    // Ctrl+C / Ctrl+С - копировать объекты (английская/русская раскладка)
    if ((e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'с') && (e.ctrlKey || e.metaKey) && selectedObjects.length > 0 && !showSheetView) {
        e.preventDefault();
        clipboard = selectedObjects.map(obj => ({
            type: obj.type,
            x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2,
            cx: obj.cx, cy: obj.cy, radius: obj.radius,
            x: obj.x, y: obj.y, width: obj.width, height: obj.height,
            sides: obj.sides,
            text: obj.text, fontSize: obj.fontSize
        }));
    }
    // Ctrl+V / Ctrl+М - вставить объекты (английская/русская раскладка)
    if ((e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'м') && (e.ctrlKey || e.metaKey) && clipboard.length > 0 && !showSheetView) {
        e.preventDefault();
        saveState();

        const newObjects = [];

        // Вставляем объекты со смещением
        clipboard.forEach(obj => {
            let newObj;
            if (obj.type === 'line') {
                newObj = new Line(obj.x1 + pasteOffset.x, obj.y1 + pasteOffset.y, obj.x2 + pasteOffset.x, obj.y2 + pasteOffset.y);
            } else if (obj.type === 'circle') {
                newObj = new Circle(obj.cx + pasteOffset.x, obj.cy + pasteOffset.y, obj.radius);
            } else if (obj.type === 'rect') {
                newObj = new Rect(obj.x + pasteOffset.x, obj.y + pasteOffset.y, obj.width, obj.height);
            } else if (obj.type === 'polygon') {
                newObj = new Polygon(obj.cx + pasteOffset.x, obj.cy + pasteOffset.y, obj.radius, obj.sides);
            } else if (obj.type === 'text') {
                newObj = new Text(obj.x + pasteOffset.x, obj.y + pasteOffset.y, obj.text, obj.fontSize);
            }
            if (newObj) {
                objects.push(newObj);
                newObjects.push(newObj);
            }
        });

        // Выделяем все вставленные объекты
        if (newObjects.length > 0) {
            selectedObjects = newObjects;
        }

        // Увеличиваем смещение для следующей вставки
        pasteOffset.x += 20;
        pasteOffset.y += 20;

        render();
    }
    
    // ═══════════════════════════════════════════════════════════════
    // СТРЕЛКИ - перемещение выделенных деталей на листе
    // ═══════════════════════════════════════════════════════════════
    if (showSheetView && selectedNestedParts && selectedNestedParts.length > 0) {
        const step = 5;  // Шаг перемещения 5мм
        let dx = 0, dy = 0;

        switch(e.key) {
            case 'ArrowUp': dy = -step; break;
            case 'ArrowDown': dy = step; break;
            case 'ArrowLeft': dx = -step; break;
            case 'ArrowRight': dx = step; break;
            default: return;  // Не стрелка
        }

        e.preventDefault();

        // Проверяем, можно ли перемещать (если наложение выключено)
        const allowOverlapFlag = window.allowOverlap || false;

        // Проверяем пересечения перед перемещением (если наложение выключено)
        let canMove = true;
        if (!allowOverlapFlag) {
            // Создаем Set выделенных индексов для быстрой проверки
            const selectedSet = new Set(selectedNestedParts);

            // Пробуем переместить каждую деталь и проверяем пересечения
            for (const index of selectedNestedParts) {
                const nested = nestedParts[index];
                if (!nested) continue;

                // Проверяем пересечения с другими деталями после перемещения
                for (let i = 0; i < nestedParts.length; i++) {
                    // Пропускаем выделенные детали (они двигаются вместе)
                    if (selectedSet.has(i)) continue;

                    const other = nestedParts[i];

                    // Проверка пересечения прямоугольников (bounding box)
                    if (nested.x + dx < other.x + other.width &&
                        nested.x + dx + nested.width > other.x &&
                        nested.y + dy < other.y + other.height &&
                        nested.y + dy + nested.height > other.y) {
                        canMove = false;
                        break;
                    }
                }

                if (!canMove) break;
            }
        }

        // Перемещаем только если нет пересечений или наложение разрешено
        if (canMove || allowOverlapFlag) {
            selectedNestedParts.forEach(index => {
                const nested = nestedParts[index];
                if (nested) {
                    nested.x += dx;
                    nested.y += dy;

                    // Проверка границ листа (не даём уйти за край)
                    if (nested.x < 0) nested.x = 0;
                    if (nested.y < 0) nested.y = 0;
                    if (nested.x + nested.width > sheetSize.width) nested.x = sheetSize.width - nested.width;
                    if (nested.y + nested.height > sheetSize.height) nested.y = sheetSize.height - nested.height;
                }
            });

            render();
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'Control' || e.key === 'Ctrl') isCtrlPressed = false;
    if (e.key === 'Shift') {
        isShiftPressed = false;
        window.isShiftPressed = false;  // Обновляем глобально
        
        // ═══════════════════════════════════════════════════════════
        // ВОЗВРАТ ОРТОГОНАЛЬНОСТИ ПОСЛЕ ОТПУСКАНИЯ SHIFT
        // ═══════════════════════════════════════════════════════════
        // При отпускании Shift ортогональность выключается
        if (currentTool === 'line') {
            orthoEnabled = false;
        }
    }
    
    // Сохранение состояния после перемещения стрелками (для Ctrl+Z)
    if (showSheetView && selectedNestedParts && selectedNestedParts.length > 0) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            saveState();
        }
    }
});
