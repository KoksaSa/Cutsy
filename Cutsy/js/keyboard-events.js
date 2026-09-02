// ═══════════════════════════════════════════════════════════════
// keyboard-events.js — обработчик клавиатурных событий
// v3.37 — исправлена работа Ctrl+C / Ctrl+V на главном canvas
//
// БАГФИКС #1: syncNestedPartsToSheet() — потеря данных при переключении листов
// БАГФИКС #2: коллизии проверяются в неправильной позиции
// БАГФИКС #3: диагональный паттерн не блокирует стрелки ←→
// ═══════════════════════════════════════════════════════════════

console.log('⌨️ [keyboard-events.js] Загрузка модуля клавиатуры v3.37');

// ═══════════════════════════════════════════════════════════
// УНИФИЦИРОВАННОЕ СРАВНЕНИЕ ID ДЕТАЛЕЙ (защита от отсутствия)
// ═══════════════════════════════════════════════════════════
if (typeof samePartId !== 'function') {
    function samePartId(a, b) {
        return Number(a) === Number(b);
    }
}

// ─── БАГФИКС #1: вспомогательная функция для синхронизации ───
// Без этого перемещение/удаление/вставка деталей терялись
// при переключении на другой лист и обратно.
function _syncNested() {
    if (typeof syncNestedPartsToSheet === 'function') {
        syncNestedPartsToSheet();
    }
}

