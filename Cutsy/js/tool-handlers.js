// ═══════════════════════════════════════════════════════════
// tool-handlers.js — ИСПРАВЛЕННАЯ ВЕРСИЯ
// ═══════════════════════════════════════════════════════════
// Багфиксы:
//   - safeAddEventListener для 5 кнопок без проверки null
//   - alignLinesHorizontal: использование anchorPoint для выравнивания
//   - applyParallelToLine: проверка методов getAngle/center/length
//   - удалён мёртвый код updateParallelButtons
//   - saveState перед clearDimensions
//   - убраны 8 информационных console.log
//   - fallback в toolNames для неизвестного инструмента
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: безопасное добавление обработчиков
// ═══════════════════════════════════════════════════════════
function safeAddToolListener(id, event, handler) {
    var element = document.getElementById(id);
    if (element) {
        element.addEventListener(event, handler);
    } else {
        console.warn('Элемент #' + id + ' не найден в DOM');
    }
    return element;
}

// ═══════════════════════════════════════════════════════════
// ОБРАБОТЧИКИ КНОПОК ИНСТРУМЕНТОВ
// ═══════════════════════════════════════════════════════════

document.querySelectorAll('.tool-btn').forEach(function(btn) {
    // Пропускаем кнопку микро-стыка — у неё свой обработчик в microjoint-tool.js
    if (btn.id === 'microjointTool') return;
    // v1.0: Пропускаем кнопки группы — у них свой обработчик (не очищают selectedObjects)
    if (btn.id === 'groupBtn' || btn.id === 'ungroupBtn') return;

    btn.addEventListener('click', function() {
        // ═══════════════════════════════════════════════════════
        // ПРОВЕРКА ПРОБНОГО ТАРИФА — блокировка инструментов Линия и Размер
        // ═══════════════════════════════════════════════════════
        if (typeof LicenseManager !== 'undefined' && LicenseManager.isTrial()) {
            if (btn.dataset.tool === 'line') {
                if (typeof LicenseManager.showUpgradeModal === 'function') {
                    LicenseManager.showUpgradeModal('lineTool');
                } else {
                    alert('Инструмент "Линия" недоступен в пробном периоде. Купите тариф для рисования деталей.');
                }
                return;
            }
            if (btn.dataset.tool === 'dimension') {
                if (typeof LicenseManager.showUpgradeModal === 'function') {
                    LicenseManager.showUpgradeModal('dimensionTool');
                } else {
                    alert('Инструмент "Размер" недоступен в пробном периоде. Купите тариф для замера деталей.');
                }
                return;
            }
        }

        // ═══════════════════════════════════════════════════════
        // ПРОВЕРКА: если показаны 2+ детали — запрещаем рисовать
        // ═══════════════════════════════════════════════════════
        var visiblePartsCount = parts.filter(function(p) { return p.visible === true; }).length;
        if (visiblePartsCount >= 2 && btn.dataset.tool !== 'select') {
            alert('Нельзя редактировать!\n\nПоказано более 1 детали.\n\nСначала скройте лишние детали (нажмите "✓"), затем редактируйте.');
            return;
        }

        // v1.1: Offset — перехватываем ДО очистки selectedObjects!
        // Если нажали кнопку Offset — активируем режим, не очищая выделение.
        if (btn.dataset.tool === 'offset') {
            if (typeof window.activateOffsetTool === 'function') {
                window.activateOffsetTool();
            }
            return; // не продолжаем стандартную обработку инструмента
        }

        // v1.0: Mirror — перехватываем ДО очистки selectedObjects!
        if (btn.dataset.tool === 'mirror') {
            if (typeof window.activateMirrorTool === 'function') {
                // v4.97: Подсветка кнопки как у стандартных инструментов
                document.querySelectorAll('.tool-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                window.activateMirrorTool();
            }
            return;
        }

        // v1.0: Rotate — перехватываем ДО очистки selectedObjects!
        if (btn.dataset.tool === 'rotate') {
            if (typeof window.activateRotateTool === 'function') {
                // v4.97: Подсветка кнопки
                document.querySelectorAll('.tool-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                window.activateRotateTool();
            }
            return;
        }

        // v1.0: Rectangular Pattern — перехватываем ДО очистки selectedObjects!
        if (btn.dataset.tool === 'rectPattern') {
            if (typeof window.activateRectPatternTool === 'function') {
                // v4.97: Подсветка кнопки
                document.querySelectorAll('.tool-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                window.activateRectPatternTool();
            } else {
                alert('pattern-tool.js не загружен');
            }
            return;
        }

        // v1.0: Circular Pattern — перехватываем ДО очистки selectedObjects!
        if (btn.dataset.tool === 'circPattern') {
            if (typeof window.activateCircularPatternTool === 'function') {
                // v4.97: Подсветка кнопки
                document.querySelectorAll('.tool-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                window.activateCircularPatternTool();
            } else {
                alert('pattern-tool.js не загружен');
            }
            return;
        }

        document.querySelectorAll('.tool-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentTool = btn.dataset.tool;

        var toolNames = {
            select: 'Выбор',
            line: 'Линия',
            circle: 'Круг',
            rect: 'Прямоугольник',
            polygon: 'Многоугольник',
            dimension: 'Размер',
            fillet: 'Скругление',
            chamfer: 'Фаска',
            eraser: 'Ластик',
            text: 'Текст'
        };
        var toolNameEl = document.getElementById('currentTool');
        if (toolNameEl) {
            toolNameEl.textContent = 'Инструмент: ' + (toolNames[currentTool] || currentTool);
        }

        // Обновляем индикатор режима редактирования
        var editingIndicator = document.getElementById('editingPartIndicator');
        if (isEditingPart && editingPartId !== null) {
            var part = parts.find(function(p) { return p.id === editingPartId; });
            if (part && editingIndicator) {
                editingIndicator.style.display = 'block';
                var editingNameEl = document.getElementById('editingPartName');
                if (editingNameEl) {
                    editingNameEl.textContent = 'Редактирование: ' + (part.name || '#' + part.id);
                }
            }
        } else if (editingIndicator) {
            editingIndicator.style.display = 'none';
        }

        if (currentTool !== 'select') { selectedObjects.length = 0; showProperties(null); }

        // Сброс режима полилинии при переключении на другой инструмент
        if (currentTool !== 'line' && isDrawing) {
            isDrawing = false;
            currentShape = null;
            snapPoint = null;
            lineSnapConstraint = null;
            if (dimensionLabel) dimensionLabel.style.display = 'none';
            if (typeof lineDimensionInput !== 'undefined' && lineDimensionInput) {
                lineDimensionInput.style.display = 'none';
                lineDimensionInput.value = '';
            }
            if (typeof shapeInputStage !== 'undefined') shapeInputStage = 0;
        }

        // ═══════════════════════════════════════════════════════
        // ПОКАЗАТЬ/СКРЫТЬ привязки и ортогональность (только для линии)
        // ═══════════════════════════════════════════════════════
        var snapOrthoTools = document.getElementById('snapOrthoTools');
        if (snapOrthoTools) {
            snapOrthoTools.style.display = (currentTool === 'line') ? 'block' : 'none';
        }

        // Сброс режима параллельности при переключении инструмента
        if (parallelMode) {
            parallelMode = null;
            parallelStep = 0;
            referenceLineForParallel = null;
        }

        if (currentTool === 'dimension') {
            isDimensionMode = true;
            isDrawing = false;
            dimensionStartPoint = null;
        } else {
            isDimensionMode = false;
        }

        // v1.0: Инструмент Offset — уже обработан выше (до очистки selectedObjects)
        // Этот блок убран — offset перехватывается в начале обработчика.

        if (typeof render === 'function') render();
    });
});

// ═══════════════════════════════════════════════════════════
// ВЫРАВНИВАНИЕ ЛИНИЙ
// ═══════════════════════════════════════════════════════════

function alignLinesHorizontal() {
    if (selectedObjects.length === 0) return;
    if (typeof saveState === 'function') saveState();

    var lines = selectedObjects.filter(function(o) { return o.type === 'line'; });
    if (lines.length === 0) return;

    // Ищем общую якорную точку (ближайшие концы двух линий)
    var anchorY = null;
    for (var i = 0; i < lines.length; i++) {
        for (var j = i + 1; j < lines.length; j++) {
            var l1 = lines[i], l2 = lines[j];
            var points1 = [{x: l1.x1, y: l1.y1}, {x: l1.x2, y: l1.y2}];
            var points2 = [{x: l2.x1, y: l2.y1}, {x: l2.x2, y: l2.y2}];
            for (var pi = 0; pi < points1.length; pi++) {
                for (var pj = 0; pj < points2.length; pj++) {
                    if (Math.abs(points1[pi].x - points2[pj].x) < 1 && Math.abs(points1[pi].y - points2[pj].y) < 1) {
                        // Нашли якорную точку — используем её Y как целевую
                        anchorY = (points1[pi].y + points2[pj].y) / 2;
                    }
                }
            }
        }
    }

    // Если якорь найден — выравниваем все линии по нему
    // Если нет — выравниваем по среднему Y всех линий
    var targetY = (anchorY !== null) ? anchorY : lines.reduce(function(s, obj) { return s + (obj.y1 + obj.y2) / 2; }, 0) / lines.length;

    lines.forEach(function(obj) {
        obj.y1 = targetY;
        obj.y2 = targetY;
    });

    if (typeof render === 'function') render();
    if (typeof showProperties === 'function' && selectedObjects.length > 0) showProperties(selectedObjects[0]);
}

function alignLinesVertical() {
    if (selectedObjects.length === 0) return;
    if (typeof saveState === 'function') saveState();

    var lines = selectedObjects.filter(function(o) { return o.type === 'line'; });
    if (lines.length === 0) return;

    var targetX = lines.reduce(function(s, obj) { return s + (obj.x1 + obj.x2) / 2; }, 0) / lines.length;

    lines.forEach(function(obj) {
        obj.x1 = targetX;
        obj.x2 = targetX;
    });

    if (typeof render === 'function') render();
    if (typeof showProperties === 'function' && selectedObjects.length > 0) showProperties(selectedObjects[0]);
}

// ═══════════════════════════════════════════════════════════
// ПАРАЛЛЕЛЬНОСТЬ / ПЕРПЕНДИКУЛЯРНОСТЬ ЛИНИЙ
// ═══════════════════════════════════════════════════════════

function applyParallelToLine(line) {
    if (!parallelMode || !referenceLineForParallel) return false;

    // Проверяем наличие необходимых методов
    if (typeof referenceLineForParallel.getAngle !== 'function') {
        console.warn('applyParallelToLine: у referenceLine нет метода getAngle');
        return false;
    }
    if (!line || typeof line.center === 'undefined' || typeof line.length === 'undefined') {
        console.warn('applyParallelToLine: у линии нет свойств center или length');
        return false;
    }

    if (typeof saveState === 'function') saveState();

    var refAngle = (parallelMode === 'parallel')
        ? referenceLineForParallel.getAngle()
        : referenceLineForParallel.getAngle() + Math.PI / 2;
    var center = line.center;
    var length = line.length;
    line.x1 = center.x - Math.cos(refAngle) * length / 2;
    line.y1 = center.y - Math.sin(refAngle) * length / 2;
    line.x2 = center.x + Math.cos(refAngle) * length / 2;
    line.y2 = center.y + Math.sin(refAngle) * length / 2;
    return true;
}

// ═══════════════════════════════════════════════════════════
// КНОПКИ РАЗМЕРОВ
// ═══════════════════════════════════════════════════════════

safeAddToolListener('autoDimension', 'click', function() {
    if (typeof autoDimension === 'function') autoDimension();
    else if (typeof window.autoDimension === 'function') window.autoDimension();
});

safeAddToolListener('clearDimensions', 'click', function() {
    if (typeof saveState === 'function') saveState();
    if (typeof clearDimensions === 'function') clearDimensions();
    else if (typeof window.clearDimensions === 'function') window.clearDimensions();
});

// v1.0: Чекбокс "Только габариты" — фильтрация размерных линий
var gabaritCheckbox = document.getElementById('gabaritOnlyCheckbox');
if (gabaritCheckbox) {
    gabaritCheckbox.addEventListener('change', function() {
        if (typeof window.toggleGabaritOnly === 'function') {
            window.toggleGabaritOnly(gabaritCheckbox.checked);
        }
    });
}

// v1.0: Группировка / Разгруппировка
var groupBtn = document.getElementById('groupBtn');
if (groupBtn) {
    groupBtn.addEventListener('click', function() {
        if (typeof window.groupSelected === 'function') {
            if (!window.groupSelected()) {
                alert('⚠️ Выделите 2+ объекта для группировки');
            }
        }
    });
}
var ungroupBtn = document.getElementById('ungroupBtn');
if (ungroupBtn) {
    ungroupBtn.addEventListener('click', function() {
        if (typeof window.ungroupSelected === 'function') {
            if (!window.ungroupSelected()) {
                alert('⚠️ Выделите сгруппированные объекты для разгруппировки');
            }
        }
    });
}

// v1.0: Импорт STEP — развёртка листового металла
var importStepBtn = document.getElementById('importStep');
var stepInput = document.getElementById('stepInput');
var stepDialog = document.getElementById('stepImportDialog');
var stepFileName = document.getElementById('stepFileName');
var stepOkBtn = document.getElementById('stepOk');
var stepCancelBtn = document.getElementById('stepCancel');
var stepProgress = document.getElementById('stepProgress');
var stepSelectedFile = null;

if (importStepBtn) {
    importStepBtn.addEventListener('click', function() {
        if (stepInput) stepInput.click();
    });
}
if (stepInput) {
    stepInput.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        stepSelectedFile = file;
        if (stepFileName) stepFileName.textContent = '📄 ' + file.name;
        if (stepDialog) stepDialog.style.display = 'block';
        e.target.value = '';
    });
}
if (stepCancelBtn) {
    stepCancelBtn.addEventListener('click', function() {
        stepDialog.style.display = 'none';
        stepSelectedFile = null;
    });
}
if (stepOkBtn) {
    stepOkBtn.addEventListener('click', async function() {
        if (!stepSelectedFile) return;
        var thickness = parseFloat(document.getElementById('stepThickness').value) || 1.0;

        // Показываем прогресс
        if (stepProgress) {
            stepProgress.style.display = 'block';
            stepProgress.textContent = '⏳ Загрузка парсера...';
        }
        stepOkBtn.disabled = true;
        stepCancelBtn.disabled = true;

        try {
            if (stepProgress) stepProgress.textContent = '⏳ Парсинг STEP...';
            var result = await window.importSTEP(stepSelectedFile, thickness);

            if (stepProgress) stepProgress.textContent = '⏳ Добавление на холст...';

            if (result && result.objects && result.objects.length > 0) {
                // Добавляем объекты на холст (используем существующую функцию)
                if (typeof saveState === 'function') saveState();

                // Нормализуем координаты
                var offsetX = -result.bounds.minX;
                var offsetY = -result.bounds.minY;

                // Сдвигаем вправо от существующих объектов
                var shiftX = 0;
                if (typeof objects !== 'undefined' && objects.length > 0) {
                    var maxExistingX = -Infinity;
                    for (var obj of objects) {
                        if (!obj) continue;
                        var objMaxX = 0;
                        if (obj.type === 'line') objMaxX = Math.max(obj.x1, obj.x2);
                        else if (obj.x !== undefined) objMaxX = obj.x + (obj.width || 0);
                        else if (obj.cx !== undefined) objMaxX = obj.cx + (obj.radius || 0);
                        else if (obj.points) objMaxX = Math.max.apply(null, obj.points.map(function(p) { return p.x; }));
                        if (objMaxX > maxExistingX) maxExistingX = objMaxX;
                    }
                    shiftX = maxExistingX + 20;
                }

                var totalOffsetX = offsetX + shiftX;
                var totalOffsetY = offsetY;

                for (var obj of result.objects) {
                    if (!obj) continue;
                    if (obj.type === 'line') {
                        obj.x1 += totalOffsetX; obj.y1 += totalOffsetY;
                        obj.x2 += totalOffsetX; obj.y2 += totalOffsetY;
                    }
                    if (typeof objects !== 'undefined') objects.push(obj);
                }

                if (typeof saveToCache === 'function') saveToCache();
                if (typeof render === 'function') render();
                if (typeof updateObjectsList === 'function') updateObjectsList();

                console.log('✅ [STEP] Развёртка добавлена на холст: ' + result.objects.length + ' объектов');
            } else {
                alert('⚠️ Не удалось развернуть деталь. Возможно, это не листовой металл.');
            }
        } catch(err) {
            console.error('❌ [STEP] Ошибка:', err);
            alert('❌ Ошибка: ' + err.message);
        } finally {
            stepDialog.style.display = 'none';
            stepOkBtn.disabled = false;
            stepCancelBtn.disabled = false;
            if (stepProgress) stepProgress.style.display = 'none';
            stepSelectedFile = null;
        }
    });
}

// ═══════════════════════════════════════════════════════════
// ПРИВЯЗКИ
// ═══════════════════════════════════════════════════════════

safeAddToolListener('toggleSnap', 'click', function() {
    snapEnabled = !snapEnabled;
    var btn = document.getElementById('toggleSnap');
    if (!btn) return;
    btn.classList.toggle('active');
    btn.textContent = snapEnabled ? '🧲 Привязки: ВКЛ' : '🧲 Привязки: ВЫКЛ';
    if (typeof render === 'function') render();
});

// ═══════════════════════════════════════════════════════════
// ОРТОГОНАЛЬНОСТЬ (рисование под углами 0°, 45°, 90°...)
// ═══════════════════════════════════════════════════════════

safeAddToolListener('toggleOrtho', 'click', function() {
    orthoEnabled = !orthoEnabled;
    var btn = document.getElementById('toggleOrtho');
    if (!btn) return;
    btn.classList.toggle('active');
    btn.textContent = orthoEnabled ? '📐 Ортогональность: ВКЛ' : '📐 Ортогональность: ВЫКЛ';
    if (typeof render === 'function') render();
});

// ═══════════════════════════════════════════════════════════
// ДИАГОНАЛЬНАЯ РАСКЛАДКА
// ═══════════════════════════════════════════════════════════

safeAddToolListener('diagonalLayoutBtn', 'click', function() {
    window.diagonalLayoutEnabled = !window.diagonalLayoutEnabled;
    if (window.diagonalLayoutEnabled) {
        window.diagonalPatternCount = 2;
        window.diagonalPatternCountManuallySet = false;
    }
    var btn = document.getElementById('diagonalLayoutBtn');
    if (!btn) return;
    btn.classList.toggle('active');
    btn.textContent = window.diagonalLayoutEnabled
        ? '📐 Диагональная раскладка: ВКЛ'
        : '📐 Диагональная раскладка: ВЫКЛ';
});

// ═══════════════════════════════════════════════════════════
// АВТОРАСКЛАДКА
// ═══════════════════════════════════════════════════════════

safeAddToolListener('autoNestingCheckbox', 'change', function() {
    const checkbox = this;
    const isEnabled = checkbox.checked;
    console.log(`✅ Авторасскладка: ${isEnabled ? 'ВКЛ' : 'ВЫКЛ'}`);
    
    // Сохраняем состояние в localStorage
    try {
        localStorage.setItem('autoNestingEnabled', isEnabled ? '1' : '0');
    } catch (e) {
        // Игнорируем ошибки localStorage
    }
    
    // Визуальное обновление (если нужно)
    if (isEnabled) {
        checkbox.parentElement.style.opacity = '1';
    } else {
        checkbox.parentElement.style.opacity = '0.7';
    }
});

// Восстановление состояния чекбокса при загрузке
(function initAutoNestingCheckbox() {
    try {
        const saved = localStorage.getItem('autoNestingEnabled');
        const checkbox = document.getElementById('autoNestingCheckbox');
        if (checkbox) {
            checkbox.checked = saved === '1';
            checkbox.parentElement.style.opacity = saved === '1' ? '1' : '0.7';
        }
    } catch (e) {
        // Игнорируем ошибки localStorage
    }
})();
// ═══════════════════════════════════════════════════════════
// v4.60: ВЫПАДАЮЩИЙ СПИСОК — режим прямоугольника (от угла / из центра)
// ═══════════════════════════════════════════════════════════
(function() {
    const dropdown = document.getElementById('rectModeDropdown');
    const menu = document.getElementById('rectModeMenu');
    if (!dropdown || !menu) return;

    // Открытие/закрытие меню
    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    // Выбор режима
    menu.querySelectorAll('.rect-mode-option').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const mode = option.dataset.mode;
            rectDrawMode = mode;
            window.rectDrawMode = mode;
            localStorage.setItem('rectDrawMode', mode);

            // Подсветка выбранного
            menu.querySelectorAll('.rect-mode-option').forEach(opt => {
                opt.style.color = opt.dataset.mode === mode ? '#00d4aa' : '#aaa';
            });

            // Обновляем title кнопки
            const rectBtn = document.getElementById('rectToolBtn');
            if (rectBtn) {
                rectBtn.title = mode === 'center'
                    ? 'R / К — Прямоугольник из центра'
                    : 'R / К — Прямоугольник от угла';
            }

            menu.style.display = 'none';
        });

        // Hover
        option.addEventListener('mouseenter', () => {
            option.style.background = '#3c3c3c';
        });
        option.addEventListener('mouseleave', () => {
            option.style.background = '';
        });
    });

    // Закрытие по клику вне
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !dropdown.contains(e.target)) {
            menu.style.display = 'none';
        }
    });

    // Восстанавливаем сохранённый режим
    try {
        const saved = localStorage.getItem('rectDrawMode');
        if (saved === 'center' || saved === 'corner') {
            rectDrawMode = saved;
            window.rectDrawMode = saved;
            menu.querySelectorAll('.rect-mode-option').forEach(opt => {
                opt.style.color = opt.dataset.mode === saved ? '#00d4aa' : '#aaa';
            });
            const rectBtn = document.getElementById('rectToolBtn');
            if (rectBtn) {
                rectBtn.title = saved === 'center'
                    ? 'R / К — Прямоугольник из центра'
                    : 'R / К — Прямоугольник от угла';
            }
        }
    } catch (e) {}
})();

