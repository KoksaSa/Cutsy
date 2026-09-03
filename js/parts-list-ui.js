// ═══════════════════════════════════════════════════════════
// parts-list-ui.js — ИСПРАВЛЕННАЯ ВЕРСИЯ
// Критические и серьёзные баги устранены
// ═══════════════════════════════════════════════════════════

function samePartId(a, b) {
    // [FIX #9] Защита от null → совпадает с id=0
    if (a === null || a === undefined || b === null || b === undefined) return false;
    return Number(a) === Number(b);
}

// ═══════════════════════════════════════════════════════════
// Экранирование HTML для защиты от XSS
// ═══════════════════════════════════════════════════════════
function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Флаг защиты от рекурсивного вызова updatePartsList
let isUpdatingPartsList = false;

// [FIX #2] Защита от двойного вызова viewPart
let _viewingPart = false;

/**
 * Генерация компактной SVG-миниатюры детали для списка
 * @param {Object} part - Объект детали
 * @returns {string} SVG HTML
 */
function generatePartThumbnailMini(part) {
    if (!part || !part.objects || part.objects.length === 0) return '';

    const bounds = part.bounds;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return '';

    const pad = Math.max(bounds.width, bounds.height) * 0.08;
    const vw = bounds.width + pad * 2;
    const vh = bounds.height + pad * 2;
    const W = 40, H = 30;
    const scale = Math.min(W / vw, H / vh);
    const ox = (W - vw * scale) / 2;
    const oy = (H - vh * scale) / 2;

    const colors = ['#4a90d9','#d94a4a','#4ad97a','#d9c44a','#9a4ad9','#4ad9c4','#d97a4a'];
    const color = colors[Math.abs(Math.round(Number(part.id) * 1000)) % colors.length];
    const sw = 1.0;

    let svgContent = '';
    part.objects.forEach(obj => {
        if (obj.type === 'line') {
            const x1 = ox + (obj.x1 - bounds.minX + pad) * scale;
            const y1 = oy + (obj.y1 - bounds.minY + pad) * scale;
            const x2 = ox + (obj.x2 - bounds.minX + pad) * scale;
            const y2 = oy + (obj.y2 - bounds.minY + pad) * scale;
            svgContent += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${sw}"/>`;
        } else if (obj.type === 'circle') {
            const cx = ox + (obj.cx - bounds.minX + pad) * scale;
            const cy = oy + (obj.cy - bounds.minY + pad) * scale;
            const r = (obj.radius || 0) * scale;
            svgContent += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
        } else if (obj.type === 'rect') {
            const rawW = (obj.width || 0) * scale;
            const rawH = (obj.height || 0) * scale;
            const w = Math.abs(rawW);
            const h = Math.abs(rawH);
            let x = ox + (obj.x - bounds.minX + pad) * scale;
            let y = oy + (obj.y - bounds.minY + pad) * scale;
            if (rawW < 0) x -= w;
            if (rawH < 0) y -= h;
            svgContent += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
        } else if (obj.type === 'polygon') {
            const pts = (typeof obj.getPoints === 'function' ? obj.getPoints() :
                        (obj.points || obj.vertices || [])).map(p => {
                const px = ox + (p.x - bounds.minX + pad) * scale;
                const py = oy + (p.y - bounds.minY + pad) * scale;
                return `${px.toFixed(1)},${py.toFixed(1)}`;
            }).join(' ');
            if (pts) svgContent += `<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
        } else if (obj.type === 'arc') {
            const acx = obj.cx || 0;
            const acy = obj.cy || 0;
            const r = Math.abs(obj.radius || 0);
            const startAngle = obj.startAngle ?? 0;
            const endAngle = obj.endAngle ?? (2 * Math.PI);
            const isCCW = obj.direction === 'CCW' || obj.direction === 1 || obj.direction === true;

            let sweepAngle;
            if (isCCW) {
                sweepAngle = endAngle - startAngle;
                if (sweepAngle <= 0) sweepAngle += 2 * Math.PI;
            } else {
                sweepAngle = startAngle - endAngle;
                if (sweepAngle <= 0) sweepAngle += 2 * Math.PI;
            }

            const segments = Math.max(12, Math.ceil(sweepAngle * 10));
            const dirSign = isCCW ? 1 : -1;
            const step = sweepAngle / segments;
            const arcPoints = [];
            for (let i = 0; i <= segments; i++) {
                const angle = startAngle + dirSign * step * i;
                const px = ox + (acx + r * Math.cos(angle) - bounds.minX + pad) * scale;
                const py = oy + (acy + r * Math.sin(angle) - bounds.minY + pad) * scale;
                arcPoints.push(`${px.toFixed(1)},${py.toFixed(1)}`);
            }

            if (arcPoints.length >= 2) {
                const pts = arcPoints.join(' ');
                svgContent += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${sw}" style="stroke-linecap:round;stroke-linejoin:round"/>`;
            }
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const vertices = (obj.points || obj.vertices || []);
            if (vertices.length > 1) {
                const pts = vertices.map(p => {
                    const px = ox + (p.x - bounds.minX + pad) * scale;
                    const py = oy + (p.y - bounds.minY + pad) * scale;
                    return `${px.toFixed(1)},${py.toFixed(1)}`;
                }).join(' ');
                svgContent += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
            }
        }
        // [FIX #7] Отрисовка текста в миниатюре
        else if (obj.type === 'text') {
            const tx = ox + ((obj.x || 0) - bounds.minX + pad) * scale;
            const ty = oy + ((obj.y || 0) - bounds.minY + pad) * scale;
            const fontSize = Math.max(4, (obj.fontSize || 12) * scale);
            const safeText = escapeHtml(obj.text || '').substring(0, 20);
            svgContent += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="${color}" font-size="${fontSize.toFixed(1)}">${safeText}</text>`;
        }
    });

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="background:#1a1a2a;border:1px solid #333;border-radius:3px;flex-shrink:0;">${svgContent}</svg>`;
}

// Обновление списка деталей (компактный дизайн + чекбоксы для раскладки)
function updatePartsList() {
    // Защита от рекурсивного вызова
    if (isUpdatingPartsList) return;
    isUpdatingPartsList = true;

    try {
        const list = document.getElementById('partsList');
        if (!list) {
            void 0;
            return;
        }

        if (parts.length === 0) {
            list.innerHTML = '<div style="color:#666;padding:15px;text-align:center;font-size:12px;">Нажмите в пустое место окна что бы добавить деталь</div>';
            if (typeof saveToCache === 'function') saveToCache();
            return;
        }

        // [FIX #8] Экранируем part.id для использования в HTML-атрибутах
        list.innerHTML = parts.map((part, idx) => {
            // Считаем сколько деталей этой детали размещено на ВСЕХ листах
            let totalPlacedCount = 0;
            if (window.allSheets && window.allSheets.length > 0) {
                window.allSheets.forEach(sheet => {
                    totalPlacedCount += sheet.nestedParts.filter(n => samePartId(n.partId, part.id)).length;
                });
            } else {
                totalPlacedCount = nestedParts.filter(n => samePartId(n.partId, part.id)).length;
            }
            const isPlaced = totalPlacedCount > 0;
            const isFullyPlaced = totalPlacedCount >= part.quantity;
            const statusColor = isFullyPlaced ? '#2d7d2d' : '#ffa500';

            const isSelected = selectedNestedParts.some(idx => nestedParts[idx] && samePartId(nestedParts[idx].partId, part.id));
    const isNestingEnabled = part.nestingEnabled !== false;
    const isVisible = part.visible === true;
    const noRotate = part.noRotate === true;
    const allowedAngles = part.allowedAngles || [];

            // [FIX #8 + #13] Экранируем имя и ID детали от XSS
            const safeName = escapeHtml(part.name || `Деталь #${part.id}`);
            const safeId = escapeHtml(String(part.id));

            // [FIX #19] Используем ?? вместо || для толщины (0 → 0, а не 0.8)
            const thicknessDisplay = part.thickness != null ? part.thickness : 0.8;
            const spacingDisplay = part.spacing != null ? part.spacing : 3;

            return `
        <div class="part-card" data-part-id="${safeId}" style="padding:8px;margin-bottom:6px;background:${isSelected ? '#1a3a52' : '#252526'};border-radius:4px;border:2px solid ${isSelected ? '#00aaff' : '#3c3c3c'};cursor:pointer;">
            <!-- Строка 1: Чекбокс, название и миниатюра -->
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                <input type="checkbox"
                    class="nesting-checkbox"
                    data-part-id="${safeId}"
                    ${isNestingEnabled ? 'checked' : ''}
                    title="Раскладывать эту деталь"
                    onclick="event.stopPropagation();"
                    style="width:16px;height:16px;cursor:pointer;flex-shrink:0;">
                <span class="part-name" data-part-id="${safeId}" style="color:#007acc;font-weight:bold;font-size:13px;cursor:pointer;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="Кликните для редактирования названия">${safeName}</span>
                ${generatePartThumbnailMini(part)}
            </div>
            <!-- Строка 2: Отступ и кнопки -->
            <div style="display:flex;align-items:center;gap:4px;">
                <div style="display:flex;align-items:center;gap:4px;flex:1;">
                    <span style="color:#aaa;font-size:11px;">Отступ:</span>
                    <input type="number" class="part-spacing-input" data-part-id="${safeId}"
                        value="${spacingDisplay}" min="-100" max="100" step="0.1"
                        style="width:50px;min-width:0;flex-shrink:0;padding:2px 4px;background:#2a2a2a;color:#007acc;
                        border:1px solid #555;border-radius:3px;font-size:11px;font-weight:bold;"
                        title="Отрицательное значение = перекрытие деталей"
                        onclick="event.stopPropagation();">
                    <span style="color:#aaa;font-size:11px;">мм</span>
                </div>
                <button onclick="viewPart(${Number(part.id)}); event.stopPropagation();" style="background:${isVisible ? '#2d7d2d' : '#007acc'};color:#fff;border:none;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;" title="${isVisible ? 'Скрыть деталь' : 'Показать деталь'}">${isVisible ? '✓' : '👁️'}</button>
                <button onclick="deletePart(${Number(part.id)}); event.stopPropagation();" style="background:#c72e2e;color:#fff;border:none;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;">&#10005;</button>
            </div>
            <div style="color:#888;font-size:11px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                <span>${part.bounds.width.toFixed(2)} x ${part.bounds.height.toFixed(2)} мм | ${part.objects.length} об.</span>
                <span style="color:#aaa;">|</span>
                <input type="number" class="part-thickness-input" data-part-id="${safeId}" value="${thicknessDisplay}" min="0.1" max="50" step="0.1"
                    style="width:60px;padding:2px 4px;background:#2a2a2a;color:#007acc;border:1px solid #555;border-radius:3px;font-size:11px;font-weight:bold;"
                    title="Толщина металла (мм)"
                    onclick="event.stopPropagation();"
                    onfocus="event.stopPropagation();"
                    oninput="event.stopPropagation();"
                    onwheel="event.preventDefault(); event.stopPropagation();">
                <span style="color:#007acc;font-size:11px;">мм</span>
            </div>

            <!-- Чекбокс "Не вращать" -->
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:6px;background:#1e1e1e;border-radius:4px;">
                <input type="checkbox"
                    id="norotate-${safeId}"
                    ${noRotate ? 'checked' : ''}
                    onclick="toggleNoRotate(${Number(part.id)}); event.stopPropagation();"
                    style="width:16px;height:16px;cursor:pointer;">
                <label for="norotate-${safeId}"
                    style="color:#aaa;font-size:11px;cursor:pointer;"
                    onclick="event.stopPropagation();"
                    title="Если включено: деталь не будет вращаться при раскладке (только 0)">
                    Не вращать
                </label>
            </div>

            <!-- Углы раскладки -->
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:6px;background:${allowedAngles.length > 0 ? '#2a1a00' : '#1e1e1e'};border-radius:4px;flex-wrap:wrap;border:${allowedAngles.length > 0 ? '1px solid #ff8800' : 'none'};">
                <span style="color:#aaa;font-size:11px;cursor:pointer;" title="Выберите углы для раскладки (пусто - авто)">Углы:</span>
                ${[45, 90, 135, 180].map(a => `
                    <label style="display:flex;align-items:center;gap:2px;cursor:pointer;${noRotate ? 'opacity:0.4;pointer-events:none;' : ''}">
                        <input type="checkbox"
                            id="angle-${a}-${safeId}"
                            ${allowedAngles.includes(a) ? 'checked' : ''}
                            onclick="toggleAllowedAngle(${Number(part.id)}, ${a}); event.stopPropagation();"
                            style="width:14px;height:14px;cursor:pointer;">
                        <span style="color:${allowedAngles.includes(a) ? '#ff8800' : '#888'};font-size:10px;font-weight:${allowedAngles.includes(a) ? 'bold' : 'normal'};">${a}</span>
                    </label>
                `).join('')}
                ${allowedAngles.length > 0
                    ? `<span style="color:#ff8800;font-size:9px;font-weight:bold;background:#3a2200;padding:1px 4px;border-radius:3px;">РУЧН ${allowedAngles.join(',')}</span><span style="color:#ff6666;font-size:9px;cursor:pointer;text-decoration:underline;" onclick="resetAllowedAngles(${Number(part.id)}); event.stopPropagation();" title="Сбросить углы">сброс</span>`
                    : (noRotate ? '' : '<span style="color:#555;font-size:10px;font-style:italic;">авто</span>')}
            </div>

            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="color:#aaa;font-size:11px;">Кол-во:</span>
                <input type="number" value="${part.quantity}" min="1" max="9999"
                    data-part-id="${safeId}"
                    style="width:70px;padding:4px 6px;background:#007acc;color:#fff;border:none;border-radius:4px;text-align:center;font-size:13px;font-weight:bold;"
                    onclick="event.stopPropagation();"
                    onwheel="event.stopPropagation();">
            </div>
            ${isPlaced ? `<div style="color:${statusColor};font-size:10px;">Размещено деталей: ${totalPlacedCount} шт ${!isFullyPlaced ? `(из ${part.quantity})` : ''}</div>` : '<div style="color:#666;font-size:10px;">Не размещено</div>'}
        </div>
    `}).join('');

        // Обработчики чекбоксов раскладки
        list.querySelectorAll('.nesting-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                const partId = checkbox.dataset.partId;
                const part = parts.find(p => samePartId(p.id, partId));
                if (!part) return;

                if (typeof saveState === 'function') saveState();

                part.nestingEnabled = checkbox.checked;
                void 0;
                updatePartsList();

                // ─── АВТОРАСКЛАДКА — если включена ───────────────
                const autoNestingCheckbox = document.getElementById('autoNestingCheckbox');
                if (autoNestingCheckbox && autoNestingCheckbox.checked) {
                    void 0;
                    setTimeout(async () => {
                        try {
                            const nestBtn = document.getElementById('nestMultiParts');
                            if (nestBtn && typeof nestBtn.onclick === 'function') {
                                nestBtn.onclick();
                            } else if (nestBtn) {
                                nestBtn.dispatchEvent(new MouseEvent('click'));
                            }
                        } catch (err) {
                            console.error('❌ Ошибка авторасскладки:', err);
                        }
                    }, 500);
                }
            });
        });

        // Обработчик клика на карточку детали - выделение на листе
        list.querySelectorAll('.part-card').forEach(cardEl => {
            cardEl.addEventListener('click', (e) => {
                // Игнорируем клики по инпутам
                if (e.target.tagName === 'INPUT' || e.target.closest('input')) return;

                // Если кликнули по названию - редактируем
                if (e.target.classList.contains('part-name')) {
                    e.stopPropagation();
                    const partId = e.target.dataset.partId;
                    const part = parts.find(p => samePartId(p.id, partId));
                    if (!part) return;

                    const newName = prompt('Введите новое название детали:', part.name || `Деталь #${part.id}`);
                    if (newName !== null && newName.trim() !== '') {
                        if (typeof saveState === 'function') saveState();
                        part.name = newName.trim();
                        updatePartsList();
                        if (typeof render === 'function') render();
                    }
                    return;
                }

                // Клик по карточке - выделение всех деталей на листе
                const partId = cardEl.dataset.partId;

                if (typeof showSheetView !== 'undefined' && showSheetView) {
                    selectedNestedParts = [];
                    nestedParts.forEach((nested, idx) => {
                        if (samePartId(nested.partId, partId)) {
                            selectedNestedParts.push(idx);
                        }
                    });

                    if (selectedNestedParts.length > 0) {
                        if (typeof render === 'function') render();
                        updatePartsList();
                        const countEl = document.getElementById('nestedSelectedCount');
                        const infoEl = document.getElementById('nestedSelectInfo');
                        if (countEl) countEl.textContent = `Выделено деталей: ${selectedNestedParts.length}`;
                        if (infoEl) infoEl.style.display = 'flex';
                    }
                }
            });
        });

        // [FIX #12] Валидация quantity при изменении
        list.querySelectorAll('input[type="number"]').forEach(input => {
            if (input.classList.contains('part-spacing-input')) return;
            if (input.classList.contains('part-thickness-input')) return;

            input.addEventListener('change', (e) => {
                const partId = e.target.dataset.partId;
                const part = parts.find(p => samePartId(p.id, partId));
                if (part) {
                    let qty = parseInt(e.target.value, 10);
                    // Валидация: от 1 до 9999
                    if (isNaN(qty) || qty < 1) qty = 1;
                    if (qty > 9999) qty = 9999;
                    e.target.value = qty;

                    if (typeof saveState === 'function') saveState();
                    part.quantity = qty;
                    if (typeof saveToCache === 'function') saveToCache();
                    void 0;

                    // ─── АВТОРАСКЛАДКА — если включена ───────────────
                    const autoNestingCheckbox = document.getElementById('autoNestingCheckbox');
                    if (autoNestingCheckbox && autoNestingCheckbox.checked) {
                        void 0;
                        setTimeout(async () => {
                            try {
                                const nestBtn = document.getElementById('nestMultiParts');
                                if (nestBtn && typeof nestBtn.onclick === 'function') {
                                    nestBtn.onclick();
                                } else if (nestBtn) {
                                    nestBtn.dispatchEvent(new MouseEvent('click'));
                                }
                            } catch (err) {
                                console.error('❌ Ошибка авторасскладки:', err);
                            }
                        }, 500);
                    }
                } else {
                    console.error('[updatePartsList] Деталь не найдена:', partId);
                }
            });
            input.addEventListener('click', (e) => e.target.select());
        });

        // Единый обработчик для толщины
        list.querySelectorAll('.part-thickness-input').forEach(input => {
            input.addEventListener('change', (e) => {
                e.stopPropagation();
                const partId = e.target.dataset.partId;
                const part = parts.find(p => samePartId(p.id, partId));
                if (!part) return;

                const thickness = parseFloat(e.target.value);
                // [FIX #19] Корректная проверка: 0 — невалидная толщина, но NaN тоже
                if (isNaN(thickness) || thickness < 0.1 || thickness > 50) {
                    e.target.value = part.thickness != null ? part.thickness : 0.8;
                    return;
                }

                if (typeof saveState === 'function') saveState();
                part.thickness = thickness;
                if (typeof saveToCache === 'function') saveToCache();
                void 0;
                updatePartsList();
            });
            input.addEventListener('click', (e) => {
                e.stopPropagation();
                e.target.select();
            });
        });

        // Единый обработчик для отступа
        list.querySelectorAll('.part-spacing-input').forEach(input => {
            input.addEventListener('change', (e) => {
                e.stopPropagation();
                const partId = e.target.dataset.partId;
                const part = parts.find(p => samePartId(p.id, partId));
                if (!part) return;

                const spacing = parseFloat(e.target.value);
                if (isNaN(spacing) || spacing < -100 || spacing > 100) {
                    e.target.value = part.spacing != null ? part.spacing : 3;
                    return;
                }

                if (typeof saveState === 'function') saveState();
                part.spacing = spacing;
                if (typeof saveToCache === 'function') saveToCache();
                void 0;
                updatePartsList();

                // ─── АВТОРАСКЛАДКА — если включена ───────────────
                const autoNestingCheckbox = document.getElementById('autoNestingCheckbox');
                if (autoNestingCheckbox && autoNestingCheckbox.checked) {
                    void 0;
                    setTimeout(async () => {
                        try {
                            const nestBtn = document.getElementById('nestMultiParts');
                            if (nestBtn && typeof nestBtn.onclick === 'function') {
                                nestBtn.onclick();
                            } else if (nestBtn) {
                                nestBtn.dispatchEvent(new MouseEvent('click'));
                            }
                        } catch (err) {
                            console.error('❌ Ошибка авторасскладки:', err);
                        }
                    }, 500);
                }
            });
            input.addEventListener('click', (e) => {
                e.stopPropagation();
                e.target.select();
            });
        });

        // Сохраняем в кэш при каждом обновлении списка
        if (typeof saveToCache === 'function') saveToCache();

        // Обновляем список толщин
        updateThicknessFilter();

    } finally {
        isUpdatingPartsList = false;
    }
}

