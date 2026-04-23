// ═══════════════════════════════════════════════════════════════
// ОБРАБОТЧИК МЫШИ
// ═══════════════════════════════════════════════════════════════

// Зум колесиком мыши
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;

    // Проверяем, находится ли курсор над листом раскладки
    if (showSheetView && window.allSheets && window.allSheets.length > 0) {
        const sheetMargin = 50;
        const baseSheetW = Math.min(sheetSize.width / 3, 400);
        const baseSheetH = baseSheetW * sheetSize.height / sheetSize.width;
        const sheetW = baseSheetW * sheetZoom;
        const sheetH = baseSheetH * sheetZoom;
        const sheetX = canvas.width - sheetW - sheetMargin + sheetPanX;
        const sheetY = sheetMargin + sheetPanY;

        // Глобальные координаты мыши для render.js
        window.mouseX = e.clientX - rect.left;
        window.mouseY = e.clientY - rect.top;

        if (mouseX >= sheetX && mouseX <= sheetX + sheetW &&
            mouseY >= sheetY && mouseY <= sheetY + sheetH) {
            // ═══════════════════════════════════════════════════
            // Зум листа относительно позиции курсора
            // ═══════════════════════════════════════════════════
            const oldZoom = sheetZoom;
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newZoom = Math.max(0.5, Math.min(5, oldZoom + delta));

            // Текущее положение мыши относительно левого верхнего угла листа
            const offsetX = mouseX - sheetX;
            const offsetY = mouseY - sheetY;
            const ratioX = offsetX / sheetW;
            const ratioY = offsetY / sheetH;

            // Новые размеры листа
            const baseSheetW = Math.min(sheetSize.width / 3, 400);
            const baseSheetH = baseSheetW * sheetSize.height / sheetSize.width;
            const newSheetW = baseSheetW * newZoom;
            const newSheetH = baseSheetH * newZoom;

            // Вычисляем новую позицию левого верхнего угла, чтобы точка под курсором осталась на месте
            const newSheetX = mouseX - ratioX * newSheetW;
            const newSheetY = mouseY - ratioY * newSheetH;

            // Пересчитываем смещение (pan) относительно целевой позиции без зума
            sheetPanX = newSheetX - (canvas.width - newSheetW - sheetMargin);
            sheetPanY = newSheetY - sheetMargin;

            // Применяем зум
            sheetZoom = newZoom;
            
            render();
            return;
        }
    }

    // Обычный зум холста
    zoom = Math.max(0.1, Math.min(30, zoom + delta));
    render();
});

// Панорамирование листа колесиком мыши (зажатым)
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 && showSheetView && window.allSheets && window.allSheets.length > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        isSheetPanning = true;
        sheetPanStart = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'move';
    }
});

// Используем window, чтобы перетаскивание работало даже если курсор вышел за пределы холста
window.addEventListener('mousemove', (e) => {
    if (isSheetPanning) {
        const dx = e.clientX - sheetPanStart.x;
        const dy = e.clientY - sheetPanStart.y;
        
        // Просто добавляем смещение (без ограничений)
        sheetPanX += dx;
        sheetPanY += dy;
        
        sheetPanStart = { x: e.clientX, y: e.clientY };
        render();
    }
    
    // ═══════════════════════════════════════════════════════════
    // ОТРИСОВКА ПУНКТИРНОЙ ЛИНИИ ДЛЯ ДИАГОНАЛЬНОГО ПАТТЕРНА
    // ═══════════════════════════════════════════════════════════
    if (window.diagonalPatternDragging && window.diagonalLayoutEnabled && window.diagonalPatternStartPoint && showSheetView) {
        const rect = canvas.getBoundingClientRect();
        const sheetMargin = 50;
        const baseSheetW = Math.min(sheetSize.width / 3, 400);
        const baseSheetH = baseSheetW * sheetSize.height / sheetSize.width;
        const sheetW = baseSheetW * sheetZoom;
        const sheetH = baseSheetH * sheetZoom;
        const sheetX = canvas.width - sheetW - sheetMargin + sheetPanX;
        const sheetY = sheetMargin + sheetPanY;

        const scaleX = sheetW / sheetSize.width;
        const scaleY = sheetH / sheetSize.height;

        // Координаты мыши на листе
        const mouseSheetX = (e.clientX - rect.left - sheetX) / scaleX;
        const mouseSheetY = (e.clientY - rect.top - sheetY) / scaleY;
        
        // Обновляем конечную точку
        window.diagonalPatternEndPoint = { x: mouseSheetX, y: mouseSheetY };
        
        render();
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 1 && isSheetPanning) {
        isSheetPanning = false;
        canvas.style.cursor = '';
    }
    // Сохраняем линию обрезки в текущий лист при отпускании
    if (window.isDraggingCutLine) {
        const currentSheet = window.allSheets && window.allSheets.length > 0
            ? window.allSheets[window.currentSheetIndex || 0] : null;
        if (currentSheet) {
            currentSheet.cutRemnantLine = window.cutRemnantLine ? {...window.cutRemnantLine} : null;
            currentSheet.showCutRemnantLine = window.showCutRemnantLine;
        }
    }
    
    // ═══════════════════════════════════════════════════════════
    // ЗАВЕРШЕНИЕ ДИАГОНАЛЬНОГО ПАТТЕРНА
    // ═══════════════════════════════════════════════════════════
    if (window.diagonalPatternDragging && window.diagonalLayoutEnabled && window.diagonalPatternStartPoint && window.diagonalPatternEndPoint) {
        window.diagonalPatternDragging = false;
        
        // Проверяем, что линия имеет достаточную длину
        const lineLength = Math.sqrt(
            Math.pow(window.diagonalPatternEndPoint.x - window.diagonalPatternStartPoint.x, 2) +
            Math.pow(window.diagonalPatternEndPoint.y - window.diagonalPatternStartPoint.y, 2)
        );
        
        if (lineLength < 10) {
            console.log('⚠️ Линия слишком короткая, паттерн отменён');
            // Очищаем данные
            window.diagonalPatternSource = null;
            window.diagonalPatternStartPoint = null;
            window.diagonalPatternEndPoint = null;
            render();
            return;
        }
        
        // Показываем диалог для ввода количества
        const countStr = prompt('Введите количество деталей (включая исходную и конечную):', '5');
        
        if (countStr && !isNaN(countStr)) {
            const count = parseInt(countStr);
            if (count >= 1) {
                createDiagonalPattern(count, window.diagonalPatternSource, window.diagonalPatternStartPoint, window.diagonalPatternEndPoint);
            } else {
                console.log('⚠️ Количество должно быть >= 1');
            }
        }
        
        // Очищаем временные данные
        window.diagonalPatternSource = null;
        window.diagonalPatternStartPoint = null;
        window.diagonalPatternEndPoint = null;
        
        // Выключаем кнопку
        window.diagonalLayoutEnabled = false;
        const btn = document.getElementById('diagonalLayoutBtn');
        if (btn) {
            btn.classList.remove('active');
            btn.textContent = '📐 Диагональная раскладка: ВЫКЛ';
        }
        
        render();
    }
});

