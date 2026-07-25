// ═══════════════════════════════════════════════════════════════
// ЭКСПОРТ РАСКЛАДКИ В DXF (С ГРУППИРОВКОЙ ПО ЛИСТАМ)
// ═══════════════════════════════════════════════════════════════

// Функция транслитерации для имён слоёв DXF
function transliterate(word) {
    const c = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i',
        'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
        'у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'',
        'э':'e','ю':'yu','я':'ya'
    };
    return word.split('').map(ch => /[0-9a-zA-Z]/.test(ch) ? ch : (c[ch.toLowerCase()]||'_')).join('');
}

function exportSheetToDXF() {
    // 🔒 Блокировка экспорта для пробного тарифа
    if (typeof LicenseManager !== 'undefined' && LicenseManager.isTrial()) {
        if (typeof LicenseManager.showUpgradeModal === 'function') {
            LicenseManager.showUpgradeModal('exportDxf');
        } else {
            alert('🔧 Экспорт DXF недоступен в пробном периоде. Купите тариф для доступа к экспорту.');
        }
        return;
    }

    // Сохраняем текущие детали в allSheets перед экспортом
    if (window.allSheets && window.allSheets.length > 0 && window.currentSheetIndex >= 0) {
        window.allSheets[window.currentSheetIndex].nestedParts = [...nestedParts];
        window.allSheets[window.currentSheetIndex].markupRects = [...(window.markupRects || markupRects || [])];
    }

    console.log(`📤 [ЭКСПОРТ DXF] nestedParts.length=${nestedParts.length}, allSheets.length=${(window.allSheets||[]).length}`);
    console.log(`   nestedParts:`, nestedParts.slice(0, 3));
    if (window.allSheets) {
        window.allSheets.forEach((s, i) => {
            console.log(`   Лист ${i+1}: ${s.nestedParts.length} дет.`);
        });
    }

    // ═══════════════════════════════════════════════════════════
    // ОБЪЕДИНЕНИЕ СОПРИКАСАЮЩИХСЯ ДЕТАЛЕЙ (spacing=0)
    // ═══════════════════════════════════════════════════════════
    let mergedParts = nestedParts;
    let mergedGroups = null;
    
    if (typeof findAndMergeTouchingParts === 'function' && nestedParts.length > 0) {
        // Собираем определения деталей для проверки spacing
        const partDefs = {};
        const globalParts = (typeof parts !== 'undefined') ? parts : (window.parts || []);
        if (Array.isArray(globalParts)) {
            globalParts.forEach(p => { partDefs[p.id] = p; });
        }
        
        // Добавляем spacing к каждой размещённой детали
        const partsWithSpacing = nestedParts.map(n => {
            const part = partDefs[n.partId] || {};
            return {
                ...n,
                spacing: typeof part.spacing === 'number' ? part.spacing : 3
            };
        });
        
        // Находим группы соприкасающихся деталей
        mergedGroups = findAndMergeTouchingParts(partsWithSpacing);
        
        // Проверяем, есть что объединять
        const hasMerges = mergedGroups.some(g => g.length > 1);
        if (hasMerges) {
            // Создаём объединённые детали для экспорта
            const originalPartsMap = new Map(nestedParts.map(n => [n, null]));
            nestedParts.forEach((n, i) => originalPartsMap.set(n, i));
            
            mergedParts = [];
            for (const group of mergedGroups) {
                if (group.length === 1) {
                    mergedParts.push(group[0]);
                } else {
                    // Объединяем детали в одну
                    const merged = {
                        ...group[0],
                        name: group.map(g => g.name || `Деталь`).join(' + '),
                        isMerged: true,
                        mergedGroup: group,
                        objects: group.flatMap(g => g.objects || [])
                    };
                    mergedParts.push(merged);
                    console.log(`[MERGE] Объединена группа из ${group.length} деталей: "${merged.name}"`);
                }
            }
            console.log(`[MERGE] Экспорт: ${nestedParts.length} деталей → ${mergedParts.length} (объединено групп)`);
        }
    }

    // Проверяем, есть ли несколько листов
    if ((window.allSheets||[]).length > 1) {
        exportAllSheetsToDXF(window.allSheets);
        return;
    }

    if (nestedParts.length === 0) {
        alert('⚠️ Нет деталей для экспорта');
        return;
    }

    const currentSheetSize = window.allSheets && window.allSheets.length > 0
        ? window.allSheets[window.currentSheetIndex || 0].sheetSize
        : sheetSize;

    console.log(`\n📤 [ЭКСПОРТ DXF] Один лист`);
    console.log(`   📄 Размер листа: ${currentSheetSize.width}×${currentSheetSize.height} мм`);
    console.log(`   📦 Деталей (исходно): ${nestedParts.length}`);
    console.log(`   📦 Деталей (после объединения): ${mergedParts.length}`);
    console.log(`   📋 Уникальных типов: ${new Set(nestedParts.map(n => n.partId)).size}`);
    console.log(`   💰 Толщина: задаётся в списке деталей`);

    const margin = 50;
    let dxf = [];

    // HEADER
    dxf.push("0","SECTION","2","HEADER","9","$INSUNITS","70","4","0","ENDSEC");

    // TABLES
    dxf.push("0","SECTION","2","TABLES","0","TABLE","2","LAYER");
    const partsByType = {};
    mergedParts.forEach(n => {
        const partId = n.partId || 'merged_group';
        if (!partsByType[partId]) partsByType[partId] = [];
        partsByType[partId].push(n);
    });
    const layers = ["Sheet","Parts","Dimensions"];
    Object.keys(partsByType).forEach(partId => {
        const part = parts.find(p => p.id == partId);
        const partName = part?.name ? transliterate(part.name) : `D${partId}`;
        layers.push(`PART_${partId}_${partName.replace(/[^a-zA-Z0-9_]/g,'_').substring(0,15)}`);
    });
    dxf.push("70",layers.length);
    layers.forEach(name => {
        dxf.push("0","LAYER","2",name,"70","0","62","7","6","CONTINUOUS");
    });
    dxf.push("0","ENDTAB","0","ENDSEC");

    // ENTITIES
    dxf.push("0","SECTION","2","ENTITIES");

    // Sheet contour
    const x1=margin,y1=margin,x2=margin+currentSheetSize.width,y2=margin+currentSheetSize.height;
    dxf.push("0","LWPOLYLINE","8","Sheet","90","4","70","1","10",x1,"20",y1,"10",x2,"20",y1,"10",x2,"20",y2,"10",x1,"20",y2);

    // Parts
// Определяем текущий лист (для partDefinitions и толщины)
    const currentSheet = window.allSheets && window.allSheets.length > 0
        ? window.allSheets[window.currentSheetIndex || 0] : null;
    
    // Собираем определения деталей для экспорта
    const singleSheetPartDefs = {};
    
    // 1. Сначала parts (глобальная переменная) — источник истины
    //    НЕ используем window.parts, т.к. parts может быть let/const
    const globalParts = (typeof parts !== 'undefined') ? parts : (window.parts || []);
    if (Array.isArray(globalParts)) {
        mergedParts.forEach(n => {
            if (!singleSheetPartDefs[n.partId]) {
                const part = globalParts.find(p => p.id == n.partId);
                if (part) {
                    singleSheetPartDefs[n.partId] = part;
                }
            }
        });
    }
    
    // 2. Дополняем из partDefinitions текущего листа (если есть уникальные)
    if (currentSheet && currentSheet.partDefinitions) {
        Object.keys(currentSheet.partDefinitions).forEach(id => {
            if (!singleSheetPartDefs[id]) {
                singleSheetPartDefs[id] = currentSheet.partDefinitions[id];
            }
        });
    }
    
    console.log(`   📋 Итоговое количество определений деталей: ${Object.keys(singleSheetPartDefs).length}`);
    console.log(`   📋 PartIds: ${Object.keys(singleSheetPartDefs).join(', ')}`);

    // Экспорт деталей
    Object.keys(partsByType).forEach(partId => {
        const part = singleSheetPartDefs[partId];
        const items = partsByType[partId];
        
        // Проверяем, является ли группа объединённой
        const isMergedGroup = items.some(n => n.isMerged);
        
        if (!part && !isMergedGroup) {
            console.warn(`   ⚠️ Пропускаем деталь #${partId}: определение не найдено`);
            console.warn(`      partsByType[partId].length=${items.length} экземпляров этой детали на листе!`);
            return;
        }
        
        // Для объединённых групп используем объекты из группы
        const hasPartObjects = part?.objects && part.objects.length > 0;
        const hasNestedObjects = items.some(n => n.objects && n.objects.length > 0);
        if (!hasPartObjects && !hasNestedObjects && !isMergedGroup) {
            console.warn(`   ⚠️ Деталь #${partId} "${part?.name || 'Без имени'}" не имеет объектов для экспорта`);
            console.warn(`      partsByType[partId].length=${items.length} экземпляров на листе!`);
            console.warn(`      part.objects =`, part?.objects);
            return;
        }
        
        const partName = part?.name ? transliterate(part.name) : `D${partId}`;
        const layerName = isMergedGroup ? `MERGED_${partId}` : `PART_${partId}_${partName.replace(/[^a-zA-Z0-9_]/g,'_').substring(0,15)}`;
        
        console.log(`   ✅ Экспорт ${isMergedGroup ? 'объединённой группы' : `детали #${partId}`} "${partName}": ${items.length} шт., ${hasPartObjects ? part.objects.length : 0} объектов`);
        items.forEach(nested => {
            const exportPart = part || { objects: nested.objects || [], name: partName };
            exportNestedPartToDXF(dxf, exportPart, nested, layerName, margin, currentSheetSize.height, currentSheetSize.width);
        });
    });

    // ═══════════════════════════════════════════════════════════
    // ЭКСПОРТ ЛИНИИ ОБРЕЗКИ ОСТАТКА
    // ═══════════════════════════════════════════════════════════
    if (currentSheet && currentSheet.showCutRemnantLine && currentSheet.cutRemnantLine) {
        // Инвертируем Y для DXF
        const cutY_DXF = currentSheetSize.height - currentSheet.cutRemnantLine.y;
        console.log(`   ✂️ Экспорт линии обрезки: Y=${currentSheet.cutRemnantLine.y} мм -> DXF Y=${cutY_DXF} мм`);
        const cutX1 = 4;
        const cutX2 = currentSheetSize.width - 4;
        dxf.push("0","LINE","8","CUT_REMNANT","10",cutX1+margin,"20",cutY_DXF+margin,"11",cutX2+margin,"21",cutY_DXF+margin);
    }

    // ═══════════════════════════════════════════════════════════
    // ЭКСПОРТ УГЛОВЫХ РАЗМЕРОВ
    // ═══════════════════════════════════════════════════════════
    if (typeof angleDimensions !== 'undefined' && angleDimensions.length > 0) {
        console.log(`   📐 Экспорт угловых размеров: ${angleDimensions.length} шт.`);
        
        angleDimensions.forEach(angleDim => {
            // Инвертируем Y для DXF
            const dxfY = angleDim.y;
            const dxfY1 = angleDim.y1;
            const dxfY2 = angleDim.y2;
            
            // Линия 1 (от вершины до точки 1)
            dxf.push("0","LINE","8","Dimensions",
                "10",angleDim.x + margin,"20",dxfY + margin,
                "11",angleDim.x1 + margin,"21",dxfY1 + margin);
            
            // Линия 2 (от вершины до точки 2)
            dxf.push("0","LINE","8","Dimensions",
                "10",angleDim.x + margin,"20",dxfY + margin,
                "11",angleDim.x2 + margin,"21",dxfY2 + margin);
            
            // Дуга угла
            const startAngleDeg = angleDim.startAngle * 180 / Math.PI;
            const endAngleDeg = angleDim.endAngle * 180 / Math.PI;
            
            dxf.push("0","ARC","8","Dimensions",
                "10",angleDim.x + margin,"20",dxfY + margin,"30",0,
                "40",angleDim.radius,
                "50",startAngleDeg,"51",endAngleDeg);
            
            // Текст с значением угла
            const midAngle = (angleDim.startAngle + angleDim.endAngle) / 2;
            const textX = angleDim.x + Math.cos(midAngle) * (angleDim.radius + 15);
            const textY = angleDim.y + Math.sin(midAngle) * (angleDim.radius + 15);
            
            dxf.push("0","TEXT","8","Dimensions",
                "10",textX + margin,"20",textY + margin,"40","8","1",angleDim.value + "%%d");
        });
    }

    dxf.push("0","ENDSEC","0","EOF");

    // Подсчёт сущностей
    const entityCounts = { LINE: 0, CIRCLE: 0, LWPOLYLINE: 0, TEXT: 0 };
    dxf.forEach((item, i) => {
        if (item === 'LINE') entityCounts.LINE++;
        if (item === 'CIRCLE') entityCounts.CIRCLE++;
        if (item === 'LWPOLYLINE') entityCounts.LWPOLYLINE++;
        if (item === 'TEXT' && dxf[i-2] === '0') entityCounts.TEXT++;
    });

    // Подсчёт экспортированных деталей
    let exportedPartCount = 0;
    const skippedParts = [];
    Object.keys(partsByType).forEach(partId => {
        const part = singleSheetPartDefs[partId];
        const items = partsByType[partId];
        const isMergedGroup = items.some(n => n.isMerged);
        
        if (isMergedGroup) {
            // Объединённая группа всегда экспортируется
            exportedPartCount += items.length;
        } else if (part && part.objects && part.objects.length > 0) {
            exportedPartCount += items.length;
        } else {
            skippedParts.push({
                partId,
                count: items.length,
                reason: part ? 'нет объектов' : 'нет определения'
            });
        }
    });

// Save
    const dxfContent = dxf.join("\n");
    const blob = new Blob([dxfContent], {type:"application/dxf"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    let sheetThickness = 0.8;
    if (mergedParts.length > 0) {
        const firstPart = window.parts?.find(p => p.id === mergedParts[0].partId);
        if (firstPart) sheetThickness = firstPart.thickness || 0.8;
    }
    const now = new Date();
    const dt = now.toLocaleDateString('ru-RU').replace(/\//g,'.')+'_'+now.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}).replace(/:/g,'-');
    const fileName = `sheet_t${sheetThickness}mm_${dt}.dxf`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    const fileSize = (blob.size / 1024).toFixed(1);
    console.log(`\n✅ [ЭКСПОРТ DXF] Завершён`);
    console.log(`   📁 Файл: ${fileName}`);
    console.log(`   💾 Размер: ${fileSize} КБ`);
    console.log(`   📊 Сущности: LINE=${entityCounts.LINE}, CIRCLE=${entityCounts.CIRCLE}, POLY=${entityCounts.LWPOLYLINE}, TEXT=${entityCounts.TEXT}`);
    console.log(`   📦 Всего деталей на листе: ${nestedParts.length}`);
    console.log(`   📦 Экспортировано (после объединения): ${mergedParts.length}`);
    console.log(`   ✅ Экспортировано деталей: ${exportedPartCount}`);
    if (skippedParts.length > 0) {
        console.warn(`   ⚠️ Пропущено деталей: ${skippedParts.reduce((s,p) => s + p.count, 0)} шт.`);
        skippedParts.forEach(sp => {
            console.warn(`      #${sp.partId}: ${sp.count} шт. (${sp.reason})`);
        });
    }

    alert(`✅ DXF экспортирован\nДеталей (исходно): ${nestedParts.length}\nДеталей (после объединения): ${mergedParts.length}\nФайл: ${fileName}`);
}

// Export all sheets with BLOCK grouping
function exportAllSheetsToDXF(allSheets) {
    // 🔒 Блокировка экспорта для пробного тарифа
    if (typeof LicenseManager !== 'undefined' && LicenseManager.isTrial()) {
        if (typeof LicenseManager.showUpgradeModal === 'function') {
            LicenseManager.showUpgradeModal('exportDxf');
        } else {
            alert('🔧 Экспорт DXF недоступен в пробном периоде. Купите тариф для доступа к экспорту.');
        }
        return;
    }

    const totalParts = allSheets.reduce((s, sh) => s + sh.nestedParts.length, 0);
    console.log(`\n📤 [ЭКСПОРТ DXF] Все листы`);
    console.log(`   📄 Листов: ${allSheets.length}`);
    console.log(`   📦 Деталей всего: ${totalParts}`);
    allSheets.forEach((s, i) => {
        console.log(`      Лист ${i+1}: ${s.nestedParts.length} дет., размер ${s.sheetSize?.width||'?'}×${s.sheetSize?.height||'?'}`);
    });

    const margin = 50;
    let dxf = [];

    // Счётчики для итоговой сводки
    let exportedPartCount = 0;
    const skippedParts = [];

    // Собираем определения деталей из всех листов и parts
    const allPartDefs = {};
    
    // 1. Сначала parts (глобальная переменная) — источник истины
    //    НЕ используем window.parts, т.к. parts может быть let/const
    const globalParts = (typeof parts !== 'undefined') ? parts : (window.parts || []);
    if (Array.isArray(globalParts)) {
        globalParts.forEach(p => {
            if (p && p.id != null) {
                allPartDefs[p.id] = p;
            }
        });
    }
    
    // 2. Дополняем из partDefinitions листов (если есть уникальные)
    allSheets.forEach(s => {
        if (s.partDefinitions) {
            Object.keys(s.partDefinitions).forEach(id => {
                if (!allPartDefs[id]) {
                    allPartDefs[id] = s.partDefinitions[id];
                }
            });
        }
    });
    
    console.log(`   📋 Найдено определений деталей: ${Object.keys(allPartDefs).length}`);
    console.log(`   📋 PartIds: ${Object.keys(allPartDefs).join(', ')}`);

    function transliterate(word) {
        const c = {
            'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i',
            'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
            'у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'',
            'э':'e','ю':'yu','я':'ya'
        };
        return word.split('').map(ch => /[0-9a-zA-Z]/.test(ch) ? ch : (c[ch.toLowerCase()]||'_')).join('');
    }

    // HEADER
    dxf.push("0","SECTION","2","HEADER","9","$INSUNITS","70","4","0","ENDSEC");

    // TABLES
    dxf.push("0","SECTION","2","TABLES","0","TABLE","2","LAYER");
    const allPartTypes = new Set();
    allSheets.forEach(s => s.nestedParts.forEach(n => allPartTypes.add(n.partId)));
    const layers = ["Sheet","Parts","Dimensions"];
    allPartTypes.forEach(id => {
        const p = allPartDefs[id];
        const nm = p?.name ? transliterate(p.name) : `D${id}`;
        layers.push(`PART_${id}_${nm.replace(/[^a-zA-Z0-9_]/g,'_').substring(0,10)}`);
    });
    dxf.push("70",layers.length);
    layers.forEach(n => dxf.push("0","LAYER","2",n,"70","0","62","7","6","CONTINUOUS"));
    dxf.push("0","ENDTAB","0","ENDSEC");

    // BLOCKS - каждый лист со своим размером
    dxf.push("0","SECTION","2","BLOCKS");
    allSheets.forEach((s,i) => {
        const bn = `SHEET_${i+1}`;
        const localSheetSize = s.sheetSize || { width: 1250, height: 2500 };  // Размер конкретного листа

        console.log(`   📋 Лист ${i+1}: sheetSize=${JSON.stringify(s.sheetSize)}, localSheetSize=${localSheetSize.width}×${localSheetSize.height}`);

        dxf.push("0","BLOCK","2",bn,"70","2","10","0","20","0","3",bn,"1","");

// Sheet contour с использованием размера конкретного листа
        dxf.push("0","LWPOLYLINE","8","Sheet","90","4","70","1",
            "10",margin,"20",margin,
            "10",margin+localSheetSize.width,"20",margin,
            "10",margin+localSheetSize.width,"20",margin+localSheetSize.height,
            "10",margin,"20",margin+localSheetSize.height);

        // Parts
        const pbt = {};
        s.nestedParts.forEach(n => {
            if (!pbt[n.partId]) pbt[n.partId] = [];
            pbt[n.partId].push(n);
        });
        console.log(`   📦 Лист ${i+1}: ${Object.keys(pbt).length} типов деталей, всего ${s.nestedParts.length} шт.`);
        console.log(`      Доступные partIds: ${Object.keys(pbt).join(', ')}`);
        console.log(`      Определений деталей: ${Object.keys(allPartDefs).length}`);

        // Подсчёт экспортированных и пропущенных деталей для этого листа
        let sheetExportedCount = 0;
        const sheetSkipped = [];
        
        console.log(`\n   ═══════════════════════════`);
        console.log(`   📋 ЛИСТ ${i+1} - Детали ДО экспорта:`);
        console.log(`   ═══════════════════════════`);
        s.nestedParts.forEach((n, idx) => {
            const part = allPartDefs[n.partId];
            const pn = part?.name ? transliterate(part.name) : `D${n.partId}`;
            console.log(`      #${idx+1} ${pn}: x=${n.x}, y=${n.y}, baseHeight=${n.baseHeight||'?'}, rotation=${n.rotation||0}, angle=${n.angle||'?'}`);
        });
        
        Object.keys(pbt).forEach(pid => {
            const part = allPartDefs[pid];
            const count = pbt[pid].length;
            if (!part) {
                console.warn(`      ⚠️ #${pid}: ${count} шт. НЕ НАЙДЕНО определение`);
                sheetSkipped.push({ partId: pid, count, reason: 'нет определения' });
                return;
            }
            const hasPartObjects = part.objects && part.objects.length > 0;
            const hasNestedObjects = pbt[pid].some(n => n.objects && n.objects.length > 0);
            if (!hasPartObjects && !hasNestedObjects) {
                console.warn(`      ⚠️ #${pid} "${part.name||'Без имени'}": ${count} шт. нет объектов`);
                sheetSkipped.push({ partId: pid, count, reason: 'нет объектов' });
                return;
            }
sheetExportedCount += count;
            const pn = part?.name ? transliterate(part.name) : `D${pid}`;
            const ln = `PART_${pid}_${pn.replace(/[^a-zA-Z0-9_]/g,'_').substring(0,10)}`;

            console.log(`      ✅ #${pid} "${pn}": ${count} шт.`);
            
            console.log(`   ═══════════════════════════`);
            console.log(`   📋 ЛИСТ ${i+1} - Детали ПОСЛЕ экспорта (DXF координаты):`);
            console.log(`   ═══════════════════════════`);
            
            pbt[pid].forEach(nested => {
                exportNestedPartToDXF(dxf, part, nested, ln, margin, localSheetSize.height, localSheetSize.width);
            });
        });

        if (sheetSkipped.length > 0) {
            console.warn(`   ⚠️ Лист ${i+1}: Экспортировано ${sheetExportedCount} из ${s.nestedParts.length} деталей`);
            sheetSkipped.forEach(sk => {
                console.warn(`      Пропущено #${sk.partId}: ${sk.count} шт. (${sk.reason})`);
            });
            skippedParts.push(...sheetSkipped);
        }
        exportedPartCount += sheetExportedCount;

        // ═══════════════════════════════════════════════════════════
        // ЭКСПОРТ ЛИНИИ ОБРЕЗКИ ОСТАТКА (для каждого листа)
        // ═══════════════════════════════════════════════════════════
        if (s.showCutRemnantLine && s.cutRemnantLine) {
            // Инвертируем Y для DXF
            const cutY_DXF = localSheetSize.height - s.cutRemnantLine.y;
            const cutX1 = 4;
            const cutX2 = localSheetSize.width - 4;
            dxf.push("0","LINE","8","CUT_REMNANT","10",cutX1+margin,"20",cutY_DXF+margin,"11",cutX2+margin,"21",cutY_DXF+margin);
        }

        // ═══════════════════════════════════════════════════════════
        // ЭКСПОРТ УГЛОВЫХ РАЗМЕРОВ (для каждого листа)
        // ═══════════════════════════════════════════════════════════
        if (typeof angleDimensions !== 'undefined' && angleDimensions.length > 0) {
            console.log(`   📐 Экспорт угловых размеров на листе ${i+1}: ${angleDimensions.length} шт.`);
            
            angleDimensions.forEach(angleDim => {
                // Линия 1
                dxf.push("0","LINE","8","Dimensions",
                    "10",angleDim.x + margin,"20",angleDim.y + margin,
                    "11",angleDim.x1 + margin,"21",angleDim.y1 + margin);
                
                // Линия 2
                dxf.push("0","LINE","8","Dimensions",
                    "10",angleDim.x + margin,"20",angleDim.y + margin,
                    "11",angleDim.x2 + margin,"21",angleDim.y2 + margin);
                
                // Дуга
                const startAngleDeg = angleDim.startAngle * 180 / Math.PI;
                const endAngleDeg = angleDim.endAngle * 180 / Math.PI;
                
                dxf.push("0","ARC","8","Dimensions",
                    "10",angleDim.x + margin,"20",angleDim.y + margin,"30",0,
                    "40",angleDim.radius,
                    "50",startAngleDeg,"51",endAngleDeg);
                
                // Текст
                const midAngle = (angleDim.startAngle + angleDim.endAngle) / 2;
                const textX = angleDim.x + Math.cos(midAngle) * (angleDim.radius + 15);
                const textY = angleDim.y + Math.sin(midAngle) * (angleDim.radius + 15);
                
                dxf.push("0","TEXT","8","Dimensions",
                    "10",textX + margin,"20",textY + margin,"40","8","1",angleDim.value + "%%d");
            });
        }

        dxf.push("0","ENDBLK","8","0");
    });
    dxf.push("0","ENDSEC");

    // ENTITIES (insert blocks) - с индивидуальным смещением для каждого листа
    dxf.push("0","SECTION","2","ENTITIES");
    let cumulativeHeight = 0;
    allSheets.forEach((s,i) => {
        const bn = `SHEET_${i+1}`;
        const localSheetSize = s.sheetSize || { width: 1250, height: 2500 };
        const oY = cumulativeHeight;
        dxf.push("0","INSERT","2",bn,"8","0","10","0","20",oY,"30","0","41","1","42","1","43","1","50","0");
        cumulativeHeight += localSheetSize.height + margin*2;
    });
    dxf.push("0","ENDSEC","0","EOF");

    // Подсчёт сущностей
    const entityCounts = { LINE: 0, CIRCLE: 0, LWPOLYLINE: 0, TEXT: 0, INSERT: 0 };
    dxf.forEach((item, i) => {
        if (item === 'LINE') entityCounts.LINE++;
        if (item === 'CIRCLE') entityCounts.CIRCLE++;
        if (item === 'LWPOLYLINE') entityCounts.LWPOLYLINE++;
        if (item === 'TEXT' && dxf[i-2] === '0') entityCounts.TEXT++;
        if (item === 'INSERT') entityCounts.INSERT++;
    });

    // Save
    const dxfContent = dxf.join("\n");
    const blob = new Blob([dxfContent], {type:"application/dxf"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const th = allSheets.length > 0 ? (allSheets[0].thickness || 0.8) : 0.8;
    const now = new Date();
    const dt = now.toLocaleDateString('ru-RU').replace(/\//g,'.')+'_'+now.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}).replace(/:/g,'-');
    const fileName = `sheets_${allSheets.length}_t${th}mm_${dt}.dxf`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    const fileSize = (blob.size / 1024).toFixed(1);
    console.log(`\n✅ [ЭКСПОРТ DXF] Все листы завершены`);
    console.log(`   📁 Файл: ${fileName}`);
    console.log(`   💾 Размер: ${fileSize} КБ`);
    console.log(`   📊 Сущности: LINE=${entityCounts.LINE}, CIRCLE=${entityCounts.CIRCLE}, POLY=${entityCounts.LWPOLYLINE}, TEXT=${entityCounts.TEXT}, INSERT=${entityCounts.INSERT}`);
    console.log(`   📦 Всего деталей: ${totalParts}`);
    console.log(`   ✅ Экспортировано: ${exportedPartCount}`);
    if (skippedParts.length > 0) {
        const skippedTotal = skippedParts.reduce((s, p) => s + p.count, 0);
        console.warn(`   ⚠️ Пропущено: ${skippedTotal} шт.`);
        skippedParts.forEach(sp => {
            console.warn(`      #${sp.partId}: ${sp.count} шт. (${sp.reason})`);
        });
    }
    console.log('');

    alert(`✅ DXF экспортирован\nЛистов: ${allSheets.length}\nДеталей всего: ${totalParts}\nЭкспортировано: ${exportedPartCount}\n${skippedParts.length > 0 ? `Пропущено: ${skippedParts.reduce((s,p) => s + p.count, 0)}\n` : ''}Файл: ${fileName}`);
}

// Export single nested part
function exportNestedPartToDXF(dxf, part, nested, layerName, margin, sheetHeight, sheetWidth) {
    const bbox = part.bounds || { minX: 0, minY: 0, width: nested.baseWidth || nested.width, height: nested.baseHeight || nested.height };
    // v4.77: Вычисление baseWidth/baseHeight ТОЧНО как в render.js —
    // с swap W↔H при 90°/270° если нет baseWidth.
    let baseWidth = nested.baseWidth || bbox.width;
    let baseHeight = nested.baseHeight || bbox.height;
    if (!nested.baseWidth) {
        const _deg = Math.round((nested.angle * 180 / Math.PI) % 360);
        if (Math.abs(_deg) === 90 || Math.abs(_deg) === 270) { [baseWidth, baseHeight] = [baseHeight, baseWidth]; }
    }
    const cx = baseWidth/2, cy = baseHeight/2;

    // Нормализация координат относительно minX/minY детали
    const normOffsetX = bbox.minX || 0;
    const normOffsetY = bbox.minY || 0;

    // ═══════════════════════════════════════════════════════════
    // ИСПОЛЬЗУЕМ nested.objects ЕСЛИ ЕСТЬ (после отражения/копирования)
    // Это исправляет баг: отражённые и скопированные детали не были
    // видны в экспорте, т.к. использовалась оригинальная геометрия
    // ═══════════════════════════════════════════════════════════
    const objectsToExport = nested.objects && nested.objects.length > 0 ? nested.objects : part.objects;
    if (!objectsToExport || objectsToExport.length === 0) return;

    // v4.77: ВСЕГДА используем part.bounds.minX/minY для нормализации —
    // ТАК ЖЕ, как в render.js. Раньше для nested.objects (после отражения)
    // использовался 0, что давало расхождение с рендером при bounds.minX ≠ 0.
    // Для nested.objects нормализация = 0 (они уже нормализованы flipNestedPart),
    // а part.bounds.minX тоже = 0 (createPartFromSelection нормализует).
    // Но для надёжности используем ЕДИНЫЙ путь как в render.js.
    const useNestedObjects = nested.objects && nested.objects.length > 0;
    const effectiveNormX = useNestedObjects ? 0 : normOffsetX;
    const effectiveNormY = useNestedObjects ? 0 : normOffsetY;

    // v4.77: ИСПРАВЛЕН БАГ! Раньше было `nested.angle || (nested.rotation||0) * 20 * (Math.PI / 180)`.
    // Когда nested.angle === 0 (деталь без поворота), это falsy → fallback к
    // (nested.rotation||0) * 20°. Но nested.rotation может быть ≠ 0 (step-счётчик
    // движка nesting) → применялся НЕВЕРНЫЙ угол поворота!
    // Теперь: если nested.angle — число (включая 0), используем его.
    // Fallback только если angle вообще не задан (undefined/null).
    const angle = (typeof nested.angle === 'number') ? nested.angle : ((nested.rotation||0) * 20 * (Math.PI / 180));

    // Функция вращения вокруг центра
    function rotate(x, y) {
        if (angle === 0) return { x: x, y: y };  // v4.77: оптимизация + точность
        const dx = x - cx, dy = y - cy;
        return {
            x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
            y: cy + dx * Math.sin(angle) + dy * Math.cos(angle)
        };
    }

    // Используем сохранённый refPoint из nesting.js
    // Если его нет (старая деталь) — вычисляем заново
    let refPoint = nested.refPoint;
    if (!refPoint) {
        // Вычисляем refPoint так же, как в nesting.js - вращая bounding box
        const bboxHull = [
            { x: 0, y: 0 },
            { x: baseWidth, y: 0 },
            { x: baseWidth, y: baseHeight },
            { x: 0, y: baseHeight }
        ];
        const rotatedBboxHull = bboxHull.map(p => rotate(p.x, p.y));

        // v4.77: Находим refPoint с округлением для сравнения — КАК В render.js.
        // Без округления float-погрешности могут выбрать неправильную точку.
        refPoint = rotatedBboxHull[0];
        for (const p of rotatedBboxHull) {
            const py = Math.round(p.y * 1000000) / 1000000;
            const refY = Math.round(refPoint.y * 1000000) / 1000000;
            const px = Math.round(p.x * 1000000) / 1000000;
            const refX = Math.round(refPoint.x * 1000000) / 1000000;
            if (py < refY || (py === refY && px < refX)) {
                refPoint = p;
            }
        }
    }

// ═══════════════════════════════════════════════════════════
    // ИНВЕРСИЯ Y ДЛЯ DXF
    // Canvas: Y растёт вниз (0 вверху), DXF: Y растёт вверх (0 внизу)
    // ВСЕ детали в памяти хранятся в Canvas системе (Y вниз)
    // Поэтому нужно инвертировать Y для всех деталей при экспорте
    // ═══════════════════════════════════════════════════════════
    const angleDeg = (angle * 180 / Math.PI).toFixed(1);
    
    // Проверяем, были ли детали импортированы из DXF (для отладки)
    const firstObj = objectsToExport[0];
    const isDxfImported = firstObj && firstObj._dxfImported;
    
// ИНВЕРСИЯ Y ДЛЯ ВСЕХ ДЕТАЛЕЙ (Canvas → DXF)
    // nested.y - это позиция refPoint детали на листе Canvas (от верха)
    // В DXF: Y растёт снизу, поэтому инвертируем
    const nestedY_DXF = sheetHeight - nested.y;
    
console.log(`   🔧 Деталь #${nested.partId}: pos=(${nested.x},${nested.y} -> DXF Y=${nestedY_DXF}), dxfImported=${isDxfImported}, angle=${angleDeg}°, baseHeight=${baseHeight}, sheetHeight=${sheetHeight}, useNested=${useNestedObjects}`);
    const hasRefPoint = !!nested.refPoint;
    console.log(`   🔧 Деталь #${nested.partId}: pos=(${nested.x},${nested.y} -> DXF Y=${nestedY_DXF}), angle=${angleDeg}°, refPoint=${hasRefPoint?'сохранён':'вычислен'} (${refPoint.x.toFixed(0)},${refPoint.y.toFixed(0)}), size=${baseWidth}×${baseHeight}, объектов=${objectsToExport.length}`);
    console.log(`      Объекты:`, objectsToExport.map(o => o.type).join(', '));

    // Отладка: первые точки объектов
    if (objectsToExport.length > 0) {
        const obj = objectsToExport[0];
        console.log(`      Первый объект:`, obj.type === 'line' ? 
            `line(${obj.x1.toFixed(0)},${obj.y1.toFixed(0)} -> ${obj.x2.toFixed(0)},${obj.y2.toFixed(0)})` :
            obj.type === 'rect' ? 
            `rect(${obj.x.toFixed(0)},${obj.y.toFixed(0)}, ${obj.width.toFixed(0)}x${obj.height.toFixed(0)})` :
            obj.type === 'circle' ?
            `circle(${obj.cx.toFixed(0)},${obj.cy.toFixed(0)}, r=${obj.radius.toFixed(0)})` :
            `polygon`
        );
    }

    // Вычисляем реальную высоту повёрнутой детали для проверки границ
    const rotatedCorners = [
        {x: 0, y: 0}, {x: baseWidth, y: 0}, {x: baseWidth, y: baseHeight}, {x: 0, y: baseHeight}
    ].map(p => rotate(p.x, p.y));
    let minY_local = rotatedCorners[0].y, maxY_local = rotatedCorners[0].y;
    for (const c of rotatedCorners) {
        if (c.y < minY_local) minY_local = c.y;
        if (c.y > maxY_local) maxY_local = c.y;
    }
    const rotatedHeight = maxY_local - minY_local;
    
    // refPoint.y = minY_local (нижняя точка в Canvas = верхняя в DXF)
    // В DXF: maxObjY = nestedY_DXF (refPoint), minObjY = nestedY_DXF - rotatedHeight

    // Экспортируем объекты с учётом refPoint, нормализации и инверсии Y
    // Координаты объектов нормализуются относительно effectiveNormX/effectiveNormY
    objectsToExport.forEach(obj => {
        if (obj.type === 'line') {
            let p1 = rotate(obj.x1 - effectiveNormX, obj.y1 - effectiveNormY);
            let p2 = rotate(obj.x2 - effectiveNormX, obj.y2 - effectiveNormY);
// Y объекта: позиция детали на листе (nestedY_DXF) + локальный Y объекта
            // refPoint - нижняя точка (минимальная Y после вращения)
            // В Canvas: объекты выше refPoint имеют МЕНЬШИЙ Y
            // В DXF: объекты выше refPoint имеют БОЛЬШИЙ Y
            // Поэтому: y_DXF = nestedY_DXF - (objY_local - refPoint.y)
            const y1_DXF = nestedY_DXF - (p1.y - refPoint.y);
            const y2_DXF = nestedY_DXF - (p2.y - refPoint.y);
            
            // Отладка для первой линии
            if (obj === objectsToExport[0]) {
                console.log(`         Линия: p1.y=${p1.y.toFixed(1)}, refPoint.y=${refPoint.y.toFixed(1)}, delta=${(p1.y - refPoint.y).toFixed(1)}`);
                console.log(`         DXF Y: nestedY_DXF=${nestedY_DXF.toFixed(1)} - delta=${(p1.y - refPoint.y).toFixed(1)} = ${y1_DXF.toFixed(1)}`);
            }
            p1 = { x: p1.x - refPoint.x + nested.x + margin, y: y1_DXF + margin };
            p2 = { x: p2.x - refPoint.x + nested.x + margin, y: y2_DXF + margin };
            dxf.push("0","LINE","8",layerName,"10",p1.x,"20",p1.y,"11",p2.x,"21",p2.y);
} else if (obj.type === 'circle') {
            let c = rotate(obj.cx - effectiveNormX, obj.cy - effectiveNormY);
            const cY_DXF = nestedY_DXF - (c.y - refPoint.y);
            c = { x: c.x - refPoint.x + nested.x + margin, y: cY_DXF + margin };
            dxf.push("0","CIRCLE","8",layerName,"10",c.x,"20",c.y,"40",obj.radius);
        } else if (obj.type === 'rect') {
            const corners = [
                {x: obj.x - effectiveNormX, y: obj.y - effectiveNormY},
                {x: obj.x + obj.width - effectiveNormX, y: obj.y - effectiveNormY},
                {x: obj.x + obj.width - effectiveNormX, y: obj.y + obj.height - effectiveNormY},
                {x: obj.x - effectiveNormX, y: obj.y + obj.height - effectiveNormY}
            ];
            const pts = corners.map(c => {
                let r = rotate(c.x, c.y);
                const rY_DXF = nestedY_DXF - (r.y - refPoint.y);
                return {
                    x: r.x - refPoint.x + nested.x + margin,
                    y: rY_DXF + margin
                };
            });
            dxf.push("0","LWPOLYLINE","8",layerName,"90",pts.length,"70","1");
            pts.forEach(p => dxf.push("10",p.x,"20",p.y));
        } else if (obj.type === 'polygon') {
            // Поддержка polygon из DXF-импорта (points/vertices) и shapes.js (cx/cy/sides/radius)
            let vertices;
            if (obj.points && obj.points.length > 0) {
                vertices = obj.points;
            } else if (obj.vertices && obj.vertices.length > 0) {
                vertices = obj.vertices;
            } else if (obj.sides && typeof obj.radius === 'number' && typeof obj.cx === 'number') {
                // Правильный многоугольник из shapes.js
                vertices = [];
                for (let i = 0; i < obj.sides; i++) {
                    const a = (Math.PI * 2 / obj.sides) * i - Math.PI / 2;
                    vertices.push({ x: obj.cx + Math.cos(a) * obj.radius, y: obj.cy + Math.sin(a) * obj.radius });
                }
            } else {
                vertices = [];
            }
            if (vertices.length < 2) return;
            const pts = vertices.map(v => {
                let r = rotate(v.x - effectiveNormX, v.y - effectiveNormY);
                const rY_DXF = nestedY_DXF - (r.y - refPoint.y);
                return {
                    x: r.x - refPoint.x + nested.x + margin,
                    y: rY_DXF + margin
                };
            });
            dxf.push("0","LWPOLYLINE","8",layerName,"90",pts.length,"70","1");
            pts.forEach(p => dxf.push("10",p.x,"20",p.y));

        } else if (obj.type === 'arc') {
            const acx = obj.cx || 0;
            const acy = obj.cy || 0;
            const r = Math.abs(obj.radius || 0);
            const startAngle = obj.startAngle ?? 0;
            const endAngle = obj.endAngle ?? (2 * Math.PI);

            // Нормализуем direction: микростык и класс Arc используют строки 'CCW'/'CW'
            let dir;
            if (typeof obj.direction === 'string') {
                dir = obj.direction.toUpperCase() === 'CW' ? -1 : 1;
            } else {
                dir = (obj.direction >= 0) ? 1 : -1;
            }

            let sweep;
            if (dir >= 0) {
                sweep = endAngle - startAngle;
                if (sweep <= 0) sweep += 2 * Math.PI;
            } else {
                sweep = startAngle - endAngle;
                if (sweep <= 0) sweep += 2 * Math.PI;
            }

            const segments = 24;
            const step = sweep / segments;
            const pts = [];

            for (let i = 0; i <= segments; i++) {
                const a = startAngle + dir * step * i;
                let x = acx - effectiveNormX + Math.cos(a) * r;
                let y = acy - effectiveNormY + Math.sin(a) * r;
                let rp = rotate(x, y);
                const rpY_DXF = nestedY_DXF - (rp.y - refPoint.y);
                pts.push({
                    x: rp.x - refPoint.x + nested.x + margin,
                    y: rpY_DXF + margin
                });
            }

            dxf.push("0","LWPOLYLINE","8",layerName,"90",pts.length,"70","0");
            pts.forEach(p => dxf.push("10",p.x,"20",p.y));
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const vertices = (obj.points || obj.vertices || []).filter(v => v && typeof v.x === 'number' && typeof v.y === 'number');
            if (vertices.length < 2) return;

            const first = vertices[0];
            const last = vertices[vertices.length - 1];
            const isClosed = obj.closed || (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01);

            const pts = vertices.map(v => {
                let r = rotate(v.x - effectiveNormX, v.y - effectiveNormY);
                const rY_DXF = nestedY_DXF - (r.y - refPoint.y);
                return {
                    x: r.x - refPoint.x + nested.x + margin,
                    y: rY_DXF + margin
                };
            });

            dxf.push("0","LWPOLYLINE","8",layerName,"90",pts.length,"70",isClosed ? "1" : "0");
            pts.forEach(p => dxf.push("10",p.x,"20",p.y));
        } else if (obj.type === 'spline') {
            // Spline — аппроксимируем как polyline через fitPoints/controlPoints
            const vertices = (obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || []).filter(v => v && typeof v.x === 'number' && typeof v.y === 'number');
            if (vertices.length < 2) return;

            const first = vertices[0];
            const last = vertices[vertices.length - 1];
            const isClosed = obj.closed || (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01);

            const pts = vertices.map(v => {
                let r = rotate(v.x - effectiveNormX, v.y - effectiveNormY);
                const rY_DXF = nestedY_DXF - (r.y - refPoint.y);
                return {
                    x: r.x - refPoint.x + nested.x + margin,
                    y: rY_DXF + margin
                };
            });

            dxf.push("0","LWPOLYLINE","8",layerName,"90",pts.length,"70",isClosed ? "1" : "0");
            pts.forEach(p => dxf.push("10",p.x,"20",p.y));
        } else if (obj.type === 'text') {
            // Текст — экспортируем как TEXT сущность DXF
            const tx = obj.x || obj.x1 || 0;
            const ty = obj.y || obj.y1 || 0;
            let r = rotate(tx - effectiveNormX, ty - effectiveNormY);
            const rY_DXF = nestedY_DXF - (r.y - refPoint.y);
            const dx = r.x - refPoint.x + nested.x + margin;
            const dy = rY_DXF + margin;
            const text = obj.text || obj.content || obj.value || '';
            if (text) {
                dxf.push("0","TEXT","8",layerName,"10",dx,"20",dy,"40",(obj.fontSize || 5),"1",text);
            }
        }
    });
    
// ═══════════════════════════════════════════════════════════
    // ПРОВЕРКА ГРАНИЦ (для отладки)
    // ═══════════════════════════════════════════════════════════
    const actualMargin = margin || 4; // Глобальный отступ
    const actualSheetWidth = sheetWidth || 1250;
    const minObjX = nested.x + actualMargin;
    const maxObjX = nested.x + actualMargin + baseWidth;
    // В DXF: refPoint (низ детали в Canvas) = maxObjY, верх детали = nestedY_DXF - rotatedHeight
    // margin уже учтён в позиционировании объектов, здесь только границы детали
    const minObjY = nestedY_DXF - rotatedHeight + actualMargin;
    const maxObjY = nestedY_DXF + actualMargin;
    
    console.log(`   📏 Границы детали в DXF:`);
    console.log(`      X: ${minObjX.toFixed(1)} - ${maxObjX.toFixed(1)} (лист: ${actualMargin} - ${actualSheetWidth-actualMargin})`);
    console.log(`      Y: ${minObjY.toFixed(1)} - ${maxObjY.toFixed(1)} (лист: ${actualMargin} - ${sheetHeight-actualMargin})`);
    
    // Проверяем с учётом margin: деталь + margin должна быть в пределах листа
    const inBoundsX = minObjX >= actualMargin && maxObjX <= actualSheetWidth - actualMargin;
    const inBoundsY = minObjY >= actualMargin && maxObjY <= sheetHeight - actualMargin;
    
    if (!inBoundsX || !inBoundsY) {
        console.warn(`   ⚠️ ДЕТАЛЬ ВЫХОДИТ ЗА ПРЕДЕЛЫ ЛИСТА!`);
        if (!inBoundsX) console.warn(`      X: ${minObjX.toFixed(1)} < ${actualMargin} ИЛИ ${maxObjX.toFixed(1)} > ${actualSheetWidth-actualMargin}`);
        if (!inBoundsY) console.warn(`      Y: ${minObjY.toFixed(1)} < ${actualMargin} ИЛИ ${maxObjY.toFixed(1)} > ${sheetHeight-actualMargin}`);
    }
}

// ═══════════════════════════════════════════════════════════
// ЭКСПОРТ ТЕКУЩЕГО ЛИСТА В DXF (одиночный лист)
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('exportSheetDXF');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', () => {
        // 🔒 Блокировка для пробного тарифа
        if (typeof LicenseManager !== 'undefined' && LicenseManager.isTrial()) {
            if (typeof LicenseManager.showUpgradeModal === 'function') {
                LicenseManager.showUpgradeModal('exportDxf');
            } else {
                alert('🔧 Экспорт DXF недоступен в пробном периоде.');
            }
            return;
        }

        if (!window.allSheets || window.allSheets.length === 0 || window.currentSheetIndex < 0) {
            alert('Нет листов для экспорта');
            return;
        }

        // Сохраняем текущие детали
        window.allSheets[window.currentSheetIndex].nestedParts = [...nestedParts];

        const currentSheet = window.allSheets[window.currentSheetIndex];
        const sheetSize = currentSheet.sheetSize || (typeof sheetSize !== 'undefined' ? sheetSize : { width: 1250, height: 2500 });

        if (nestedParts.length === 0) {
            alert('⚠️ Нет деталей для экспорта');
            return;
        }

        const margin = 50;
        let dxf = [];

        // HEADER
        dxf.push("0","SECTION","2","HEADER","9","$INSUNITS","70","4","0","ENDSEC");

        // TABLES
        dxf.push("0","SECTION","2","TABLES","0","TABLE","2","LAYER");
        const partsByType = {};
        nestedParts.forEach(n => {
            if (!partsByType[n.partId]) partsByType[n.partId] = [];
            partsByType[n.partId].push(n);
        });
        const layers = ["Sheet","Parts"];
        Object.keys(partsByType).forEach(partId => {
            const part = (typeof parts !== 'undefined' ? parts : window.parts || []).find(p => p.id == partId);
            const name = part?.name || `D${partId}`;
            layers.push(`PART_${name.replace(/[^a-zA-Z0-9_]/g,'_').substring(0,15)}`);
        });
        dxf.push("70",layers.length);
        layers.forEach(name => dxf.push("0","LAYER","2",name,"70","0","62","7","6","CONTINUOUS"));
        dxf.push("0","ENDTAB","0","ENDSEC");

        // ENTITIES
        dxf.push("0","SECTION","2","ENTITIES");

        // Sheet
        dxf.push("0","LWPOLYLINE","8","Sheet","90","4","70","1",
            "10",margin,"20",margin,
            "10",margin+sheetSize.width,"20",margin,
            "10",margin+sheetSize.width,"20",margin+sheetSize.height,
            "10",margin,"20",margin+sheetSize.height);

        const partDefs = (typeof parts !== 'undefined' ? parts : window.parts || []);
        Object.keys(partsByType).forEach(partId => {
            const part = partDefs.find(p => p.id == partId);
            if (!part || !part.objects || part.objects.length === 0) return;
            const name = part.name || `D${partId}`;
            const layerName = `PART_${name.replace(/[^a-zA-Z0-9_]/g,'_').substring(0,15)}`;

            partsByType[partId].forEach(nested => {
                exportNestedPartToDXF(dxf, part, nested, layerName, margin, sheetSize.height, sheetSize.width);
            });
        });

        dxf.push("0","ENDSEC","0","EOF");

        // Save
        const blob = new Blob([dxf.join("\n")], {type:"application/dxf"});
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const th = nestedParts.length > 0 ? ((partDefs.find(p => p.id === nestedParts[0].partId) || {}).thickness || 0.8) : 0.8;
        const now = new Date();
        const dt = now.toLocaleDateString('ru-RU').replace(/\//g,'.')+'_'+now.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}).replace(/:/g,'-');
        link.download = `sheet${window.currentSheetIndex+1}_t${th}mm_${dt}.dxf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        alert(`✅ DXF экспортирован\nЛист ${window.currentSheetIndex + 1}\nДеталей: ${nestedParts.length}`);
    });
});