// ═══════════════════════════════════════════════════════════════
// v4.78: ВЫПАДАЮЩИЙ СПИСОК КНОПКИ СКРУГЛЕНИЕ (Скругление / Фаска)
// ═══════════════════════════════════════════════════════════════
(function() {
    const dropdownBtn = document.getElementById('filletDropdownBtn');
    const dropdownMenu = document.getElementById('filletDropdownMenu');
    const mainBtn = document.getElementById('filletMainBtn');
    const mainLabel = document.getElementById('filletBtnLabel');

    if (!dropdownBtn || !dropdownMenu || !mainBtn) return;

    // Клик по стрелочке ▼ — показать/скрыть меню
    dropdownBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const isVisible = dropdownMenu.style.display !== 'none';
        dropdownMenu.style.display = isVisible ? 'none' : 'block';
    });

    // Клик по пункту меню — выбор инструмента (fillet или chamfer)
    dropdownMenu.querySelectorAll('[data-tool]').forEach(function(item) {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const tool = item.dataset.tool;

            // Обновляем иконку и лейбл основной кнопки
            if (mainLabel) {
                mainLabel.textContent = tool === 'chamfer' ? 'Фаска' : 'Скругл.';
            }
            // Обновляем data-tool и title основной кнопки
            mainBtn.dataset.tool = tool;
            mainBtn.title = tool === 'chamfer'
                ? 'F — Фаска угла'
                : 'F — Скругление угла';

            // Обновляем иконку SVG внутри основной кнопки
            const iconSpan = mainBtn.querySelector('.icon');
            if (iconSpan) {
                if (tool === 'chamfer') {
                    // Иконка фаски: прямая линия по диагонали (без дуги)
                    iconSpan.innerHTML = '<svg width="20" height="20">' +
                        '<path d="M 3 17 L 17 3" stroke="#fff" stroke-width="2" fill="none"/>' +
                        '<path d="M 3 17 L 17 17 L 17 3" stroke="#fff" stroke-width="1" fill="none" stroke-dasharray="2,2"/>' +
                        '</svg>';
                } else {
                    // Иконка скругления (исходная)
                    iconSpan.innerHTML = '<svg width="20" height="20">' +
                        '<path d="M 3 17 L 3 10 A 7 7 0 0 1 10 3 L 17 3" stroke="#fff" stroke-width="2" fill="none"/>' +
                        '</svg>';
                }
            }

            // Активируем инструмент (имитируем клик по основной кнопке)
            dropdownMenu.style.display = 'none';
            mainBtn.click();
        });
    });

    // Закрытие меню при клике вне его
    document.addEventListener('click', function(e) {
        if (!dropdownMenu.contains(e.target) && e.target !== dropdownBtn) {
            dropdownMenu.style.display = 'none';
        }
    });

    // Hover-эффект для пунктов меню
    dropdownMenu.querySelectorAll('[data-tool]').forEach(function(item) {
        item.addEventListener('mouseenter', function() {
            item.style.background = '#3c3c3c';
        });
        item.addEventListener('mouseleave', function() {
            item.style.background = '';
        });
    });
})();