// ═══════════════════════════════════════════════════════════════
// ФИЛЬТР ПО ТОЛЩИНЕ
// ═══════════════════════════════════════════════════════════════

function updateThicknessFilter() {
    const select = document.getElementById('thicknessFilter');
    if (!select) return;

    const thicknesses = new Set();
    parts.forEach(part => {
        if (part.thickness != null) {
            thicknesses.add(parseFloat(part.thickness));
        }
    });

    const currentValue = select.value;

    select.innerHTML = '<option value="all">Все толщины</option>';
    const sortedThicknesses = Array.from(thicknesses).sort((a, b) => a - b);

    sortedThicknesses.forEach(thickness => {
        const option = document.createElement('option');
        option.value = thickness;
        option.textContent = `${thickness} мм`;
        select.appendChild(option);
    });

    if (thicknesses.has(parseFloat(currentValue))) {
        select.value = currentValue;
    }
}

// Инициализация обработчиков фильтра толщин
(function initThicknessFilter() {
    const select = document.getElementById('thicknessFilter');
    if (select) {
        select.addEventListener('change', (e) => {
            const selectedThickness = e.target.value;
            if (selectedThickness === 'all') return;

            const thickness = parseFloat(selectedThickness);

            parts.forEach(part => {
                if (Math.abs(part.thickness - thickness) < 0.001) {
                    part.nestingEnabled = true;
                } else {
                    part.nestingEnabled = false;
                }
            });

            updatePartsList();
            void 0;
        });
    }

    const selectAllBtn = document.getElementById('selectAllThickness');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            parts.forEach(part => { part.nestingEnabled = true; });
            updatePartsList();
            if (select) select.value = 'all';
        });
    }

    const deselectAllBtn = document.getElementById('deselectAllThickness');
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => {
            parts.forEach(part => { part.nestingEnabled = false; });
            updatePartsList();
            if (select) select.value = 'all';
        });
    }
})();