document.addEventListener('keydown', (e) => {
    // Игнорируем события в полях ввода
    if (e.target.matches('input, textarea, select')) return;

    // ═══════════════════════════════════════════════════════════
    // СТРЕЛКИ ↑↓ — изменение количества копий в диагональном паттерне
    // ═══════════════════════════════════════════════════════════
    if (window.diagonalPatternDragging && window.diagonalLayoutEnabled) {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            window.diagonalPatternCount = Math.min(100, (window.diagonalPatternCount || 2) + 1);
            window.diagonalPatternCountManuallySet = true;
            if (typeof render === 'function') render();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            window.diagonalPatternCount = Math.max(1, (window.diagonalPatternCount || 2) - 1);
            window.diagonalPatternCountManuallySet = true;
            if (typeof render === 'function') render();
            return;
        }
        // ─── БАГФИКС #3: блокируем ←→ при диагональном паттерне ───
        // Раньше стрелки ←→ проваливались в секцию перемещения деталей
        // и сдвигали выделенную деталь вместо управления паттерном.
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            return;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // v4.80: СТРЕЛКИ ↑↓ — управление pattern drag-режимом
    // ═══════════════════════════════════════════════════════════
    // v2.9: rectPattern WaitCenter — Escape для отмены
    if (window.rectPatternWaitCenter) {
        if (e.key === 'Escape') {
            e.preventDefault();
            if (typeof window.cancelPatternDragging === 'function') window.cancelPatternDragging();
            return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            return;
        }
    }

    if (window.rectPatternDragging) {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            window.rectPatternCount = Math.min(100, (window.rectPatternCount || 4) + 1);
            window.rectPatternCountManuallySet = true;
            if (typeof appState !== 'undefined') {
                appState.rectPatternCount = window.rectPatternCount;
                appState.rectPatternCountManuallySet = true;
            }
            localStorage.setItem('lastRectPatternCount', String(window.rectPatternCount));
            if (typeof render === 'function') render();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            window.rectPatternCount = Math.max(2, (window.rectPatternCount || 4) - 1);
            window.rectPatternCountManuallySet = true;
            if (typeof appState !== 'undefined') {
                appState.rectPatternCount = window.rectPatternCount;
                appState.rectPatternCountManuallySet = true;
            }
            localStorage.setItem('lastRectPatternCount', String(window.rectPatternCount));
            if (typeof render === 'function') render();
            return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            if (typeof window.cancelPatternDragging === 'function') window.cancelPatternDragging();
            return;
        }
    }

    if (window.circPatternWaitCenter) {
        // v2.6: WaitCenter — только Escape для отмены, стрелки не работают (центр ещё не указан)
        if (e.key === 'Escape') {
            e.preventDefault();
            if (typeof window.cancelPatternDragging === 'function') window.cancelPatternDragging();
            return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            return;
        }
    }

    if (window.circPatternDragging) {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            window.circPatternCount = Math.min(50, (window.circPatternCount || 6) + 1);
            window.circPatternCountManuallySet = true;
            if (typeof appState !== 'undefined') {
                appState.circPatternCount = window.circPatternCount;
                appState.circPatternCountManuallySet = true;
            }
            localStorage.setItem('lastCircPatternCount', String(window.circPatternCount));
            if (typeof render === 'function') render();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            window.circPatternCount = Math.max(2, (window.circPatternCount || 6) - 1);
            window.circPatternCountManuallySet = true;
            if (typeof appState !== 'undefined') {
                appState.circPatternCount = window.circPatternCount;
                appState.circPatternCountManuallySet = true;
            }
            localStorage.setItem('lastCircPatternCount', String(window.circPatternCount));
            if (typeof render === 'function') render();
            return;
        }
        // v2.8: ←→ меняют arcAngle (30..360, шаг 30)
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            const newArc = Math.min(360, (window.circPatternArcAngle || 360) + 30);
            window.circPatternArcAngle = newArc;
            if (typeof appState !== 'undefined') appState.circPatternArcAngle = newArc;
            localStorage.setItem('lastCircPatternArc', String(newArc));
            if (typeof render === 'function') render();
            return;
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const newArc = Math.max(30, (window.circPatternArcAngle || 360) - 30);
            window.circPatternArcAngle = newArc;
            if (typeof appState !== 'undefined') appState.circPatternArcAngle = newArc;
            localStorage.setItem('lastCircPatternArc', String(newArc));
            if (typeof render === 'function') render();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            if (typeof window.cancelPatternDragging === 'function') window.cancelPatternDragging();
            return;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // СТРЕЛКИ — перемещение выделенных деталей на листе
    // ═══════════════════════════════════════════════════════════
    if (showSheetView && selectedNestedParts.length > 0) {
        const step = e.shiftKey ? 10 : 1;  // Shift = шаг 10мм
        let moved = false;

        // Вспомогательная функция: проверка коллизий с другими деталями
        function hasCollision(testPart, excludeIndices) {
            if (window.allowOverlap) return false;  // Если наложение разрешено — коллизий нет
            
            for (let i = 0; i < nestedParts.length; i++) {
                if (excludeIndices.includes(i)) continue;
                
                const other = nestedParts[i];
                if (!other) continue;
                
                const gap = 3;
                if (testPart.x < other.x + other.width + gap &&
                    testPart.x + testPart.width + gap > other.x &&
                    testPart.y < other.y + other.height + gap &&
                    testPart.y + testPart.height + gap > other.y) {
                    return true;
                }
            }
            return false;
        }

        const selectedIndices = [...selectedNestedParts];

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            // ─── БАГФИКС #2: проверяем коллизию в РЕАЛЬНОЙ позиции ───
            // Раньше: testPart.y = nestedParts[idx].y - step (могло быть < 0)
            // Реально:  nestedParts[idx].y = Math.max(0, ...y - step) (0)
            // Коллизия проверялась в точке, где деталь НИКОГДА не окажется,
            // а в реальной точке (0) могла быть другая деталь → провал
            const canMove = selectedIndices.every(idx => {
                if (!nestedParts[idx]) return false;
                const realY = Math.max(0, nestedParts[idx].y - step);
                const testPart = {
                    x: nestedParts[idx].x,
                    y: realY,
                    width: nestedParts[idx].width,
                    height: nestedParts[idx].height
                };
                return !hasCollision(testPart, selectedIndices);
            });
            
            if (canMove) {
                selectedIndices.forEach(idx => {
                    if (nestedParts[idx]) {
                        nestedParts[idx].y = Math.max(0, nestedParts[idx].y - step);
                        moved = true;
                    }
                });
            }
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            // ─── БАГФИКС #2: проверяем коллизию в РЕАЛЬНОЙ позиции ───
            const canMove = selectedIndices.every(idx => {
                if (!nestedParts[idx]) return false;
                const realY = Math.min(sheetSize.height - nestedParts[idx].height, nestedParts[idx].y + step);
                const testPart = {
                    x: nestedParts[idx].x,
                    y: realY,
                    width: nestedParts[idx].width,
                    height: nestedParts[idx].height
                };
                return !hasCollision(testPart, selectedIndices);
            });
            
            if (canMove) {
                selectedIndices.forEach(idx => {
                    if (nestedParts[idx]) {
                        nestedParts[idx].y = Math.min(sheetSize.height - nestedParts[idx].height, nestedParts[idx].y + step);
                        moved = true;
                    }
                });
            }
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            // ─── БАГФИКС #2: проверяем коллизию в РЕАЛЬНОЙ позиции ───
            const canMove = selectedIndices.every(idx => {
                if (!nestedParts[idx]) return false;
                const realX = Math.max(0, nestedParts[idx].x - step);
                const testPart = {
                    x: realX,
                    y: nestedParts[idx].y,
                    width: nestedParts[idx].width,
                    height: nestedParts[idx].height
                };
                return !hasCollision(testPart, selectedIndices);
            });
            
            if (canMove) {
                selectedIndices.forEach(idx => {
                    if (nestedParts[idx]) {
                        nestedParts[idx].x = Math.max(0, nestedParts[idx].x - step);
                        moved = true;
                    }
                });
            }
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            // ─── БАГФИКС #2: проверяем коллизию в РЕАЛЬНОЙ позиции ───
            const canMove = selectedIndices.every(idx => {
                if (!nestedParts[idx]) return false;
                const realX = Math.min(sheetSize.width - nestedParts[idx].width, nestedParts[idx].x + step);
                const testPart = {
                    x: realX,
                    y: nestedParts[idx].y,
                    width: nestedParts[idx].width,
                    height: nestedParts[idx].height
                };
                return !hasCollision(testPart, selectedIndices);
            });
            
            if (canMove) {
                selectedIndices.forEach(idx => {
                    if (nestedParts[idx]) {
                        nestedParts[idx].x = Math.min(sheetSize.width - nestedParts[idx].width, nestedParts[idx].x + step);
                        moved = true;
                    }
                });
            }
        }

        if (moved) {
            if (typeof saveState === 'function') saveState();
            if (typeof saveToCache === 'function') saveToCache();
            _syncNested();  // ─── БАГФИКС #1: сохранить в allSheets ───
            if (typeof render === 'function') render();
            return;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // DELETE / BACKSPACE — удаление выделенных объектов / деталей на листе
    // ═══════════════════════════════════════════════════════════
    if (e.key === 'Delete' || e.key === 'Backspace') {
        // Удаление выделенных деталей на листе
        if (showSheetView && selectedNestedParts.length > 0) {
            e.preventDefault();
            if (typeof saveState === 'function') saveState();
            // Сортируем индексы по убыванию, чтобы удалять с конца
            const sortedIdx = [...selectedNestedParts].sort((a, b) => b - a);
            sortedIdx.forEach(idx => {
                if (nestedParts[idx]) {
                    nestedParts.splice(idx, 1);
                }
            });
            selectedNestedParts = [];
            window.selectedNestedParts = selectedNestedParts;
            _syncNested();  // ─── БАГФИКС #1: сохранить в allSheets ───
            if (typeof render === 'function') render();
            if (typeof updatePartsList === 'function') updatePartsList();
            if (typeof saveToCache === 'function') saveToCache();
            console.log('🗑️ Удалены выделенные детали с листа');
            return;
        }
        
        // Удаление выделенных объектов с холста (когда не на листе)
        if (selectedObjects.length > 0) {
            e.preventDefault();
            if (typeof saveState === 'function') saveState();

            const _rem = objects.filter(o => !selectedObjects.includes(o)); objects.length = 0; objects.push(..._rem);

            parts.forEach(part => {
                if (part.objects) {
                    const hadChanges = part.objects.some(obj => selectedObjects.includes(obj));
                    part.objects = part.objects.filter(obj => !selectedObjects.includes(obj));

                    if (hadChanges && part.objects.length > 0) {
                        if (typeof updatePartBounds === 'function') updatePartBounds(part);
                    }
                }
            });

            selectedObjects.forEach(obj => {
                const dimIdx = dimensionLines.findIndex(d => d.obj === obj);
                if (dimIdx >= 0) dimensionLines.splice(dimIdx, 1);
            });

            selectedObjects.length = 0;
            if (typeof showProperties === 'function') showProperties(null);
            if (typeof render === 'function') render();
            if (typeof saveToCache === 'function') saveToCache();
            console.log('🗑️ Удалены выделенные объекты с холста');
            return;
        }

        // Удаление размерной линии
        if (selectedDimension !== null) {
            e.preventDefault();
            if (typeof saveState === 'function') saveState();
            dimensionLines.splice(selectedDimension, 1);
            selectedDimension = null;
            if (typeof render === 'function') render();
            if (typeof saveToCache === 'function') saveToCache();
            return;
        }

        // Удаление углового размера
        if (typeof selectedAngleDimension !== 'undefined' && selectedAngleDimension !== null) {
            e.preventDefault();
            if (typeof saveState === 'function') saveState();
            if (typeof angleDimensions !== 'undefined') {
                angleDimensions.splice(selectedAngleDimension, 1);
            }
            selectedAngleDimension = null;
            if (typeof render === 'function') render();
            if (typeof saveToCache === 'function') saveToCache();
            return;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ESCAPE — отмена рисования / сброс выделения / инструмент «Выбрать»
    // ═══════════════════════════════════════════════════════════
    if (e.key === 'Escape') {
        if (typeof lineDimensionInput !== 'undefined' && lineDimensionInput) {
            lineDimensionInput.style.display = 'none';
        }
        if (window.diagonalPatternDragging) {
            window.diagonalPatternDragging = false;
            window.diagonalPatternSource = null;
            window.diagonalPatternStartPoint = null;
            window.diagonalPatternEndPoint = null;
            window.diagonalPatternCount = 2;
            window.diagonalPatternCountManuallySet = false;
            const btn = document.getElementById('diagonalLayoutBtn');
            if (btn) { btn.classList.remove('active'); btn.textContent = '📐 Диагональная раскладка: ВЫКЛ'; }
            currentTool = 'select';
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            const selectBtn = document.querySelector('[data-tool="select"]');
            if (selectBtn) selectBtn.classList.add('active');
            const toolLabel = document.getElementById('currentTool');
            if (toolLabel) toolLabel.textContent = 'Инструмент: Выбрать';
            if (typeof render === 'function') render(); return;
        }
        if (typeof isDrawingRect !== 'undefined' && isDrawingRect) {
            isDrawingRect = false; currentRect = null; currentCircle = null;
            markupPolygonPoints = []; isDrawingMarkupPolygon = false;
            const btn = document.getElementById('toggleMarkupRectRight');
            if (btn) btn.style.background = '#5a4a2d';
            currentTool = 'select';
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            const selectBtn = document.querySelector('[data-tool="select"]');
            if (selectBtn) selectBtn.classList.add('active');
            const toolLabel = document.getElementById('currentTool');
            if (toolLabel) toolLabel.textContent = 'Инструмент: Выбрать';
            if (typeof render === 'function') render(); return;
        }
        if (typeof isDrawing !== 'undefined' && isDrawing) {
            isDrawing = false;
            if (typeof currentShape !== 'undefined') currentShape = null;
            if (typeof snapPoint !== 'undefined') snapPoint = null;
            if (typeof dimensionStartPoint !== 'undefined') dimensionStartPoint = null;
            if (typeof lineSnapConstraint !== 'undefined') lineSnapConstraint = null;
            if (typeof dimensionLabel !== 'undefined' && dimensionLabel) dimensionLabel.style.display = 'none';
            if (typeof lineDimensionInput !== 'undefined' && lineDimensionInput) lineDimensionInput.style.display = 'none';
            if (typeof shapeInputStage !== 'undefined') shapeInputStage = 0;
            currentTool = 'select';
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            const selectBtn = document.querySelector('[data-tool="select"]');
            if (selectBtn) selectBtn.classList.add('active');
            const toolLabel = document.getElementById('currentTool');
            if (toolLabel) toolLabel.textContent = 'Инструмент: Выбрать';
            if (typeof render === 'function') render(); return;
        }
        if (showSheetView && selectedNestedParts.length > 0) {
            selectedNestedParts = [];
            window.selectedNestedParts = selectedNestedParts;
            currentTool = 'select';
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            const selectBtn = document.querySelector('[data-tool="select"]');
            if (selectBtn) selectBtn.classList.add('active');
            const toolLabel = document.getElementById('currentTool');
            if (toolLabel) toolLabel.textContent = 'Инструмент: Выбрать';
            if (typeof render === 'function') render(); return;
        }
        if (selectedObjects.length > 0) {
            selectedObjects.length = 0;
            if (typeof showProperties === 'function') showProperties(null);
            currentTool = 'select';
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            const selectBtn = document.querySelector('[data-tool="select"]');
            if (selectBtn) selectBtn.classList.add('active');
            const toolLabel = document.getElementById('currentTool');
            if (toolLabel) toolLabel.textContent = 'Инструмент: Выбрать';
            if (typeof render === 'function') render(); return;
        }
        currentTool = 'select';
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        const selectBtn = document.querySelector('[data-tool="select"]');
        if (selectBtn) selectBtn.classList.add('active');
        const toolLabel = document.getElementById('currentTool');
        if (toolLabel) toolLabel.textContent = 'Инструмент: Выбрать';
        if (typeof render === 'function') render();
    }

    // ═══════════════════════════════════════════════════════════
    // CTRL+Z — отмена последнего действия (англ. z / рус. я)
    // ═══════════════════════════════════════════════════════════
    if ((e.key === 'z' || e.key === 'я' || e.key === 'Я') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (typeof undo === 'function') {
            undo();
        }
        return;
    }

    // ═══════════════════════════════════════════════════════════
    // CTRL+Y — повтор отменённого действия (англ. y / рус. н)
    // ═══════════════════════════════════════════════════════════
    if ((e.key === 'y' || e.key === 'н' || e.key === 'Н') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (typeof redo === 'function') {
            redo();
        }
        return;
    }

    // ═══════════════════════════════════════════════════════════
    // CTRL+C — копировать выделенные объекты/детали
    // ═══════════════════════════════════════════════════════════
    if ((e.key === 'c' || e.key === 'с' || e.key === 'С') && (e.ctrlKey || e.metaKey)) {
        // Приоритет: сначала объекты на canvas, потом детали на листе
        if (selectedObjects.length > 0 && !showSheetView) {
            e.preventDefault();
            clipboard = [...selectedObjects];
            pasteOffset = { x: 20, y: 20 };
            console.log(`📋 [Ctrl+C] Скопировано объектов: ${clipboard.length}`);
            return;
        }
        
        if (showSheetView && selectedNestedParts.length > 0) {
            e.preventDefault();
            clipboardNested = selectedNestedParts.map(idx => {
                const nested = nestedParts[idx];
                const part = parts.find(p => samePartId(p.id, nested.partId));
                const srcW = part?.bounds?.width || nested.baseWidth || nested.width;
                const srcH = part?.bounds?.height || nested.baseHeight || nested.height;
                return {
                    partId: nested.partId,
                    width: nested.width,
                    height: nested.height,
                    baseWidth: srcW,
                    baseHeight: srcH,
                    rotation: nested.rotation,
                    angle: nested.angle,
                    polygon: nested.polygon ? nested.polygon.map(p => ({...p})) : null,
                    // v4.75: Копируем outline (в локальных координатах) — нужен для
                    // определения наличия отверстий в hit-test при mousedown
                    outline: nested.outline
                        ? nested.outline.map(poly => poly.map(p => ({ ...p })))
                        : null,
                    refPoint: nested.refPoint ? {...nested.refPoint} : null,
                    originalX: nested.x,
                    originalY: nested.y
                };
            });
            pasteOffset = { x: 20, y: 20 };
            console.log(`📋 [Ctrl+C] Скопировано деталей: ${clipboardNested.length}`);
            return;
        }
    }
        
    // ═══════════════════════════════════════════════════════════
    // CTRL+V — вставить скопированные детали/объекты
    // ═══════════════════════════════════════════════════════════
    if ((e.key === 'v' || e.key === 'м' || e.key === 'М') && (e.ctrlKey || e.metaKey)) {
        // Приоритет 1: вставка объектов с canvas (если есть в буфере)
        if (clipboard && clipboard.length > 0) {
            e.preventDefault();
            if (typeof saveState === 'function') saveState();
            
            const pastedObjects = [];
            clipboard.forEach(obj => {
                if (typeof obj.clone !== 'function') {
                    console.warn(`⚠️ [Ctrl+V] Объект типа "${obj.type}" не имеет метода clone() — пропускается`);
                    return;
                }
                const copy = obj.clone();
                if (!copy) {
                    console.warn(`⚠️ [Ctrl+V] clone() вернул null для типа "${obj.type}"`);
                    return;
                }
                if (typeof copy.move === 'function') {
                    copy.move(pasteOffset.x, pasteOffset.y);
                }
                objects.push(copy);
                pastedObjects.push(copy);
            });
            
            selectedObjects.length = 0; selectedObjects.push(...pastedObjects);

            pasteOffset.x += 20;
            pasteOffset.y += 20;

            if (typeof render === 'function') render();
            if (typeof saveToCache === 'function') saveToCache();
            console.log(`✅ [Ctrl+V] Вставлено объектов: ${pastedObjects.length}`);
            return;
        }
        
        // Приоритет 2: вставка деталей на лист
        if (showSheetView && clipboardNested && clipboardNested.length > 0) {
            e.preventDefault();
            if (typeof saveState === 'function') saveState();
            console.log(`📋 [Ctrl+V] Вставка ${clipboardNested.length} деталей со смещением (${pasteOffset.x}, ${pasteOffset.y})`);
            
            clipboardNested.forEach((data, i) => {
                const part = parts.find(p => samePartId(p.id, data.partId));
                if (!part) return;

                // v4.75: Сдвигаем polygon и outline на pasteOffset, чтобы они
                // соответствовали новым координатам (x, y). Раньше polygon
                // копировался без сдвига → hit-test по polygon не проходил
                // → деталь нельзя было выделить и перетащить мышкой.
                const newNested = {
                    partId: data.partId,
                    name: part.name,
                    width: data.width,
                    height: data.height,
                    baseWidth: data.baseWidth || data.width,
                    baseHeight: data.baseHeight || data.height,
                    x: data.originalX + pasteOffset.x,
                    y: data.originalY + pasteOffset.y,
                    rotation: data.rotation || 0,
                    angle: data.angle || 0,
                    // Сдвигаем все точки polygon на pasteOffset
                    polygon: data.polygon
                        ? data.polygon.map(p => ({ x: p.x + pasteOffset.x, y: p.y + pasteOffset.y }))
                        : null,
                    // outline в ЛОКАЛЬНЫХ координатах детали — НЕ сдвигаем
                    outline: data.outline
                        ? data.outline.map(poly => poly.map(p => ({ ...p })))
                        : null,
                    // refPoint в локальных координатах — НЕ сдвигаем
                    refPoint: data.refPoint ? {...data.refPoint} : null,
                    thickness: part.thickness,
                    material: part.material,
                    oneCutEnabled: part.oneCutEnabled || false
                };

                nestedParts.push(newNested);
            });
            
            const startIdx = nestedParts.length - clipboardNested.length;
            selectedNestedParts = [];
            for (let i = 0; i < clipboardNested.length; i++) {
                selectedNestedParts.push(startIdx + i);
            }
            window.selectedNestedParts = selectedNestedParts;
            
            pasteOffset.x += 20;
            pasteOffset.y += 20;

            _syncNested();  // ─── БАГФИКС #1: сохранить в allSheets ───
            if (typeof render === 'function') render();
            if (typeof updatePartsList === 'function') updatePartsList();
            if (typeof saveToCache === 'function') saveToCache();
            console.log(`✅ [Ctrl+V] Вставлено и выделено: ${clipboardNested.length} деталей`);
            return;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // v1.0: Ctrl+J — группировка, Ctrl+Shift+J — разгруппировка
    // (Ctrl+G открывает поиск браузера — используем J)
    // ═══════════════════════════════════════════════════════════
    if ((e.key === 'j' || e.key === 'о' || e.key === 'О') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) {
            // Ctrl+Shift+J — разгруппировка
            if (typeof window.ungroupSelected === 'function') {
                if (!window.ungroupSelected()) {
                    alert('⚠️ Выделите сгруппированные объекты для разгруппировки');
                }
            }
        } else {
            // Ctrl+J — группировка
            if (typeof window.groupSelected === 'function') {
                if (!window.groupSelected()) {
                    alert('⚠️ Выделите 2+ объекта для группировки');
                }
            }
        }
        return;
    }

    // ═══════════════════════════════════════════════════════════
    // ГОРЯЧИЕ КЛАВИШИ ИНСТРУМЕНТОВ
    // ═══════════════════════════════════════════════════════════
    const toolShortcuts = {
        's': 'select', 'ы': 'select',
        'l': 'line', 'д': 'line',
        'c': 'circle', 'с': 'circle',
        'r': 'rect', 'к': 'rect',
        'p': 'polygon', 'з': 'polygon',
        'e': 'eraser', 'у': 'eraser',
        'd': 'dimension', 'в': 'dimension',
        'a': 'angle', 'ф': 'angle',
        't': 'text', 'е': 'text'
    };

    const key = e.key.toLowerCase();
    if (toolShortcuts[key] && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const toolName = toolShortcuts[key];
        const btn = document.querySelector(`[data-tool="${toolName}"]`);
        if (btn) {
            btn.click();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // O — Инструмент Offset (Эквидистанта / Подобие)
    // ═══════════════════════════════════════════════════════════
    if ((key === 'o' || key === 'щ') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        console.log('⌨️ [keyboard-events] Нажата O — вызов Offset');
        if (typeof window.activateOffsetTool === 'function') {
            window.activateOffsetTool();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // M — Инструмент Mirror (Отражение / Симметрия)
    // ═══════════════════════════════════════════════════════════
    if ((key === 'm' || key === 'ь') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (typeof window.activateMirrorTool === 'function') {
            // v4.97: Подсветка кнопки при активации с клавиатуры
            document.querySelectorAll('.tool-btn').forEach(function(b) { b.classList.remove('active'); });
            const btn = document.getElementById('mirrorToolBtn');
            if (btn) btn.classList.add('active');
            window.activateMirrorTool();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Q — Инструмент Rotate (Поворот объектов)
    // ═══════════════════════════════════════════════════════════
    if ((key === 'q' || key === 'й') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (typeof window.activateRotateTool === 'function') {
            window.activateRotateTool();
        }
    }
});

console.log('✅ [keyboard-events.js] Модуль клавиатуры загружен v3.37');