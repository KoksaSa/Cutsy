// ═══════════════════════════════════════════════════════════
// nesting-ui.js — извлечено из index.html
// ═══════════════════════════════════════════════════════════

        // ═══════════════════════════════════════════════════════════════
        // РАСКЛАДКА НА НЕСКОЛЬКО ЛИСТОВ (С ГРУППИРОВКОЙ ПО ТОЛЩИНЕ)
        // ═══════════════════════════════════════════════════════════════
        let isMultiNestingCancelled = false;  // Флаг отмены раскладки на несколько листов
        let isNestingInProgress = false;  // FIX: Guard against concurrent nesting operations

document.getElementById('nestMultiParts').addEventListener('click', async () => {
            const btn = document.getElementById('nestMultiParts');
            // v4.37 FIX U1: блокируем КНОПКУ через disabled вместо module-level флага.
            // Раньше внешний finally сбрасывал isNestingInProgress синхронно, до запуска
            // setTimeout(100) → дабл-клик обходил guard. Теперь disabled на время всей
            // раскладки (включая setTimeout), снимается только во внутреннем finally.
            if (btn.disabled) {
                return;  // Тихо игнорируем — кнопка уже disabled
            }
            btn.disabled = true;
            // v4.37 FIX U1: единый finally гарантирует снятие disabled при ЛЮБОМ выходе:
            // early-return (trial limit, no parts, validation error) ИЛИ исключение.
            // Раньше внешний finally сбрасывал флаг синхронно до запуска setTimeout.
            // Теперь disabled держится до завершения setTimeout (внутренний finally
            // уже сам его снимет), а если раскладка не дошла до setTimeout — снимем здесь.
            let nestingStarted = false;
            try {
            // 🔒 Проверка пробного тарифа — только 5 раскладок
            if (typeof LicenseManager !== 'undefined' && LicenseManager.isTrial()) {
                const nestingCount = LicenseManager.getNestingCount();
                if (nestingCount >= 5) {
                    if (typeof LicenseManager.showUpgradeModal === 'function') {
                        LicenseManager.showUpgradeModal('nestingLimit');
                    } else {
                        alert('📋 В пробном периоде доступно только 5 раскладок. Купите тариф для неограниченного использования.');
                    }
                    return;
                }
                // Инкрементируем счётчик ПОСЛЕ успешной раскладки (ниже в коде)
            }

            if (parts.length === 0) {
                alert('Сначала создайте детали (выделите объекты → ПКМ → "Создать деталь")');
                return;
            }

            const partsToNest = parts.filter(p => p.nestingEnabled !== false);
            if (partsToNest.length === 0) {
                alert('⚠️ Отметьте детали для раскладки (галочка в списке деталей)');
                return;
            }

            // ═══════════════════════════════════════════════════════════
            // ВАЛИДАЦИЯ ДЕТАЛЕЙ ПЕРЕД РАСКЛАДКОЙ
            // ═══════════════════════════════════════════════════════════
            const validation = validateParts(partsToNest);
            if (!validation.valid) {
                console.error('❌ Ошибка валидации деталей:', validation.errors);
                let errorMessage = '⚠️ Ошибка валидации деталей\n\n';
                errorMessage += validation.errors.slice(0, 5).join('\n');
                if (validation.errors.length > 5) {
                    errorMessage += `\n... и ещё ${validation.errors.length - 5} ошибок`;
                }
                alert(errorMessage);
                return;
            }
            // ═══════════════════════════════════════════════════════════

            // ═══════════════════════════════════════════════════════════
            // ГРУППИРОВКА ДЕТАЛЕЙ ПО ТОЛЩИНЕ
            // ═══════════════════════════════════════════════════════════
            const groupsByThickness = {};
            partsToNest.forEach(part => {
                const thickness = part.thickness || 0.8;  // Толщина по умолчанию 0.8мм
                const key = thickness.toString();
                if (!groupsByThickness[key]) {
                    groupsByThickness[key] = [];
                }
                groupsByThickness[key].push({
                    id: part.id,
                    name: part.name,
                    quantity: part.quantity,
                    bounds: part.bounds,
                    objects: part.objects,
                    thickness: thickness,
                    oneCutEnabled: part.oneCutEnabled || false,  // ═══════════════════════ ВАЖНО: Копируем "В один рез"
                    noRotate: part.noRotate || false,  // Копируем noRotate
                    allowedAngles: part.allowedAngles || [],  // v3.26: Копируем разрешённые углы
                    spacing: (typeof part.spacing === 'number') ? part.spacing : undefined  // Копируем spacing (undefined = UI-поле)
                });
            });

            const thicknessList = Object.keys(groupsByThickness).sort((a, b) => parseFloat(a) - parseFloat(b));

            // Сбрасываем старую раскладку и флаг отмены
            nestedParts = [];
            selectedNestedParts = [];
            // ═══════════════════════════════════════════════════════════
            // КОРРЕКЦИЯ: сбрасываем allowOverlap как в старом коде
            // Инверсия после раскладки ломала повторную раскладку:
            // allowOverlap=true → minGap=-100 → детали залезают друг на друга
            // ═══════════════════════════════════════════════════════════
            allowOverlap = false;
            window.allowOverlap = false;
            isMultiNestingCancelled = false;

            // Сбрасываем кнопку в исходное состояние
            const overlapBtnBefore = document.getElementById('toggleOverlap');
            if (overlapBtnBefore) {
                overlapBtnBefore.textContent = '🚫 Наложение деталей: ВЫКЛ';
                overlapBtnBefore.style.background = '#2d7a2d';  // Зелёный
            }

            // Показываем индикатор загрузки с кнопкой отмены и шкалой прогресса
            const loadingMsg = document.createElement('div');
            loadingMsg.id = 'multiSheetLoading';
            loadingMsg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(135deg, #252526 0%, #1e1e1e 100%);color:#fff;padding:40px 50px;border-radius:12px;z-index:10000;font-size:16px;box-shadow:0 8px 32px rgba(0,122,204,0.4);border:1px solid #007acc;text-align:center;min-width:400px;';

            // Считаем общее количество деталей для раскладки
            const totalPartsToNest = partsToNest.reduce((sum, p) => sum + p.quantity, 0);

            loadingMsg.innerHTML = `
                <div style="font-size:48px;margin-bottom:20px;animation:pulse 1s ease-in-out infinite;">⏳</div>
                <div style="font-weight:bold;margin-bottom:10px;">📑 Раскладка на несколько листов...</div>
                <div style="color:#007acc;font-size:14px;margin-bottom:15px;" id="multiSheetProgress">Подготовка...</div>

                <!-- Шкала прогресса -->
                <div style="width:100%;height:14px;background:#3c3c3c;border-radius:7px;overflow:hidden;margin-bottom:8px;position:relative;">
                    <div id="multiSheetProgressBar" style="width:0%;height:100%;background:linear-gradient(90deg, #007acc, #00aaff);border-radius:7px;box-shadow:0 0 8px rgba(0,170,255,0.4);"></div>
                    <!-- Маркеры 25%/50%/75% -->
                    <div style="position:absolute;left:25%;top:0;height:100%;width:1px;background:rgba(255,255,255,0.15);"></div>
                    <div style="position:absolute;left:50%;top:0;height:100%;width:1px;background:rgba(255,255,255,0.2);"></div>
                    <div style="position:absolute;left:75%;top:0;height:100%;width:1px;background:rgba(255,255,255,0.15);"></div>
                </div>
                <div id="multiSheetProgressPercent" style="color:#00ff00;font-weight:bold;font-size:16px;margin-bottom:15px;">0%</div>

                <!-- Детальная информация -->
                <div style="background:#1e1e1e;padding:15px;border-radius:8px;margin-bottom:20px;text-align:left;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                        <span style="color:#aaa;font-size:12px;">📄 Листов:</span>
                        <span style="color:#fff;font-weight:bold;" id="progressSheets">0</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                        <span style="color:#aaa;font-size:12px;"> Размещено деталей:</span>
                        <span style="color:#fff;font-weight:bold;" id="progressParts">0 из ${totalPartsToNest}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                        <span style="color:#aaa;font-size:12px;">🔩 Толщина:</span>
                        <span style="color:#00ff00;font-weight:bold;" id="progressThickness">-</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;">
                        <span style="color:#aaa;font-size:12px;">⏱️ Осталось:</span>
                        <span style="color:#ffa500;font-weight:bold;" id="progressTime">-- сек</span>
                    </div>
                </div>

                <button id="cancelMultiNesting" style="padding:10px 30px;background:#c72e2e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold;">❌ Прервать</button>
            `;
            // Добавляем @keyframes pulse только один раз (не при каждой раскладке)
            if (!document.getElementById('nestingPulseStyle')) {
                const pulseStyle = document.createElement('style');
                pulseStyle.id = 'nestingPulseStyle';
                pulseStyle.textContent = '@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.8; } }';
                document.head.appendChild(pulseStyle);
            }
            document.body.appendChild(loadingMsg);

            // Обработчик кнопки отмены
            document.getElementById('cancelMultiNesting').addEventListener('click', () => {
                isMultiNestingCancelled = true;
            });

            // Асинхронная раскладка на несколько листов
            nestingStarted = true;  // v4.37 FIX U1: раскладка дошла до setTimeout — внутренний finally снимет disabled
            setTimeout(async () => {
                try {
                    const allSheets = [];
                    let globalSheetCount = 0;  // Глобальный счётчик листов
                    const maxSheets = 100;  // Максимум листов

                    // Переменные для отслеживания прогресса
                    let placedPartsCount = 0;  // Количество размещённых деталей
                    let startTime = Date.now();
                    let estimatedTimeRemaining = '-- сек';
                    // FIX: Track unplaced parts count outside the loop scope
                    // so it's accessible in the cancellation handler
                    let unplacedPartsCount = 0;
                    // ETA: храним время последних листов для более точной оценки
                    const recentSheetTimes = [];  // {time, partsCount} последних N листов
                    const MAX_RECENT_SHEETS = 5;

                    // ═══════════════════════════════════════════════════
                    // Раскладка для каждой толщины
                    // ═══════════════════════════════════════════════════
                    for (let tIdx = 0; tIdx < thicknessList.length; tIdx++) {
                        const thickness = parseFloat(thicknessList[tIdx]);
                        const partsForThickness = groupsByThickness[thicknessList[tIdx]];

                        // Обновляем прогресс
                        document.getElementById('multiSheetProgress').textContent =
                            `Толщина ${thickness}мм`;

                        if (isMultiNestingCancelled) break;

                        // Небольшая задержка для обновления UI
                        await new Promise(resolve => setTimeout(resolve, 100));

                        // Копируем детали для раскладки этой толщины
                        // ═══════════════════════════════════════════════
                        // ВАЖНО: Копируем oneCutEnabled и noRotate для раскладки
                        // ═══════════════════════════════════════════════
                        // remainingParts будет хранить ОСТАВШЕЕСЯ количество для каждой детали
                        let remainingParts = partsForThickness.map(p => {
                            const originalPart = parts.find(orig => orig.id === p.id);
                            return {
                                id: p.id,
                                name: p.name,
                                quantity: originalPart ? originalPart.quantity : p.quantity,  // Оригинал!
                                bounds: {...p.bounds},
                                objects: p.objects,
                                thickness: p.thickness,
                                oneCutEnabled: p.oneCutEnabled === true,
                                noRotate: originalPart ? originalPart.noRotate === true : false,  // Копируем noRotate!
                                allowedAngles: originalPart ? (originalPart.allowedAngles || []) : (p.allowedAngles || []),  // v3.29: Копируем разрешённые углы!
                                spacing: (typeof originalPart?.spacing === 'number') 
                                    ? originalPart.spacing  // Копируем spacing из оригинальной детали (включая отрицательные!)
                                    : undefined,
                                nestingEnabled: true  // FIX: Explicit flag for performNesting
                            };
                        });

                        // Раскладка на листы пока есть детали с положительным количеством
                        while (remainingParts.some(p => p.quantity > 0) && globalSheetCount < maxSheets) {
                            if (isMultiNestingCancelled) break;

                            // ЗАМЕР ВРЕМЕНИ РАСКЛАДКИ
                            const sheetStartTime = Date.now();
                            const result = await performNesting(remainingParts, sheetSize, [], () => isMultiNestingCancelled);
                            const sheetNestingTime = (Date.now() - sheetStartTime) / 1000;

                            if (!result || result.nestedParts.length === 0) break;

                            globalSheetCount++;

                            // ═══════════════════════════════════════════════
                            // Сохраняем oneCutEnabled для каждого nestedPart
                            // ═══════════════════════════════════════════════
                            result.nestedParts.forEach(nested => {
                                const originalPart = parts.find(p => p.id === nested.partId);
                                if (originalPart) {
                                    nested.oneCutEnabled = originalPart.oneCutEnabled === true;
                                    nested.thickness = originalPart.thickness || 0.8;
                                    if (typeof nested.spacing !== 'number' && typeof originalPart.spacing === 'number') {
                                        nested.spacing = originalPart.spacing;
                                    }
                                } else {
                                    nested.oneCutEnabled = false;
                                    nested.thickness = 0.8;
                                }
                            });

                            // Подсчитываем, сколько штук каждой детали размещено на текущем листе
                            const placedOnThisSheet = {};
                            result.nestedParts.forEach(nested => {
                                placedOnThisSheet[nested.partId] = (placedOnThisSheet[nested.partId] || 0) + 1;
                            });

                            // Считаем размещённые штуки — placedOnThisSheet нужен для обновления remainingParts,
                            // а для прогресса достаточно длины массива
                            const placedQtyThisSheet = result.nestedParts.length;
                            placedPartsCount += placedQtyThisSheet;

                            // Вычисляем прогресс (ограничиваем 99% — 100% покажем только при финализации)
                            const progressPercent = Math.min(99, Math.round((placedPartsCount / totalPartsToNest) * 100));

                            // ETA на основе последних листов (более точный, чем среднее с начала)
                            recentSheetTimes.push({ time: sheetNestingTime, partsCount: placedQtyThisSheet });
                            if (recentSheetTimes.length > MAX_RECENT_SHEETS) recentSheetTimes.shift();
                            const recentTotalTime = recentSheetTimes.reduce((s, r) => s + r.time, 0);
                            const recentTotalParts = recentSheetTimes.reduce((s, r) => s + r.partsCount, 0);
                            const remainingQty = totalPartsToNest - placedPartsCount;
                            if (recentTotalParts > 0 && remainingQty > 0) {
                                const avgTimePerPartRecent = recentTotalTime / recentTotalParts;
                                const etaSeconds = Math.round(avgTimePerPartRecent * remainingQty);
                                estimatedTimeRemaining = etaSeconds < 60 ? `~${etaSeconds} сек` : `~${Math.round(etaSeconds / 60)} мин`;
                            } else if (remainingQty <= 0) {
                                estimatedTimeRemaining = 'почти готово...';
                            }

                            // Визуальная обратная связь: цвет шкалы по стадиям
                            const progressBar = document.getElementById('multiSheetProgressBar');
                            const progressPercentEl = document.getElementById('multiSheetProgressPercent');
                            if (progressPercent >= 75) {
                                progressBar.style.background = 'linear-gradient(90deg, #00aaff, #00ff88)';
                                progressBar.style.boxShadow = '0 0 12px rgba(0,255,136,0.5)';
                            } else if (progressPercent >= 50) {
                                progressBar.style.background = 'linear-gradient(90deg, #007acc, #00ddff)';
                                progressBar.style.boxShadow = '0 0 10px rgba(0,221,255,0.4)';
                            } else {
                                progressBar.style.background = 'linear-gradient(90deg, #007acc, #00aaff)';
                                progressBar.style.boxShadow = '0 0 8px rgba(0,170,255,0.4)';
                            }

                            // Обновляем UI прогресса
                            progressBar.style.width = progressPercent + '%';
                            progressPercentEl.textContent = progressPercent + '%';
                            document.getElementById('progressSheets').textContent = globalSheetCount;
                            document.getElementById('progressParts').textContent = `${placedPartsCount} из ${totalPartsToNest}`;
                            document.getElementById('progressThickness').textContent = thickness + ' мм';
                            document.getElementById('progressTime').textContent = estimatedTimeRemaining;
                            document.getElementById('multiSheetProgress').textContent =
                                `Толщина ${thickness}мм: Лист ${globalSheetCount}`;

                            allSheets.push({
                                sheetNum: globalSheetCount,
                                thickness: thickness,
                                nestedParts: result.nestedParts,
                                unplacedParts: result.unplacedParts,
                                utilization: result.utilization,
                                sheetSize: { ...sheetSize },
                                markupRects: [],
                                nestingTime: sheetNestingTime,
                                partDefinitions: {}
                            });

                            // Сохраняем определения деталей этого листа
                            const currentSheet = allSheets[allSheets.length - 1];
                            result.nestedParts.forEach(nested => {
                                if (!currentSheet.partDefinitions[nested.partId]) {
                                    const origPart = parts.find(p => p.id === nested.partId);
                                    const part = origPart || remainingParts.find(p => p.id === nested.partId);
                                    if (part) {
                                        currentSheet.partDefinitions[nested.partId] = {
                                            id: part.id,
                                            name: part.name,
                                            bounds: part.bounds,
                                            objects: part.objects,
                                            quantity: origPart ? origPart.quantity : part.quantity
                                        };
                                    }
                                }
                            });

                            // ═══════════════════════════════════════════════
                            // Обновляем список оставшихся деталей
                            const newRemainingParts = [];
                            for (const rp of remainingParts) {
                                const placedOnThis = placedOnThisSheet[rp.id] || 0;
                                const remainingQty = rp.quantity - placedOnThis;

                                if (remainingQty > 0) {
                                    newRemainingParts.push({
                                        id: rp.id,
                                        name: rp.name,
                                        quantity: remainingQty,
                                        bounds: rp.bounds,
                                        objects: rp.objects,
                                        thickness: rp.thickness,
                                        oneCutEnabled: rp.oneCutEnabled,
                                        noRotate: rp.noRotate,  // Сохраняем noRotate!
                                        allowedAngles: rp.allowedAngles || [],  // v3.26: Сохраняем разрешённые углы!
                                        spacing: rp.spacing,  // Сохраняем spacing!
                                        nestingEnabled: true  // FIX: Explicit flag for performNesting
                                    });
                                }
                            }

                            remainingParts = newRemainingParts;
                            unplacedPartsCount = remainingParts.reduce((sum, p) => sum + p.quantity, 0);

                            // Даём браузеру отрисовать шкалу перед следующим блокирующим performNesting()
                            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                        }

                        // Если отменено - выходим из цикла толщин
                        if (isMultiNestingCancelled) {
                            break;
                        }
                    }

                    // Финализация прогресса — показываем 100% перед закрытием
                    if (loadingMsg.parentNode) {
                        const finalBar = document.getElementById('multiSheetProgressBar');
                        const finalPercent = document.getElementById('multiSheetProgressPercent');
                        const finalProgress = document.getElementById('multiSheetProgress');
                        const finalTime = document.getElementById('progressTime');
                        if (finalBar) {
                            finalBar.style.width = '100%';
                            finalBar.style.background = 'linear-gradient(90deg, #00cc66, #00ff88)';
                            finalBar.style.boxShadow = '0 0 16px rgba(0,255,136,0.6)';
                        }
                        if (finalPercent) finalPercent.textContent = '100%';
                        if (finalProgress) finalProgress.textContent = 'Готово!';
                        if (finalTime) finalTime.textContent = 'завершено';
                        // Даём пользователю увидеть 100% перед закрытием
                        await new Promise(resolve => setTimeout(resolve, 400));
                        document.body.removeChild(loadingMsg);
                    }

                    // Финализация: показываем результат раскладки
                    function showNestingResult() {
                        window.allSheets = allSheets;
                        window.currentSheetIndex = 0;
                        nestedParts = allSheets[0].nestedParts;
                        if (typeof syncGlobalsToStore === 'function') syncGlobalsToStore();
                        showSheetView = true;
                        const showSheetBtn = document.getElementById('showSheet');
                        if (showSheetBtn) showSheetBtn.textContent = '👁️ Скрыть лист';

                        ['markupRectTools', 'cutRemnantTools', 'rulerTools', 'overlapTools'].forEach(id => {
                            const el = document.getElementById(id);
                            if (el) el.style.display = 'block';
                        });

                        updateSheetNavigation();
                        render();
                        updatePartsList();
                    }

                    // Если отменено - показываем сообщение
                    if (isMultiNestingCancelled) {
                        if (allSheets.length > 0) {
                            showNestingResult();
                            alert(`⚠️ Раскладка прервана!\n\nРазмещено листов: ${allSheets.length}\nОсталось деталей: ${unplacedPartsCount}`);
                        } else {
                            alert('⚠️ Раскладка прервана пользователем');
                        }
                        return;
                    }

                    if (allSheets.length === 0) {
                        alert('❌ Не удалось разместить детали');
                        return;
                    }

                    // Нормальное завершение
                    showNestingResult();
                    saveState();

                    // v4.40: Включаем allowOverlap после успешной раскладки.
                    // По умолчанию (до раскладки) — ВЫКЛ.
                    // После раскладки — ВКЛ, чтобы пользователь мог вручную
                    // двигать/выравнивать детали (bbox могут перекрываться,
                    // но реальный материал защищён через gridsOverlap/polygonsIntersect
                    // с Math.max(0, minGap)).
                    allowOverlap = true;
                    window.allowOverlap = true;
                    console.log('✅ allowOverlap включён после успешной раскладки');

                    if (typeof LicenseManager !== 'undefined' && LicenseManager.isTrial()) {
                        LicenseManager.incrementNestingCount();
                    }

                    const totalNestedParts = allSheets.reduce((sum, sheet) => sum + sheet.nestedParts.length, 0);
                    console.log(`Раскладка завершена: ${allSheets.length} листов, ${totalNestedParts} деталей`);

                    if (allSheets.length > 0) {
                        setTimeout(() => {
                            if (typeof playSuccessSound === 'function') playSuccessSound();
                        }, 300);
                    }

                } catch (e) {
                    if (loadingMsg && loadingMsg.parentNode) {
                        document.body.removeChild(loadingMsg);
                    }
                    alert('❌ Ошибка при раскладке: ' + e.message);
                    console.error(e);
                } finally {
                    // v4.37 FIX U1: снимаем disabled только здесь, когда раскладка
                    // действительно завершена (включая setTimeout). Раньше внешний
                    // finally сбрасывал флаг до запуска setTimeout → race condition.
                    if (btn) btn.disabled = false;
                }
            }, 100);

            } finally {
                // v4.37 FIX U1: если раскладка НЕ дошла до setTimeout (early-return
                // из-за trial limit / no parts / validation error / исключения),
                // снимаем disabled здесь. Если дошла — nestingStarted=true,
                // и внутренний finally setTimeout сам снимет disabled по завершении.
                if (!nestingStarted && btn) btn.disabled = false;
            }
        });