// ═══════════════════════════════════════════════════════════════
// Просмотр детали (вкл/выкл видимость на холсте)
// [FIX #1] saveState вызывается ПОСЛЕ проверки, а не до
// [FIX #2] Защита от двойного вызова через _viewingPart
// ═══════════════════════════════════════════════════════════════
window.viewPart = function(partId) {
    // [FIX #2] Защита от двойного вызова
    if (_viewingPart) {
        void 0;
        return;
    }
    _viewingPart = true;

    try {
        const part = parts.find(p => samePartId(p.id, partId));
        if (!part) {
            console.error(`[viewPart] Деталь #${partId} не найдена`);
            return;
        }

        // Если выключаем видимость детали
        if (part.visible) {
            // [FIX #1] saveState вызываем ПОСЛЕ проверки — нечего откатывать
            if (typeof saveState === 'function') saveState();

            void 0;

            const objectsToRemove = new Set(part.objects);
            const beforeCount = objects.length;
            objects = objects.filter(obj => !objectsToRemove.has(obj));
            selectedObjects = selectedObjects.filter(obj => !objectsToRemove.has(obj));
            void 0;
        }
        // Если включаем видимость детали
        else {
            // Проверяем: сколько деталей сейчас видно
            const visibleParts = parts.filter(p => p.visible === true);

            if (visibleParts.length > 0) {
                // [FIX #1] saveState НЕ вызывался — нечего откатывать!
                // Не нужно делать undoStack.pop()
                void 0;
                alert(`Внимание!\n\nУже показана деталь #${visibleParts[0].id} "${visibleParts[0].name}".\n\nСначала скройте другую деталь, затем показывайте эту.`);
                return;
            }

            // [FIX #1] Только теперь сохраняем состояние — после всех проверок
            if (typeof saveState === 'function') saveState();

            void 0;

            // Удаляем объекты детали по ссылке
            const objectsToRemove = new Set(part.objects);
            objects = objects.filter(obj => !objectsToRemove.has(obj));
            selectedObjects = selectedObjects.filter(obj => !objectsToRemove.has(obj));

            // Показываем объекты детали на холсте
            part.objects.forEach(obj => {
                objects.push(obj);
            });
            void 0;
        }

        part.visible = !part.visible;

        // Синхронизируем переменные редактирования
        isEditingPart = part.visible;
        editingPartId = part.visible ? partId : null;
        if (typeof window !== 'undefined') {
            window.isEditingPart = isEditingPart;
            window.editingPartId = editingPartId;
        }

        // Обновляем UI
        updatePartsList();
        if (typeof render === 'function') render();

    } finally {
        // [FIX #2] Снимаем блокировку в любом случае
        _viewingPart = false;
    }
};