// Обработчик mousedown
canvas.addEventListener('mousedown', (e) => {
    // Если перетаскиваем линию обрезки — не обрабатываем остальные клики
    if (window.isDraggingCutLine) return;

    // Если средняя кнопка мыши — не обрабатываем (панорамирование листа обрабатывается отдельно)
    if (e.button === 1) return;

    const rect = canvas.getBoundingClientRect();
    // Преобразуем координаты мыши с учётом зума и панорамирования
    let x = (e.clientX - rect.left - canvas.width / 2 - panX) / zoom;
    let y = (e.clientY - rect.top - canvas.height / 2 - panY) / zoom;

    // Флаг: кликнули ли по листу
    let clickedOnSheet = false;

    // === Клик по листу с раскладкой (выбор детали) ===
    if (showSheetView && e.button === 0) {
        const sheetMargin = 50;
        const baseSheetW = Math.min(sheetSize.width / 3, 400);
        const baseSheetH = baseSheetW * sheetSize.height / sheetSize.width;
        const sheetW = baseSheetW * sheetZoom;
        const sheetH = baseSheetH * sheetZoom;
        const sheetX = canvas.width - sheetW - sheetMargin + sheetPanX;
        const sheetY = sheetMargin + sheetPanY;

        const scaleX = sheetW / sheetSize.width;
        const scaleY = sheetH / sheetSize.height;

        // Проверяем, кликнули ли по листу
        if (e.clientX - rect.left >= sheetX && e.clientX - rect.left <= sheetX + sheetW &&
            e.clientY - rect.top >= sheetY && e.clientY - rect.top <= sheetY + sheetH) {

            clickedOnSheet = true;

            // Преобразуем координаты клика в координаты листа
            const clickSheetX = (e.clientX - rect.left - sheetX) / scaleX;
            const clickSheetY = (e.clientY - rect.top - sheetY) / scaleY;

            // === Перетаскивание линии обрезки (приоритет №1) ===
            // Используем линию из текущего листа если есть allSheets
            const currentSheetForDrag = window.allSheets && window.allSheets.length > 0
                ? window.allSheets[window.currentSheetIndex || 0] : null;
            const dragCutLine = currentSheetForDrag ? currentSheetForDrag.cutRemnantLine : window.cutRemnantLine;
            const dragShowCutLine = currentSheetForDrag ? currentSheetForDrag.showCutRemnantLine : window.showCutRemnantLine;

            if (dragShowCutLine && dragCutLine !== null && e.button === 0) {
                const lineY = dragCutLine.y;
                const tolerance = 10 / scaleY;
                if (Math.abs(clickSheetY - lineY) < tolerance) {
                    window.isDraggingCutLine = true;
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
            }

            // === Режим рисования прямоугольника разметки ===
            if (isDrawingRect && e.button === 0) {
                // Начинаем рисовать прямоугольник
                currentRect = {
                    x: clickSheetX,
                    y: clickSheetY,
                    width: 0,
                    height: 0,
                    startX: clickSheetX,
                    startY: clickSheetY
                };
                selectedRectIndex = -1;  // Сбрасываем выделение
                return;
            }

            // Ищем деталь под курсором
            let foundIndex = -1;
            for (let i = nestedParts.length - 1; i >= 0; i--) {
                const nested = nestedParts[i];
                if (clickSheetX >= nested.x && clickSheetX <= nested.x + nested.width &&
                    clickSheetY >= nested.y && clickSheetY <= nested.y + nested.height) {
                    foundIndex = i;
                    break;
                }
            }

            if (foundIndex >= 0) {
                // Если средняя кнопка мыши — НЕ обрабатываем клик по детали
                // (это для панорамирования листа)
                if (e.button === 1) {
                    return;
                }

                const nested = nestedParts[foundIndex];
                
                // ═══════════════════════════════════════════════════════
                // ЛОГИРОВАНИЕ: номер детали на листе и DXF координаты
                // ═══════════════════════════════════════════════════════
                const partNumber = foundIndex + 1;
                const sheetHeight = sheetSize.height || 2500;
                const baseHeight = nested.baseHeight || nested.height || 100;
                const dxfY = sheetHeight - nested.y - baseHeight;
                
                console.log(`\n🎯 [КЛИК ПО ДЕТАЛИ]`);
                console.log(`   📍 Номер на листе: #${partNumber} из ${nestedParts.length}`);
                console.log(`   📋 Позиция на листе: x=${nested.x.toFixed(1)}, y=${nested.y.toFixed(1)}`);
                console.log(`   📐 Размер: ${nested.width.toFixed(1)} × ${baseHeight.toFixed(1)}`);
                console.log(`   📄 DXF координаты: x=${nested.x.toFixed(1)}, y=${dxfY.toFixed(1)}`);
                console.log(`   🔄 Поворот: rotation=${nested.rotation||0}, angle=${nested.angle ? nested.angle.toFixed(2) + '°' : '0°'}`);
                console.log(`   🔧 baseHeight: ${baseHeight.toFixed(2)}, sheetHeight: ${sheetHeight}`);
                console.log('');
                
                if (window.diagonalLayoutEnabled) {
                    console.log('📐 Режим диагональной раскладки активирован');
                    window.diagonalPatternSource = nested;
                    window.diagonalPatternDragging = true;
                    
                    // Вычисляем центр исходной детали
                    window.diagonalPatternStartPoint = {
                        x: nested.x + nested.width / 2,
                        y: nested.y + nested.height / 2
                    };
                    
                    // Инициализируем конечную точку (пока та же, что и начальная)
                    window.diagonalPatternEndPoint = { ...window.diagonalPatternStartPoint };
                    
                    console.log('   Источник:', window.diagonalPatternSource);
                    console.log('   Начальная точка:', window.diagonalPatternStartPoint);
                    
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
                
                // ОТЛАДКА: проверяем isShiftPressed
                console.log('🔍 Клик по детали:', foundIndex);
                console.log('   isShiftPressed:', isShiftPressed);
                console.log('   window.isShiftPressed:', window.isShiftPressed);
                console.log('   selectedNestedParts до:', selectedNestedParts);
                console.log('   typeof selectedNestedParts:', typeof selectedNestedParts);
                console.log('   Array.isArray(selectedNestedParts):', Array.isArray(selectedNestedParts));
                console.log('   selectedNestedParts.length:', selectedNestedParts.length);

                // ═══════════════════════════════════════════════════════════
                // ПРЕОБРАЗУЕМ координаты холста в координаты листа
                // ═══════════════════════════════════════════════════════════
                // x,y — координаты холста, нужно преобразовать в координаты листа
                const sheetMargin = 50;
                const baseSheetW = Math.min(sheetSize.width / 3, 400);
                const baseSheetH = baseSheetW * sheetSize.height / sheetSize.width;
                const sheetW = baseSheetW * sheetZoom;
                const sheetH = baseSheetH * sheetZoom;
                const sheetX = canvas.width - sheetW - sheetMargin;
                const sheetY = sheetMargin;

                const scaleX = sheetW / sheetSize.width;
                const scaleY = sheetH / sheetSize.height;

                // Координаты мыши на листе (в мм)
                const mouseSheetX = (e.clientX - rect.left - sheetX) / scaleX;
                const mouseSheetY = (e.clientY - rect.top - sheetY) / scaleY;
                
                console.log('   mouseSheetX:', mouseSheetX, 'mouseSheetY:', mouseSheetY);
                console.log('   nested.x:', nested.x, 'nested.y:', nested.y);

                // Выделение с Shift или без
                if (isShiftPressed) {
                    console.log('   → Режим Shift: добавляем (не удаляем)');
                    console.log('   foundIndex:', foundIndex);
                    console.log('   includes(foundIndex):', selectedNestedParts.includes(foundIndex));
                    
                    // Добавляем если ещё не выделена
                    const alreadySelected = selectedNestedParts.some(idx => idx === foundIndex);
                    
                    if (!alreadySelected) {
                        console.log('   → Пытаемся добавить через push...');
                        const oldLength = selectedNestedParts.length;
                        selectedNestedParts.push(foundIndex);
                        console.log('   → После push: oldLength=', oldLength, 'newLength=', selectedNestedParts.length);
                        
                        window.selectedNestedParts = selectedNestedParts;  // Обновляем глобально
                        console.log('   ✅ Добавлена деталь, выделено:', selectedNestedParts);
                    } else {
                        console.log('   ⚠️ Деталь уже выделена, пропускаем');
                    }
                } else {
                    console.log('   → Режим без Shift');
                    // Проверяем: если кликнули по УЖЕ выделенной детали — НЕ сбрасываем выделение!
                    // Это нужно для перетаскивания группы
                    if (selectedNestedParts.includes(foundIndex)) {
                        console.log('   ⚠️ Деталь уже выделена — оставляем выделение (для перетаскивания)');
                        // НЕ сбрасываем selectedNestedParts!
                    } else {
                        console.log('   → Выделяем одну новую деталь');
                        // Клик по новой детали — сбрасываем и выделяем только эту
                        selectedNestedParts = [foundIndex];
                        window.selectedNestedParts = selectedNestedParts;  // Обновляем глобально
                    }
                    console.log('   ✅ Выделено деталей:', selectedNestedParts);
                }
                
                console.log('   selectedNestedParts после:', selectedNestedParts);
                console.log('   window.selectedNestedParts:', window.selectedNestedParts);

                // Показываем кнопки отражения детали
                document.getElementById('nestedPartTools').style.display = 'block';

                // ═══════════════════════════════════════════════════════════
                // ПОДГОТОВКА К ПЕРЕТАСКИВАНИЮ ГРУППЫ
                // ═══════════════════════════════════════════════════════════
                
                console.log('🖱️ Начало перетаскивания группы');
                console.log('   Выделено деталей:', selectedNestedParts.length);
                
                // Сохраняем смещения для КАЖДОЙ выделенной детали
                // Используем координаты листа (mouseSheetX, mouseSheetY)
                nestedDragOffsets = selectedNestedParts.map(idx => {
                    const nested = nestedParts[idx];
                    return {
                        index: idx,
                        startX: nested.x,  // Начальная позиция
                        startY: nested.y,
                        // Смещение мыши относительно каждой конкретной детали
                        mouseOffsetX: mouseSheetX - nested.x,
                        mouseOffsetY: mouseSheetY - nested.y
                    };
                });
                
                console.log('   nestedDragOffsets:', nestedDragOffsets);
                
                isDraggingNested = true;
                render();
                return;
            } else {
                // Клик в пустое место на листе - сброс выделения деталей и проверка прямоугольников разметки
                selectedNestedParts = [];
                isDraggingNested = false;

                // Скрываем кнопки отражения детали
                document.getElementById('nestedPartTools').style.display = 'none';

                // Проверяем, кликнули ли по прямоугольнику разметки
                let rectFound = -1;
                for (let i = markupRects.length - 1; i >= 0; i--) {
                    const rect = markupRects[i];
                    if (clickSheetX >= rect.x && clickSheetX <= rect.x + rect.width &&
                        clickSheetY >= rect.y && clickSheetY <= rect.y + rect.height) {
                        rectFound = i;
                        break;
                    }
                }

                selectedRectIndex = rectFound;
                render();
                updatePartsList();
                return;
            }
        } else {
            // Клик вне области листа - сброс выделения
            selectedNestedParts = [];
            selectedRectIndex = -1;
            isDraggingNested = false;
            render();
            updatePartsList(); // Обновляем подсветку в списке
        }
    }

    // Средняя кнопка мыши - панорамирование
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isPanning = true;
        panStart = { x: e.clientX - panX, y: e.clientY - panY };
        canvas.style.cursor = 'grabbing';
        return;
    }

    if (currentTool === 'select') {
        // Проверяем клик по размерной линии для перетаскивания (ПРИОРИТЕТ)
        const dimHit = findDimensionAtPoint(x, y);
        if (dimHit) {
            selectedDimension = dimHit.index;
            selectedEdge = null;
            selectedObjects = [];
            // Начинаем перетаскивание размерной линии
            isDraggingDimension = true;
            draggedDimensionIndex = dimHit.index;
            // Сохраняем смещение мыши относительно точки клика на линии
            const dim = dimensionLines[draggedDimensionIndex];
            dimensionDragOffset.x = x - (dim.x1 + dim.x2) / 2;
            dimensionDragOffset.y = y - (dim.y1 + dim.y2) / 2;
            showProperties(null);
            render();
            return;
        } else {
            selectedDimension = null;
        }

        // ═══════════════════════════════════════════════════════════
        // Проверяем клик по угловому размеру (ПРИОРИТЕТ)
        // ═══════════════════════════════════════════════════════════
        const angleHit = findAngleDimensionAtPoint(x, y);
        if (angleHit) {
            selectedAngleDimension = angleHit.index;
            selectedDimension = null; // Сбрасываем выделение обычных размеров
            selectedEdge = null;
            selectedObjects = [];
            console.log(`🎯 Выделен угловой размер #${angleHit.index} (${angleHit.angleDim.value}°)`);
            showProperties(null);
            render();
            return;
        } else {
            selectedAngleDimension = null;
        }

        // Проверяем, кликнули ли на конечную точку объекта (ПРИОРИТЕТ)
        const objPoint = findObjectPoint(x, y);
        if (objPoint && objPoint.pointType !== 'center') {
            draggedPoint = objPoint;
            selectedEdge = null;
            saveState();
            render();
            return;
        }

        // Режим параллельности/перпендикулярности (ПРИОРИТЕТ для линий)
        if (parallelMode && parallelStep >= 1) {
            for (let i = objects.length - 1; i >= 0; i--) {
                if (objects[i].contains(x, y) && objects[i].type === 'line') {
                    if (parallelStep === 1) {
                        referenceLineForParallel = objects[i];
                        selectedObjects = [objects[i]];
                        parallelStep = 2;
                        updateParallelButtons();
                    } else if (parallelStep === 2) {
                        if (objects[i] !== referenceLineForParallel) {
                            applyParallelToLine(objects[i]);
                            parallelMode = null;
                            parallelStep = 0;
                            referenceLineForParallel = null;
                            selectedObjects = [objects[i]];
                            updateParallelButtons();
                        }
                    }
                    render();
                    return;
                }
            }
        }

        let clickedObject = null;
        for (let i = objects.length - 1; i >= 0; i--) {
            if (objects[i].contains(x, y)) { clickedObject = objects[i]; break; }
        }

        // Проверяем клик по тексту (для перетаскивания)
        if (!clickedObject) {
            for (let i = objects.length - 1; i >= 0; i--) {
                if (objects[i].type === 'text' && objects[i].contains(x, y)) {
                    clickedObject = objects[i];
                    break;
                }
            }
        }

        // Проверяем клик по грани прямоугольника/многоугольника (только если не кликнули на объект)
        const edgeHit = findEdgeAtPoint(x, y);
        if (edgeHit && edgeHit.obj.type !== 'line' && !clickedObject && !parallelMode) {
            selectedEdge = edgeHit;
            selectedObjects = [];
            showProperties(null);
            render();
            return;
        } else if (!parallelMode) {
            selectedEdge = null;
        }

        if (clickedObject) {
            if (isCtrlPressed) {
                const idx = selectedObjects.indexOf(clickedObject);
                if (idx >= 0) selectedObjects.splice(idx, 1); else selectedObjects.push(clickedObject);
                showProperties(selectedObjects.length === 1 ? selectedObjects[0] : null);
            } else {
                if (selectedObjects.includes(clickedObject)) {
                    // Клик на уже выбранный объект - готовимся к возможному перетаскиванию ВСЕХ выбранных
                    potentialDragObject = 'multiple';
                    dragStartPos = { x, y };
                    const center = getSelectionCenter();
                    dragOffset = { x: x - center.x, y: y - center.y };
                } else {
                    // Клик на новый объект - выделяем его
                    potentialDragObject = null;
                    selectedObjects = [clickedObject];
                    showProperties(clickedObject);
                }
            }
        } else {
            potentialDragObject = null;
            // Клик в пустом месте - начинаем выделение рамкой
            isSelecting = true;
            selectStart = { x, y };
            selectEnd = { x, y };
            if (!isCtrlPressed) { selectedObjects = []; selectedDimension = null; selectedEdge = null; showProperties(null); }
        }
        render();
    // Инструмент "Ластик" перенесён в index.html (с обработкой деталей)
    // Инструмент "Размер" перенесён в index.html

    } else if (currentTool === 'angle') {
        // ═══════════════════════════════════════════════════════════
        // РЕЖИМ УГЛОВОГО РАЗМЕРА — 3 КЛИКА ПО ТОЧКАМ
        // ═══════════════════════════════════════════════════════════
        console.log('══════════════════════════════════════════════════');
        console.log('📐 [УГЛОВОЙ РАЗМЕР] Клик на холсте');
        console.log('   Текущий шаг:', !isDrawing ? '1 (вершина)' : (!dimensionStartPoint || !dimensionStartPoint.secondPoint ? '2 (первая точка)' : '3 (вторая точка)'));
        console.log('   Координаты клика:', { x: Math.round(x), y: Math.round(y) });

        if (!isDrawing || !dimensionStartPoint) {
            // Первый клик — вершина угла
            console.log('📍 ШАГ 1: Установка вершины угла');
            isDrawing = true;
            if (snapEnabled && objects.length > 0) {
                const snap = findSnapPoint(x, y);
                if (snap) {
                    x = snap.x; y = snap.y;
                    snapPoint = snap; // Сохраняем для отрисовки
                    console.log('   ✅ Привязка сработала:', { x: Math.round(x), y: Math.round(y), type: snap.type });
                } else {
                    console.log('   ❌ Привязка не сработала');
                }
            }
            dimensionStartPoint = { x, y };
            console.log('   Вершина установлена:', { x: Math.round(x), y: Math.round(y) });
            dimensionLabel.style.display = 'block';
        } else if (!dimensionStartPoint.secondPoint) {
            // Второй клик — вторая точка (первая линия угла)
            console.log('📍 ШАГ 2: Установка первой точки');
            if (snapEnabled && objects.length > 0) {
                const snap = findSnapPoint(x, y);
                if (snap) {
                    x = snap.x; y = snap.y;
                    snapPoint = snap; // Сохраняем для отрисовки
                    console.log('   ✅ Привязка сработала:', { x: Math.round(x), y: Math.round(y), type: snap.type });
                    
                    // Отображаем тип привязки
                    const snapNames = {
                        point: 'точка',
                        edge: 'грань',
                        line: 'линия',
                        midpoint: 'середина',
                        center: 'центр',
                        origin: 'центр координат',
                        intersection: 'пересечение',
                        tangent: 'касательная'
                    };
                    dimensionLabel.textContent = `📐 Точка 1: ${snapNames[snap.type] || 'точка'} (${Math.round(x)}, ${Math.round(y)})`;
                } else {
                    console.log('   ❌ Привязка не сработала');
                    dimensionLabel.textContent = '📐 Кликните на третью точку';
                }
            } else {
                dimensionLabel.textContent = '📐 Кликните на третью точку';
            }
            dimensionStartPoint.secondPoint = { x, y };
            console.log('   Первая точка установлена:', { x: Math.round(x), y: Math.round(y) });
            const distToVertex = Math.sqrt(Math.pow(x - dimensionStartPoint.x, 2) + Math.pow(y - dimensionStartPoint.y, 2));
            console.log('   Расстояние до вершины:', Math.round(distToVertex), 'px');
        } else {
            // Третий клик — третья точка (вторая линия угла)
            console.log('📍 ШАГ 3: Установка второй точки и создание размера');
            if (snapEnabled && objects.length > 0) {
                const snap = findSnapPoint(x, y);
                if (snap) {
                    x = snap.x; y = snap.y;
                    snapPoint = snap; // Сохраняем для отрисовки
                    console.log('   ✅ Привязка сработала:', { x: Math.round(x), y: Math.round(y), type: snap.type });
                    
                    // Отображаем тип привязки
                    const snapNames = {
                        point: 'точка',
                        edge: 'грань',
                        line: 'линия',
                        midpoint: 'середина',
                        center: 'центр',
                        origin: 'центр координат',
                        intersection: 'пересечение',
                        tangent: 'касательная'
                    };
                    console.log(`   📐 Точка 2: ${snapNames[snap.type] || 'точка'} (${Math.round(x)}, ${Math.round(y)})`);
                } else {
                    console.log('   ❌ Привязка не сработала');
                }
            }

            createAngleDimension(
                dimensionStartPoint.x, dimensionStartPoint.y,  // Вершина
                dimensionStartPoint.secondPoint.x, dimensionStartPoint.secondPoint.y,  // Точка 1
                x, y  // Точка 2
            );

            // Полный сброс - следующий клик начнёт новый угол с шага 1 (вершина)
            isDrawing = false;
            dimensionStartPoint = null;
            dimensionLabel.style.display = 'none';
            console.log('📐 [Угол] Угол создан. Следующий клик начнёт новый угол (вершина)');
            console.log('══════════════════════════════════════════════════\n');
            render();
        }
    } else {
        // ═══════════════════════════════════════════════════════════
        // ВАЖНО: 'dimension' обрабатывается в index.html, не здесь!
        // ═══════════════════════════════════════════════════════════
        if (currentTool === 'dimension') {
            return;  // Полный выход - обработка в index.html
        }
        
        // Сброс состояния при переключении на другой инструмент
        if (isDrawing || dimensionStartPoint) {
            console.log('⚠️ Сброс состояния при смене инструмента');
            isDrawing = false;
            dimensionStartPoint = null;
            dimensionLabel.style.display = 'none';
        }

        isDrawing = true;
        if (snapEnabled && objects.length > 0) {
            const snap = findSnapPoint(x, y);
            if (snap) {
                x = snap.x; y = snap.y; snapPoint = snap;
            }
        }
        startPoint = { x, y };
        if (currentTool === 'line') currentShape = new Line(x, y, x, y);
        else if (currentTool === 'circle') currentShape = new Circle(x, y, 0);
        else if (currentTool === 'rect') currentShape = new Rect(x, y, 0, 0);
        else if (currentTool === 'polygon') currentShape = new Polygon(x, y, 0, polygonSides);
        else if (currentTool === 'text') {
            // Для текста сразу запрашиваем ввод
            const text = prompt('Введите текст:', 'Надпись');
            if (text) {
                const fontSize = parseInt(prompt('Размер шрифта (10-50):', '14')) || 14;
                saveState();
                objects.push(new Text(x, y, text, fontSize));
                render();
            }
            isDrawing = false;
        }
        dimensionLabel.style.display = 'block';
    }
});

// ═══════════════════════════════════════════════════════════════
// КОНТЕКСТНОЕ МЕНЮ (ПКМ) - ОТКРЫТИЕ МЕНЮ ЗАПОЛНЕНИЯ
// ═══════════════════════════════════════════════════════════════

canvas.addEventListener('contextmenu', function(e) {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();

    // Проверяем, кликнули ли по листу с раскладкой
    if (showSheetView) {
        const sheetMargin = 50;
        const baseSheetW = Math.min(sheetSize.width / 3, 400);
        const baseSheetH = baseSheetW * sheetSize.height / sheetSize.width;
        const sheetW = baseSheetW * sheetZoom;
        const sheetH = baseSheetH * sheetZoom;
        const sheetX = canvas.width - sheetW - sheetMargin + sheetPanX;
        const sheetY = sheetMargin + sheetPanY;

        const scaleX = sheetW / sheetSize.width;
        const scaleY = sheetH / sheetSize.height;

        const clickSheetX = (e.clientX - rect.left - sheetX) / scaleX;
        const clickSheetY = (e.clientY - rect.top - sheetY) / scaleY;

        // Проверяем, кликнули ли по прямоугольнику разметки
        const rectsToCheck = window.markupRects || markupRects || [];
        let clickedRectIndex = -1;
        
        for (let i = rectsToCheck.length - 1; i >= 0; i--) {
            const r = rectsToCheck[i];
            if (clickSheetX >= r.x && clickSheetX <= r.x + r.width &&
                clickSheetY >= r.y && clickSheetY <= r.y + r.height) {
                clickedRectIndex = i;
                break;
            }
        }

        if (clickedRectIndex >= 0) {
            console.log('📦 ПКМ по прямоугольнику разметки:', clickedRectIndex);
            
            // Вызываем функцию открытия меню (определена в index.html)
            if (typeof openMarkupRectMenu === 'function') {
                openMarkupRectMenu(clickedRectIndex, e.clientX, e.clientY);
            }
        }
    }
});

// ═══════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: Создание углового размера
// ═══════════════════════════════════════════════════════════
function createAngleDimension(vertexX, vertexY, point1X, point1Y, point2X, point2Y) {
    const vertex = { x: vertexX, y: vertexY };
    const point1 = { x: point1X, y: point1Y };
    const point2 = { x: point2X, y: point2Y };

    console.log('\n📊 РАСЧЁТ УГЛА:');
    console.log('   Вершина:', { x: Math.round(vertex.x), y: Math.round(vertex.y) });
    console.log('   Точка 1:', { x: Math.round(point1.x), y: Math.round(point1.y) });
    console.log('   Точка 2:', { x: Math.round(point2.x), y: Math.round(point2.y) });

    // Вычисляем углы от вершины к точкам
    const angle1 = Math.atan2(point1.y - vertex.y, point1.x - vertex.x);
    const angle2 = Math.atan2(point2.y - vertex.y, point2.x - vertex.x);
    const angle1Deg = angle1 * 180 / Math.PI;
    const angle2Deg = angle2 * 180 / Math.PI;

    console.log('   Угол 1 (от вершины до точки 1):', angle1Deg.toFixed(2), '°');
    console.log('   Угол 2 (от вершины до точки 2):', angle2Deg.toFixed(2), '°');

    // Вычисляем угол между линиями (в градусах)
    let angleDiff = (angle2 - angle1) * 180 / Math.PI;
    console.log('   Разница углов (до нормализации):', angleDiff.toFixed(2), '°');

    // Нормализуем (0-360)
    if (angleDiff < 0) angleDiff += 360;
    console.log('   Разница углов (после нормализации):', angleDiff.toFixed(2), '°');

    // ═══════════════════════════════════════════════════════════
    // ДИНАМИЧЕСКИЙ РАДИУС ДУГИ
    // ═══════════════════════════════════════════════════════════
    const dist1 = Math.sqrt(Math.pow(point1.x - vertex.x, 2) + Math.pow(point1.y - vertex.y, 2));
    const dist2 = Math.sqrt(Math.pow(point2.x - vertex.x, 2) + Math.pow(point2.y - vertex.y, 2));

    // Находим bounding box всей сцены для масштабирования
    let sceneMaxDim = 500;
    if (objects.length > 0) {
        let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
        objects.forEach(obj => {
            const pts = obj.getPoints();
            pts.forEach(pt => {
                sMinX = Math.min(sMinX, pt.x);
                sMinY = Math.min(sMinY, pt.y);
                sMaxX = Math.max(sMaxX, pt.x);
                sMaxY = Math.max(sMaxY, pt.y);
            });
        });
        sceneMaxDim = Math.max(sMaxX - sMinX, sMaxY - sMinY);
    }
    
    // Радиус = 10-15% от размера сцены, но не менее 30px и не более 300px
    const baseRadius = Math.max(30, Math.min(300, sceneMaxDim * 0.12));
    const maxDist = Math.max(dist1, dist2);
    const radius = Math.min(baseRadius, maxDist * 0.8);

    console.log('   Расстояние до точки 1:', Math.round(dist1), 'px');
    console.log('   Расстояние до точки 2:', Math.round(dist2), 'px');
    console.log('   Размер сцены:', Math.round(sceneMaxDim), 'px');
    console.log('   Радиус дуги:', Math.round(radius), 'px');

    // Создаём угловой размер
    if (dist1 > 5 && dist2 > 5) {
        const angleDim = {
            x: vertex.x,
            y: vertex.y,
            x1: point1.x,
            y1: point1.y,
            x2: point2.x,
            y2: point2.y,
            radius: radius,
            startAngle: angle1,
            endAngle: angle2,
            value: Math.round(angleDiff * 10) / 10 // Округляем до 0.1°
        };
        angleDimensions.push(angleDim);

        console.log('\n✅ УГЛОВОЙ РАЗМЕР СОЗДАН:');
        console.log('   Индекс в массиве:', angleDimensions.length - 1);
        console.log('   Значение угла:', angleDim.value, '°');
        console.log('   Всего угловых размеров:', angleDimensions.length);
    } else {
        console.log('\n❌ ОШИБКА: Расстояние до точек слишком маленькое (< 5px)');
        alert('⚠️ Угол слишком маленький! Кликните дальше от вершины.');
    }
}

// ═══════════════════════════════════════════════════════════
// ПЕРЕТАСКИВАНИЕ УГЛОВЫХ РАЗМЕРОВ
// ═══════════════════════════════════════════════════════════
let isDraggingAngleDimension = false;
let draggedAngleDimensionIndex = -1;
let angleDimensionDragOffsetX = 0;
let angleDimensionDragOffsetY = 0;

// Обработчик mousedown для угловых размеров (добавляем к существующему)
document.addEventListener('mousedown', (e) => {
    if (currentTool === 'select' && angleDimensions.length > 0 && !e.shiftKey && !e.altKey && e.button === 0) {
        const rect = canvas.getBoundingClientRect();
        const sheetX = canvas.width / 2 + panX;
        const sheetY = canvas.height / 2 + panY;
        const scaleX = zoom;
        const scaleY = zoom;

        const clickSheetX = (e.clientX - rect.left - sheetX) / scaleX;
        const clickSheetY = (e.clientY - rect.top - sheetY) / scaleY;

        // Проверяем клик по вершине углового размера (в пределах 10px)
        for (let i = 0; i < angleDimensions.length; i++) {
            const ad = angleDimensions[i];
            const distToVertex = Math.sqrt(Math.pow(clickSheetX - ad.x, 2) + Math.pow(clickSheetY - ad.y, 2));

            if (distToVertex < 10) {
                // Начинаем перетаскивание вершины
                isDraggingAngleDimension = true;
                draggedAngleDimensionIndex = i;
                angleDimensionDragOffsetX = clickSheetX - ad.x;
                angleDimensionDragOffsetY = clickSheetY - ad.y;
                selectedAngleDimension = i;

                console.log('📐 Начало перетаскивания углового размера #', i);
                e.preventDefault();
                render();
                return;
            }
        }
    }
});

// Обработчик mousemove для перетаскивания угловых размеров
document.addEventListener('mousemove', (e) => {
    if (isDraggingAngleDimension && draggedAngleDimensionIndex >= 0) {
        const rect = canvas.getBoundingClientRect();
        const sheetX = canvas.width / 2 + panX;
        const sheetY = canvas.height / 2 + panY;
        const scaleX = zoom;
        const scaleY = zoom;

        const clickSheetX = (e.clientX - rect.left - sheetX) / scaleX;
        const clickSheetY = (e.clientY - rect.top - sheetY) / scaleY;

        const ad = angleDimensions[draggedAngleDimensionIndex];

        // Обновляем вершину (пересчитываем углы)
        ad.x = clickSheetX - angleDimensionDragOffsetX;
        ad.y = clickSheetY - angleDimensionDragOffsetY;

        // Пересчитываем углы
        const angle1 = Math.atan2(ad.y1 - ad.y, ad.x1 - ad.x);
        const angle2 = Math.atan2(ad.y2 - ad.y, ad.x2 - ad.x);
        let angleDiff = (angle2 - angle1) * 180 / Math.PI;
        if (angleDiff < 0) angleDiff += 360;

        ad.startAngle = angle1;
        ad.endAngle = angle2;
        ad.value = Math.round(angleDiff * 10) / 10;

        render();
    }
});

// Обработчик mouseup для завершения перетаскивания
document.addEventListener('mouseup', () => {
    if (isDraggingAngleDimension) {
        console.log('✅ Перетаскивание углового размера завершено');
        isDraggingAngleDimension = false;
        draggedAngleDimensionIndex = -1;
    }
});

console.log('✅ Обработчик мыши (mousedown) загружен');

// ═══════════════════════════════════════════════════════════
// СОЗДАНИЕ ДИАГОНАЛЬНОГО ПАТТЕРНА (Fusion 360 style)
// ═══════════════════════════════════════════════════════════
function createDiagonalPattern(count, sourceNested, startPoint, endPoint) {
    if (!sourceNested || count < 1) {
        console.log('⚠️ Невалидные данные для паттерна');
        return;
    }
    
    console.log(`📐 Создание диагонального паттерна: ${count} деталей`);
    console.log(`   Источник: partId=${sourceNested.partId}, (${Math.round(sourceNested.x)}, ${Math.round(sourceNested.y)})`);
    console.log(`  	Start: (${Math.round(startPoint.x)}, ${Math.round(startPoint.y)})`);
    console.log(`   End: (${Math.round(endPoint.x)}, ${Math.round(endPoint.y)})`);
    
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    
    // Если только 1 деталь - копируем в конечную точку
    if (count === 1) {
        const copy = createNestedCopy(sourceNested);
        copy.x = endPoint.x - copy.width / 2;
        copy.y = endPoint.y - copy.height / 2;
        nestedParts.push(copy);
        console.log('✅ Создана 1 копия детали в конечной точке');
        return;
    }
    
    // Распределяем равномерно (включая начальную и конечную точки)
    // Первая деталь (i=0) - исходная, уже существует
    let createdCount = 0;
    
    for (let i = 1; i < count; i++) {
        const t = i / (count - 1); // От 0 до 1
        const copyX = startPoint.x + dx * t - sourceNested.width / 2;
        const copyY = startPoint.y + dy * t - sourceNested.height / 2;
        
        const copy = createNestedCopy(sourceNested);
        copy.x = copyX;
        copy.y = copyY;
        nestedParts.push(copy);
        createdCount++;
        
        console.log(`   Копия ${i}: (${Math.round(copyX)}, ${Math.round(copyY)})`);
    }
    
    console.log(`✅ Создано ${createdCount} копий детали`);
    console.log(`   Всего деталей в паттерне: ${count} (1 исходная + ${createdCount} копий)`);
    
    // ═══════════════════════════════════════════════════════════
    // Сохраняем и обновляем UI
    // ═══════════════════════════════════════════════════════════
    saveToCache();
    if (window.allSheets && window.allSheets.length > 0 && window.currentSheetIndex >= 0) {
        window.allSheets[window.currentSheetIndex].nestedParts = [...nestedParts];
        console.log(`   📋 Обновлено allSheets[${window.currentSheetIndex}]: ${nestedParts.length} деталей`);
    }
    render();
    updatePartsList();
}

function createNestedCopy(source) {
    return {
        ...source,
        id: `copy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        // Копируем все свойства оригинала
        partId: source.partId,
        width: source.width,
        height: source.height,
        baseWidth: source.baseWidth,
        baseHeight: source.baseHeight,
        angle: source.angle || 0,
        flippedX: source.flippedX || false,
        flippedY: source.flippedY || false
    };
}