// ═══════════════════════════════════════════════════════════════
// Удаление детали
// [FIX #3] Очистка nestedParts и allSheets от фантомов
// ═══════════════════════════════════════════════════════════════
window.deletePart = function(partId) {
    const part = parts.find(p => samePartId(p.id, partId));
    if (part) {
        if (typeof saveState === 'function') saveState();

        // Если деталь видима, удаляем её объекты с холста
        if (part.visible) {
            const objectsToRemove = new Set(part.objects);
            objects = objects.filter(obj => !objectsToRemove.has(obj));
            selectedObjects = selectedObjects.filter(obj => !objectsToRemove.has(obj));
        }

        // [FIX #3] Удаляем из nestedParts — убираем фантомы
        const beforeNested = nestedParts.length;
        nestedParts = nestedParts.filter(n => !samePartId(n.partId, partId));
        const removedNested = beforeNested - nestedParts.length;
        if (removedNested > 0) {
            void 0;
        }

        // [FIX #3] Удаляем из allSheets
        if (window.allSheets && window.allSheets.length > 0) {
            let totalRemovedFromSheets = 0;
            window.allSheets.forEach(sheet => {
                const before = sheet.nestedParts.length;
                sheet.nestedParts = sheet.nestedParts.filter(n => !samePartId(n.partId, partId));
                totalRemovedFromSheets += before - sheet.nestedParts.length;
            });
            if (totalRemovedFromSheets > 0) {
                void 0;
            }
        }

        // [FIX #3] Очищаем выделение, если удалённая деталь была выделена
        selectedNestedParts = selectedNestedParts.filter(idx => {
            const nested = nestedParts[idx];
            return nested && !samePartId(nested.partId, partId);
        });
    }

    parts = parts.filter(p => !samePartId(p.id, partId));

    if (typeof saveToCache === 'function') saveToCache();

    updatePartsList();
    if (typeof render === 'function') render();

    void 0;
};

// Изменение толщины детали
window.changePartThickness = function(partId, value) {
    const part = parts.find(p => samePartId(p.id, partId));
    if (!part) return;
    const newTh = parseFloat(value);
    if (isNaN(newTh) || newTh < 0.1) return;

    if (typeof saveState === 'function') saveState();

    part.thickness = newTh;
    if (typeof saveToCache === 'function') saveToCache();
    updatePartsList();
};

// Изменение отступа между деталями
window.changePartSpacing = function(partId, value) {
    const part = parts.find(p => samePartId(p.id, partId));
    if (!part) {
        console.error(`[changePartSpacing] Деталь #${partId} не найдена`);
        return;
    }
    const spacing = parseFloat(value);

    if (isNaN(spacing) || spacing < -100 || spacing > 100) {
        void 0;
        updatePartsList();
        return;
    }

    if (typeof saveState === 'function') saveState();

    part.spacing = spacing;
    if (typeof saveToCache === 'function') saveToCache();
    void 0;
    updatePartsList();
};

// ═══════════════════════════════════════════════════════════════
// ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ
// ═══════════════════════════════════════════════════════════════

window.toggleNoRotate = function(partId) {
    const part = parts.find(p => samePartId(p.id, partId));
    if (!part) return;

    if (typeof saveState === 'function') saveState();
    part.noRotate = !part.noRotate;
    void 0;

    if (typeof saveToCache === 'function') saveToCache();
    updatePartsList();
};

window.toggleAllowedAngle = function(partId, angle) {
    const part = parts.find(p => samePartId(p.id, partId));
    if (!part) return;

    if (typeof saveState === 'function') saveState();

    if (!part.allowedAngles) part.allowedAngles = [];

    const idx = part.allowedAngles.indexOf(angle);
    if (idx >= 0) {
        part.allowedAngles.splice(idx, 1);
    } else {
        part.allowedAngles.push(angle);
        part.allowedAngles.sort((a, b) => a - b);
    }

    void 0;

    if (typeof saveToCache === 'function') saveToCache();
    updatePartsList();

    // ─── АВТОРАСКЛАДКА — если включена ───────────────
    const autoNestingCheckbox = document.getElementById('autoNestingCheckbox');
    if (autoNestingCheckbox && autoNestingCheckbox.checked) {
        void 0;
        setTimeout(async () => {
            try {
                const nestBtn = document.getElementById('nestMultiParts');
                if (nestBtn && typeof nestBtn.onclick === 'function') {
                    nestBtn.onclick();
                } else if (nestBtn) {
                    nestBtn.dispatchEvent(new MouseEvent('click'));
                }
            } catch (err) {
                console.error('❌ Ошибка авторасскладки:', err);
            }
        }, 500);
    }
};

window.resetAllowedAngles = function(partId) {
    const part = parts.find(p => samePartId(p.id, partId));
    if (!part) return;

    if (typeof saveState === 'function') saveState();

    part.allowedAngles = [];
    void 0;

    if (typeof saveToCache === 'function') saveToCache();
    updatePartsList();

    // ─── АВТОРАСКЛАДКА — если включена ───────────────
    const autoNestingCheckbox = document.getElementById('autoNestingCheckbox');
    if (autoNestingCheckbox && autoNestingCheckbox.checked) {
        void 0;
        setTimeout(async () => {
            try {
                const nestBtn = document.getElementById('nestMultiParts');
                if (nestBtn && typeof nestBtn.onclick === 'function') {
                    nestBtn.onclick();
                } else if (nestBtn) {
                    nestBtn.dispatchEvent(new MouseEvent('click'));
                }
            } catch (err) {
                console.error('❌ Ошибка авторасскладки:', err);
            }
        }, 500);
    }
};

// ═══════════════════════════════════════════════════════════════
// ОБНОВЛЕНИЕ ГРАНИЦ ДЕТАЛИ
// ═══════════════════════════════════════════════════════════════
window.updatePartBounds = function(part) {
    if (!part || !part.objects) return;

    const newBounds = calculateBounds(part.objects);

    part.bounds = {
        minX: newBounds.minX,
        minY: newBounds.minY,
        maxX: newBounds.maxX,
        maxY: newBounds.maxY,
        width: newBounds.width,
        height: newBounds.height
    };
};

window.findPartForObject = function(obj) {
    for (const part of parts) {
        if (part.objects && part.objects.includes(obj)) {
            return part;
        }
    }
    return null;
};