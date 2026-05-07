// ═══════════════════════════════════════════════════════════════
// ИМПОРТ ДЕТАЛЕЙ ИЗ DXF — С ПОДДЕРЖКОЙ БЛОКОВ ("макро" файлы)
// ═══════════════════════════════════════════════════════════════

let importedObjects = [];
let dxfBounds = {};
let dxfFileName = '';

// ═══════════════════════════════════════════════════════════════
// PREPROCESS DXF ENTITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Универсальный preprocess перед convertDXFEntity
 */
function preprocessDXFEntities(dxf) {
    const originalCount = dxf.entities?.length || 0;
    
    let entities = expandDXFBlocks(dxf);
    const afterBlocksCount = entities.length;
    
    entities = explodeCompositeEntities(entities);
    const afterExplodeCount = entities.length;
    
    entities = filterUnsupportedEntities(entities);
    const afterFilterCount = entities.length;
    
    // Отчёт по этапам preprocess
    console.log("📊 DXF FLATTEN REPORT", {
        original: originalCount,
        afterBlocks: afterBlocksCount,
        afterExplode: afterExplodeCount,
        afterFilter: afterFilterCount
    });
    
    return entities;
}

/**
 * Разбиение составных сущностей (DIMENSION, HATCH, LEADER)
 */
function explodeCompositeEntities(entities) {
    const result = [];
    
    for (const entity of entities) {
        if (!entity || !entity.type) {
            result.push(entity);
            continue;
        }

        switch (entity.type) {
            case 'DIMENSION':
                if (entity.block) {
                    console.log('📐 Exploding DIMENSION block:', entity.block);
                    result.push(...explodeAnonymousBlock(entity.block));
                } else {
                    // Если нет блока, разбиваем на линии по точкам
                    console.log('📐 DIMENSION без блока — пропуск');
                }
                break;
                
            case 'HATCH':
                console.log('🪓 Exploding HATCH boundary');
                result.push(...explodeHatch(entity));
                break;
                
            case 'MLEADER':
            case 'LEADER':
                console.log('🪓 Exploding LEADER');
                result.push(...explodeLeader(entity));
                break;
                
            default:
                result.push(entity);
        }
    }
    
    return result;
}

/**
 * Взрыв анонимных блоков (*U###)
 */
function explodeAnonymousBlock(blockName) {
    const result = [];
    console.log(`🔍 Exploding anonymous block: ${blockName}`);
    
    // Ищем блок в global blocks (если есть доступ)
    // В текущей реализации блоки хранятся внутри expandDXFBlocks
    // Это заглушка для будущей доработки
    return result;
}

/**
 * Взрыв HATCH на контуры
 */
function explodeHatch(hatch) {
    const result = [];
    
    if (hatch.loops && Array.isArray(hatch.loops)) {
        hatch.loops.forEach((loop, loopIdx) => {
            if (loop.edges && Array.isArray(loop.edges)) {
                // Разбиваем каждый контур HATCH на линии/дуги
                console.log(`   HATCH loop ${loopIdx}: ${loop.edges.length} edges`);
                // TODO: реализовать полную поддержку edges HATCH
            }
        });
    }
    
    // Если нет петель — возвращаем пустой массив
    return result;
}

/**
 * Взрыв LEADER на линии
 */
function explodeLeader(leader) {
    const result = [];
    
    if (leader.vertices && Array.isArray(leader.vertices)) {
        for (let i = 0; i < leader.vertices.length - 1; i++) {
            const v1 = leader.vertices[i];
            const v2 = leader.vertices[i + 1];
            result.push({
                type: 'LINE',
                start: { x: v1.x, y: v1.y },
                end: { x: v2.x, y: v2.y }
            });
        }
    }
    
    return result;
}

/**
 * Фильтрация мусорных сущностей
 */
function filterUnsupportedEntities(entities) {
    const unsupportedTypes = [
        'TEXT',
        'MTEXT',
        'DIMENSION',
        'HATCH',
        'SOLID',
        'WIPEOUT',
        'IMAGE',
        'ATTDEF',
        'ATTRIB'
    ];
    
    const filtered = entities.filter(e => {
        const isSupported = !unsupportedTypes.includes(e?.type);
        if (!isSupported) {
            console.log(`⏭️ Filtered out ${e?.type}: unsupported type`);
        }
        return isSupported;
    });
    
    console.log(`📊 Filtered entities: ${entities.length} → ${filtered.length}`);
    return filtered;
}

/**
 * Раскрывает блоки и обрабатывает бинарные данные в импортированных объектах
 * @param {Object} dxf - Распарсенный DXF объект от DxfParser
 * @returns {Array} - Массив объектов с раскрытыми блоками
 */
function expandDXFBlocks(dxf) {
    if (!dxf || !dxf.entities) return [];
    
    // 🔍 ПОЛНАЯ ОТЛАДКА: выводим структуру dxf
    console.log('🔍 === DEBUG: DXF STRUCTURE ===');
    console.log('dxf.blocks type:', typeof dxf.blocks);
    console.log('dxf.blocks:', dxf.blocks);
    
    // Проверяем все возможные места, где могут быть блоки
    if (dxf.blocks) {
        if (Array.isArray(dxf.blocks)) {
            console.log('📦 Blocks as array:', dxf.blocks.map(b => b?.name).filter(Boolean));
        } else if (typeof dxf.blocks === 'object') {
            console.log('📦 Blocks as object keys:', Object.keys(dxf.blocks));
            Object.entries(dxf.blocks).forEach(([key, block]) => {
                console.log(`   Block "${key}": entities=${block?.entities?.length || 0}, objects=${block?.objects?.length || 0}`);
            });
        }
    }
    
    // 🔧 Проверяем другие возможные места хранения блоков
    if (dxf.tables?.blocks) {
        console.log('🔍 FOUND blocks in dxf.tables.blocks!');
        console.log('dxf.tables.blocks type:', typeof dxf.tables.blocks);
        if (Array.isArray(dxf.tables.blocks)) {
            console.log('📦 Blocks array count:', dxf.tables.blocks.length);
            dxf.tables.blocks.forEach((b, i) => {
                console.log(`   Block[${i}]: name=${b?.name}, entities=${b?.entities?.length || 0}`);
            });
        } else if (typeof dxf.tables.blocks === 'object') {
            console.log('📦 Blocks object keys:', Object.keys(dxf.tables.blocks));
        }
    }
    
    if (dxf._blocks) {
        console.log('🔍 FOUND blocks in dxf._blocks!');
        console.log('dxf._blocks:', dxf._blocks);
    }
    
    if (dxf.sections) {
        const blocksSection = dxf.sections.find(s => s.name === 'BLOCKS' || s.name === 'block');
        if (blocksSection) {
            console.log('🔍 FOUND BLOCKS section:', blocksSection);
        }
    }
    
    // 🔧 Нормализуем blocks в единый объект
    const blocks = {};
    const collectBlocks = (source, sourceName) => {
        if (!source) return;
        let count = 0;
        if (Array.isArray(source)) {
            source.forEach(b => {
                if (b?.name) {
                    const name = b.name.toString().trim();
                    blocks[name] = b;
                    blocks[name.toUpperCase()] = b;
                    blocks[name.toLowerCase()] = b;
                    count++;
                }
            });
        } else if (typeof source === 'object') {
            Object.entries(source).forEach(([key, block]) => {
                if (block) {
                    const name = key.toString().trim();
                    blocks[name] = block;
                    blocks[name.toUpperCase()] = block;
                    blocks[name.toLowerCase()] = block;
                    if (block.name) {
                        const bname = block.name.toString().trim();
                        blocks[bname] = block;
                        blocks[bname.toUpperCase()] = block;
                        blocks[bname.toLowerCase()] = block;
                    }
                    count++;
                }
            });
        }
        if (count > 0) console.log(`📦 Collected ${count} blocks from ${sourceName}`);
    };
    
    // Собираем блоки из всех возможных источников
    collectBlocks(dxf.blocks, 'dxf.blocks');
    collectBlocks(dxf._blocks, 'dxf._blocks');
    collectBlocks(dxf.tables?.blocks, 'dxf.tables.blocks');
    
    const result = [];
    console.log(`🔍 Entities: ${dxf.entities?.length || 0}, Blocks loaded: ${Object.keys(blocks).length}`);
    console.log('📋 Available block names:', [...new Set(Object.keys(blocks).slice(0, 30))]);
    
    (dxf.entities || []).forEach((entity, idx) => {
        if (entity.type === 'INSERT' && entity.name) {
            const blockName = entity.name.toString().trim();
            console.log(`\n🔍 [INSERT #${idx}] Ищем блок: "${blockName}"`);
            console.log('   entity:', { name: entity.name, position: entity.position, angle: entity.angle });
            
            // 🔧 Пробуем найти блок всеми способами
            let block = blocks[blockName] 
                || blocks[blockName.toUpperCase()] 
                || blocks[blockName.toLowerCase()]
                || Object.values(blocks).find(b => 
                    b?.name?.toString().trim() === blockName ||
                    b?.name?.toString().trim().toUpperCase() === blockName.toUpperCase() ||
                    b?.name?.toString().trim().toLowerCase() === blockName.toLowerCase()
                );
            
            if (block) {
                console.log(`📦 ✅ Нашли блок "${blockName}"`);
                console.log('   Block data:', { entities: block.entities?.length, objects: block.objects?.length });
                const insertX = entity.position?.x || entity.x || 0;
                const insertY = entity.position?.y || entity.y || 0;
                const scaleX = entity.xScale || entity.scaleX || 1;
                const scaleY = entity.yScale || entity.scaleY || 1;
                const rotation = (entity.angle || 0) * Math.PI / 180;
                
                // 🔧 Блок может быть в разных полях
                const blockEntities = block.entities || block.objects || block.geometry || [];
                console.log(`   📋 В блоке ${blockEntities.length} объектов`);
                
                if (blockEntities.length === 0) {
                    console.warn('⚠️ Блок пустой! Проверьте структуру блока:');
                    console.log('   Block keys:', Object.keys(block));
                }
                
                // Рекурсивно раскрываем вложенные блоки
                blockEntities.forEach((blockEnt, bIdx) => {
                    // Если это вложенный INSERT - раскрываем рекурсивно
                    if (blockEnt.type === 'INSERT' && blockEnt.name) {
                        console.log(`      🔁 Вложенный INSERT "${blockEnt.name}" - рекурсивное раскрытие`);
                        const nestedExpanded = expandDXFBlocksForEntity(blockEnt, insertX, insertY, scaleX, scaleY, rotation, blocks, new Set());
                        if (nestedExpanded) {
                            result.push(...nestedExpanded);
                            console.log(`      + Добавлено ${nestedExpanded.length} объектов из вложенного блока`);
                        }
                    } else {
                        const expanded = transformEntity(blockEnt, insertX, insertY, scaleX, scaleY, rotation);
                        if (expanded) {
                            result.push(expanded);
                            console.log(`      + Добавлен ${expanded.type} #${bIdx}`);
                        }
                    }
                });
                return;
            } else {
                console.warn(`⚠️ [INSERT #${idx}] Блок "${blockName}" НЕ НАЙДЕН!`);
                console.log('   🔎 Доступные имена блоков:', [...new Set(Object.keys(blocks).slice(0, 20))]);
                
                // 💡 Подсказка: возможно, файл экспортирован без BLOCKS
                if (Object.keys(blocks).length === 0) {
                    console.error('❌ Секция BLOCKS пуста! Откройте файл в текстовом редакторе и проверьте наличие:');
                    console.error('   0\\nBLOCK\\n...\\n2\\nU1\\n...\\n0\\nENDBLK');
                }
            }
        }
        // 🔧 Обработка DIMENSION с анонимным блоком
        else if (entity.type === 'DIMENSION' && entity.block) {
            console.log(`📐 DIMENSION с блоком: ${entity.block}`);
            const anonBlock = blocks[entity.block];
            if (anonBlock?.entities) {
                const exploded = anonBlock.entities.map(e =>
                    transformEntity(e, 0, 0, 1, 1, 0)
                );
                result.push(...exploded);
                console.log(`   + Exploded ${exploded.length} объектов из DIMENSION`);
                return; // заменил continue
            }
            result.push(entity);
        }
        // Пропускаем бинарные данные
        else if (entity.binaryData || entity.code === 310 || entity.value?.startsWith?.('1E')) {
            console.log('⏭️ Пропущена бинарная сущность (код 310)');
        }
        // Обычные объекты
        else {
            result.push(entity);
        }
    });
            
    console.log(`\n✅ Итог: ${result.length} объектов после раскрытия блоков`);
    return result;
}

/**
 * Применяет трансформацию к объекту (сдвиг, масштаб, поворот)
 */
function transformEntity(entity, offsetX, offsetY, scaleX, scaleY, rotation) {
    if (!entity || !entity.type) return null;
    
    // Клонирование объекта
    const cloned = JSON.parse(JSON.stringify(entity));
    
    // Вспомогательная функция для трансформации точки
    const transformPoint = (x, y) => {
        let nx = x * scaleX;
        let ny = y * scaleY;
        
        // Поворот
        if (rotation !== 0) {
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);
            const rx = nx * cos - ny * sin;
            const ry = nx * sin + ny * cos;
            nx = rx; ny = ry;
        }
        
        // Сдвиг
        return { x: nx + offsetX, y: ny + offsetY };
    };

    // Применяем трансформацию в зависимости от типа объекта
    switch (cloned.type) {
        case 'LINE':
            if (cloned.start) {
                const s = transformPoint(cloned.start.x || 0, cloned.start.y || 0);
                const e = transformPoint(cloned.end?.x || 0, cloned.end?.y || 0);
                cloned.start = { x: s.x, y: s.y };
                cloned.end = { x: e.x, y: e.y };
            }
            break;
            
        case 'CIRCLE':
            if (cloned.center) {
                // Проверка на неравномерный масштаб
                if (Math.abs(scaleX - scaleY) > 0.0001) {
                    console.warn(`⚠️ Non-uniform scale on CIRCLE: scaleX=${scaleX}, scaleY=${scaleY}. Конвертирую в ELLIPSE`);
                    // Конвертация CIRCLE → ELLIGSE
                    cloned.type = 'ELLIPSE';
                    cloned.majorAxisEndPoint = {
                        x: cloned.radius * scaleX,
                        y: 0
                    };
                    cloned.axisRatio = Math.min(scaleX, scaleY) / Math.max(scaleX, scaleY);
                    // Сохраняем центр
                    const c = transformPoint(cloned.center.x, cloned.center.y);
                    cloned.center = { x: c.x, y: c.y };
                } else {
                    // Равномерный масштаб — просто масштабируем радиус
                    cloned.radius = cloned.radius * scaleX;
                    const c = transformPoint(cloned.center.x, cloned.center.y);
                    cloned.center = { x: c.x, y: c.y };
                }
            }
            break;

        case 'ARC':
            if (cloned.center) {
                if (scaleX !== 1 || scaleY !== 1) {
                    cloned.radius = cloned.radius * Math.sqrt(scaleX * scaleY);
                }
                const c = transformPoint(cloned.center.x, cloned.center.y);
                cloned.center = { x: c.x, y: c.y };
                // Поворот углов дуги
                if (rotation !== 0) {
                    cloned.startAngle = (cloned.startAngle || 0) + rotation;
                    cloned.endAngle = (cloned.endAngle || 0) + rotation;
                }
            }
            break;

        case 'LWPOLYLINE':
        case 'POLYLINE':
            if (cloned.vertices && Array.isArray(cloned.vertices)) {
                cloned.vertices = cloned.vertices.map(v => {
                    if (v && typeof v === 'object') {
                        const p = transformPoint(v.x || 0, v.y || 0);
                        return { ...v, x: p.x, y: p.y };
                    }
                    return v;
                });
            }
            break;

        case 'POINT':
            if (cloned.position) {
                const p = transformPoint(cloned.position.x || 0, cloned.position.y || 0);
                cloned.position = { x: p.x, y: p.y };
            }
            break;

        // Для остальных типов — базовая трансформация координат
        default:
            ['x', 'y', 'cx', 'cy', 'x1', 'y1', 'x2', 'y2'].forEach(key => {
                if (cloned[key] !== undefined && typeof cloned[key] === 'number') {
                    const isX = key.includes('x');
                    const isY = key.includes('y');
                    let val = cloned[key];
                    
                    if (isX) val *= scaleX;
                    if (isY) val *= scaleY;
                    if (rotation !== 0 && (isX || isY)) {
                        const angle = isX ? 0 : Math.PI/2;
                        val = val * Math.cos(rotation + angle);
                    }
                    val += isX ? offsetX : offsetY;
                    cloned[key] = val;
                }
            });
    }
    
    return cloned;
}

/**
 * Рекурсивно раскрывает вложенный INSERT с трансформацией
 */
function expandDXFBlocksForEntity(insertEntity, parentX, parentY, parentScaleX, parentScaleY, parentRotation, blocks, visited = new Set()) {
    const blockName = insertEntity.name.toString().trim();
    
    // 🔒 Защита от циклических ссылок
    if (visited.has(blockName)) {
        console.warn(`⚠️ Циклическая ссылка блока: ${blockName}`);
        return [];
    }
    
    // Создаём новый Set с добавленным блоком
    const newVisited = new Set(visited);
    newVisited.add(blockName);
    
    const block = blocks[blockName] 
        || blocks[blockName.toUpperCase()] 
        || blocks[blockName.toLowerCase()]
        || Object.values(blocks).find(b => 
            b?.name?.toString().trim() === blockName ||
            b?.name?.toString().trim().toUpperCase() === blockName.toUpperCase()
        );
    
    if (!block) {
        console.warn(`⚠️ Вложенный блок "${blockName}" не найден!`);
        return [];
    }
    
    const insertX = parentX + (insertEntity.position?.x || insertEntity.x || 0) * parentScaleX;
    const insertY = parentY + (insertEntity.position?.y || insertEntity.y || 0) * parentScaleY;
    const scaleX = (insertEntity.xScale || insertEntity.scaleX || 1) * parentScaleX;
    const scaleY = (insertEntity.yScale || insertEntity.scaleY || 1) * parentScaleY;
    const rotation = ((insertEntity.angle || 0) * Math.PI / 180) + parentRotation;
    
    const blockEntities = block.entities || block.objects || block.geometry || [];
    const result = [];
    
    blockEntities.forEach(blockEnt => {
        if (blockEnt.type === 'INSERT' && blockEnt.name) {
            // Ещё один уровень вложенности - рекурсия с новым visited
            const nestedExpanded = expandDXFBlocksForEntity(blockEnt, insertX, insertY, scaleX, scaleY, rotation, blocks, newVisited);
            result.push(...nestedExpanded);
        } else {
            const expanded = transformEntity(blockEnt, insertX, insertY, scaleX, scaleY, rotation);
            if (expanded) result.push(expanded);
        }
    });

    return result;
}

async function importDXF(file) {
    if (!file) return null;

    dxfFileName = file.name.replace(/\.dxf$/i, '');

    try {
        const text = await file.text();
        
        let dxf;
        if (typeof DxfParser !== 'undefined') {
            const parser = new DxfParser();
            dxf = parser.parseSync(text);
        } else {
            console.error('DxfParser не подключён');
            alert('❌ Ошибка: библиотека dxf-parser не подключена');
            return null;
        }
        
        // ═══════════════════════════════════════════════════════
        // ПОЛНАЯ ОТЛАДКА СТРУКТУРЫ DXF
        // ═══════════════════════════════════════════════════════
        console.log('🔍 === ПОЛНАЯ СТРУКТУРА DXF ===');
        console.log('Top-level keys:', Object.keys(dxf));
        
        if (dxf.tables) {
            console.log('dxf.tables keys:', Object.keys(dxf.tables));
            if (dxf.tables.blocks) {
                console.log('dxf.tables.blocks type:', typeof dxf.tables.blocks);
                console.log('dxf.tables.blocks:', dxf.tables.blocks);
            }
        }
        
        if (dxf.blocks) {
            console.log('dxf.blocks type:', typeof dxf.blocks);
            console.log('dxf.blocks:', dxf.blocks);
        }
        
        if (dxf._blocks) {
            console.log('dxf._blocks:', dxf._blocks);
        }
        
        // Проверяем секции
        if (dxf.sections) {
            console.log('dxf.sections:', dxf.sections);
        }

        // ═══════════════════════════════════════════════════════
        // PREPROCESS DXF ENTITIES
        // ═══════════════════════════════════════════════════════
        const preprocessedEntities = preprocessDXFEntities(dxf);

        console.log('DXF Entities (после preprocess):', preprocessedEntities.length);

        importedObjects = [];
        preprocessedEntities.forEach(entity => {
            convertDXFEntity(entity);
        });

        if (importedObjects.length === 0) {
            alert('⚠️ В DXF файле не найдено поддерживаемых объектов');
            return null;
        }

        // ═══════════════════════════════════════════════════════
        // ИНВЕРСИЯ Y: DXF (Y-up) → Canvas (Y-down)
        // ═══════════════════════════════════════════════════════
        // Без инверсии вся фигура зеркальна по вертикали, и дуги
        // "выпуклостью вниз" в DXF становятся "выпуклостью вверх"
        // в Canvas, ломая замкнутые контуры (замочная скважина и т.п.)
        const tempBounds = calculateBounds(importedObjects);
        const dxfMaxY = tempBounds.maxY;
        importedObjects.forEach(obj => invertY(obj, dxfMaxY));
        console.log(`🔄 Инверсия Y: maxY=${dxfMaxY.toFixed(2)}`);

        dxfBounds = calculateBounds(importedObjects);
        console.log('DXF Import Bounds (после инверсии Y):', dxfBounds);

        return {
            objects: importedObjects,
            bounds: dxfBounds,
            fileName: dxfFileName,
            entityCount: preprocessedEntities.length
        };

    } catch (err) {
        console.error('Ошибка импорта DXF:', err);
        alert('❌ Не удалось распарсить DXF: ' + err.message);
        return null;
    }
}

function invertY(obj, maxY) {
    if (obj.type === 'line') {
        obj.y1 = maxY - obj.y1;
        obj.y2 = maxY - obj.y2;
    } else if (obj.type === 'circle') {
        obj.cy = maxY - obj.cy;
    } else if (obj.type === 'rect') {
        obj.y = maxY - obj.y - obj.height;
    } else if (obj.type === 'polygon') {
        obj.cy = maxY - obj.cy;
    }
}

function extractBulgeValues(entity) {
    const bulgeArray = [];

    if (entity.vertexData && Array.isArray(entity.vertexData)) {
        for (let i = 0; i < entity.vertexData.length; i++) {
            const vd = entity.vertexData[i];
            if (vd && vd.bulge !== undefined) {
                bulgeArray.push(vd.bulge);
            } else if (typeof vd === 'object' && vd.code === 42) {
                bulgeArray.push(vd.value);
            }
        }
    }

    if (bulgeArray.length === 0 && entity.vertices && entity.vertices.length > 0) {
        entity.vertices.forEach((v) => {
            let bulge = 0;
            if (v.bulge !== undefined) bulge = v.bulge;
            else if (v.b !== undefined) bulge = v.b;
            else if (Array.isArray(v) && v.length > 2) bulge = v[2];
            bulgeArray.push(bulge);
        });
    }

    return bulgeArray;
}

function convertDXFEntity(entity) {
    console.log('Обработка entity:', entity.type, entity);
    
    switch (entity.type) {
        case 'LINE':
            let startX, startY, endX, endY;
            
            if (entity.start && entity.end) {
                startX = entity.start.x ?? entity.start[0] ?? 0;
                startY = entity.start.y ?? entity.start[1] ?? 0;
                endX = entity.end.x ?? entity.end[0] ?? 0;
                endY = entity.end.y ?? entity.end[1] ?? 0;
            } else if (entity.vertices && entity.vertices.length === 2) {
                const v1 = entity.vertices[0];
                const v2 = entity.vertices[1];
                startX = v1.x ?? v1[0] ?? 0;
                startY = v1.y ?? v1[1] ?? 0;
                endX = v2.x ?? v2[0] ?? 0;
                endY = v2.y ?? v2[1] ?? 0;
            } else {
                console.log('LINE без координат, пропущено');
                break;
            }
            
            const line = new Line(startX, startY, endX, endY);
            importedObjects.push(line);
            break;

        case 'CIRCLE':
            if (entity.center && entity.center.x !== undefined && entity.center.y !== undefined && entity.radius) {
                const circle = new Circle(
                    entity.center.x,
                    entity.center.y,
                    entity.radius
                );
                importedObjects.push(circle);
            }
            break;

        case 'LWPOLYLINE':
            if (!entity.vertices || entity.vertices.length === 0) break;

            const normalizedVertices = entity.vertices.map(v => {
                if (Array.isArray(v)) {
                    return { x: v[0] ?? 0, y: v[1] ?? 0 };
                } else if (v && typeof v === 'object') {
                    return {
                        x: v.x ?? v[0] ?? 0,
                        y: v.y ?? v[1] ?? 0
                    };
                }
                return null;
            }).filter(v => v !== null);

            if (normalizedVertices.length < 2) break;

            const bulgeArray = extractBulgeValues(entity);
            const hasArcs = bulgeArray.some((b, i) => i < normalizedVertices.length && Math.abs(b) > 0.001);

            if (!hasArcs && normalizedVertices.length === 4 && isRectangle(normalizedVertices)) {
                const rect = createRectFromVertices(normalizedVertices);
                importedObjects.push(rect);
            } else {
                for (let i = 0; i < normalizedVertices.length; i++) {
                    const v1 = normalizedVertices[i];
                    const v2 = normalizedVertices[(i + 1) % normalizedVertices.length];
                    let bulge = bulgeArray[i] || 0;

                    if (Math.abs(bulge) < 0.001) {
                        const line = new Line(v1.x, v1.y, v2.x, v2.y);
                        importedObjects.push(line);
                    } else {
                        const arcLines = approximateBulgeArc(v1, v2, bulge);
                        importedObjects.push(...arcLines);
                    }
                }
            }
            break;

        case 'POLYLINE':
            if (entity.vertices && entity.vertices.length > 0) {
                const normalizedVertices = entity.vertices.map(v => {
                    if (Array.isArray(v)) {
                        return { x: v[0] ?? 0, y: v[1] ?? 0 };
                    } else if (v && typeof v === 'object') {
                        return { x: v.x ?? v[0] ?? 0, y: v.y ?? v[1] ?? 0 };
                    }
                    return null;
                }).filter(v => v !== null);

                // Проверка: полилиния замкнута?
                const isClosed = entity.closed === true || entity.shape === true;
                
                // Рисуем все сегменты
                const vertexCount = isClosed ? normalizedVertices.length : normalizedVertices.length - 1;
                for (let i = 0; i < vertexCount; i++) {
                    const v1 = normalizedVertices[i];
                    const v2 = normalizedVertices[(i + 1) % normalizedVertices.length];
                    const line = new Line(v1.x, v1.y, v2.x, v2.y);
                    importedObjects.push(line);
                }
            }
            break;

        case 'ARC':
        case 'Arc':
        case 'arc':
            if (entity.center && entity.center.x !== undefined && entity.center.y !== undefined &&
                entity.radius && entity.radius > 0) {
                
                const arcLines = approximateArc(entity);
                importedObjects.push(...arcLines);
            }
            break;

        case 'ELLIPSE':
            if (entity.center && entity.majorAxisEndPoint && entity.axisRatio) {
                const ellipseLines = approximateEllipse(entity);
                importedObjects.push(...ellipseLines);
            }
            break;

        case 'SPLINE':
            if (entity.fitPoints && entity.fitPoints.length > 0) {
                const splineLines = approximateSpline(entity.fitPoints);
                importedObjects.push(...splineLines);
            } else if (entity.controlPoints && entity.controlPoints.length > 0) {
                const splineLines = approximateSpline(entity.controlPoints);
                importedObjects.push(...splineLines);
            }
            break;

         case 'INSERT':
            // INSERT должен быть раскрыт в expandDXFBlocks, но если попал сюда — предупреждаем
            console.warn(`⚠️ INSERT "${entity.name}" не был раскрыт — проверьте секцию BLOCKS в файле`);
            break;
            default:
            console.log('Пропущена entity:', entity.type);
    }
}

function isRectangle(vertices) {
    if (vertices.length !== 4) return false;
    
    for (let i = 0; i < 4; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % 4];
        const v3 = vertices[(i + 2) % 4];
        
        const dx1 = v2.x - v1.x;
        const dy1 = v2.y - v1.y;
        const dx2 = v3.x - v2.x;
        const dy2 = v3.y - v2.y;
        
        const dot = dx1 * dx2 + dy1 * dy2;
        if (Math.abs(dot) > 0.1) return false;
    }
    
    return true;
}

function createRectFromVertices(vertices) {
    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);
    
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    return new Rect(minX, minY, maxX - minX, maxY - minY);
}

// ═══════════════════════════════════════════════════════════════
// ИСПРАВЛЕННАЯ ФУНКЦИЯ ДЛЯ ARC (с конвертацией градусов в радианы)
// ═══════════════════════════════════════════════════════════════

let arcDebugCounter = 1;

function approximateArc(arc) {
    const lines = [];

    let centerX = arc.center.x;
    let centerY = arc.center.y;
    let radius = arc.radius;

    let startAngle = arc.startAngle;
    let endAngle = arc.endAngle;

    if (Math.abs(startAngle) > Math.PI * 2 || Math.abs(endAngle) > Math.PI * 2) {
        startAngle *= Math.PI / 180;
        endAngle *= Math.PI / 180;
    }

    let sweepAngle = endAngle - startAngle;
    while (sweepAngle <= 0) sweepAngle += Math.PI * 2;

    const segments = Math.max(8, Math.ceil(sweepAngle / (Math.PI / 18)));
    const step = sweepAngle / segments;

    let prevX = centerX + Math.cos(startAngle) * radius;
    let prevY = centerY + Math.sin(startAngle) * radius;

    for (let i = 1; i <= segments; i++) {
        const angle = startAngle + step * i;

        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        lines.push(new Line(prevX, prevY, x, y));

        prevX = x;
        prevY = y;
    }

    return lines;
}

function approximateBulgeArc(v1, v2, bulge) {
    const lines = [];
    
    if (!v1 || !v2 || v1.x === undefined || v1.y === undefined || 
        v2.x === undefined || v2.y === undefined) {
        return lines;
    }
    
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const chordLength = Math.sqrt(dx * dx + dy * dy);
    
    if (chordLength < 0.001) {
        lines.push(new Line(v1.x, v1.y, v2.x, v2.y));
        return lines;
    }
    
    try {
        if (Math.abs(bulge) < 0.001) {
            lines.push(new Line(v1.x, v1.y, v2.x, v2.y));
            return lines;
        }
        
        // Угол дуги: theta = 4 * atan(|bulge|)
        const theta = 4 * Math.atan(Math.abs(bulge));

        const sinThetaHalf = Math.sin(theta / 2);
        if (Math.abs(sinThetaHalf) < 0.0001) {
            lines.push(new Line(v1.x, v1.y, v2.x, v2.y));
            return lines;
        }
        
        const radius = chordLength / (2 * sinThetaHalf);
        if (!isFinite(radius) || radius > 1e10) {
            lines.push(new Line(v1.x, v1.y, v2.x, v2.y));
            return lines;
        }

        const mx = (v1.x + v2.x) / 2;
        const my = (v1.y + v2.y) / 2;

        const dist = Math.sqrt(Math.abs(radius * radius - (chordLength * chordLength) / 4));

        // Левый перпендикуляр: (-dy, dx)
        const leftPerpX = -dy / chordLength;
        const leftPerpY = dx / chordLength;

        // bulge > 0 → центр слева (CCW), bulge < 0 → центр справа (CW)
        const cx = mx + leftPerpX * dist * Math.sign(bulge);
        const cy = my + leftPerpY * dist * Math.sign(bulge);

        if (!isFinite(cx) || !isFinite(cy)) {
            lines.push(new Line(v1.x, v1.y, v2.x, v2.y));
            return lines;
        }

        // Начальный и конечный углы (стандартные формулы)
        const startAngle = Math.atan2(v1.y - cy, v1.x - cx);
        const endAngle   = Math.atan2(v2.y - cy, v2.x - cx);

        // Правильное направление на основе bulge (без double inversion)
        let sweepAngle = endAngle - startAngle;
        
        // bulge > 0 → CCW, bulge < 0 → CW
        if (bulge >= 0) {
            while (sweepAngle < 0) sweepAngle += 2 * Math.PI;
        } else {
            while (sweepAngle > 0) sweepAngle -= 2 * Math.PI;
        }

        const segments = Math.max(8, Math.min(50, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 36))));
        const angleStep = sweepAngle / segments;

        // Начинаем от v1 (стандартное направление)
        let prevX = v1.x;
        let prevY = v1.y;

        for (let i = 1; i <= segments; i++) {
            const angle = startAngle + i * angleStep;
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;

            if (isFinite(x) && isFinite(y) && isFinite(prevX) && isFinite(prevY)) {
                lines.push(new Line(prevX, prevY, x, y));
            }
            prevX = x;
            prevY = y;
        }
        
    } catch (err) {
        console.error('Ошибка в approximateBulgeArc:', err);
        lines.push(new Line(v1.x, v1.y, v2.x, v2.y));
    }
    
    return lines.length > 0 ? lines : [new Line(v1.x, v1.y, v2.x, v2.y)];
}

function approximateEllipse(ellipse) {
    const lines = [];
    const segments = 36;
    
    const a = Math.sqrt(ellipse.majorAxisEndPoint.x * ellipse.majorAxisEndPoint.x + 
                        ellipse.majorAxisEndPoint.y * ellipse.majorAxisEndPoint.y);
    const b = a * ellipse.axisRatio;
    const rotation = Math.atan2(ellipse.majorAxisEndPoint.y, ellipse.majorAxisEndPoint.x);
    
    // Исправлено: i < segments (без лишнего сегмента)
    for (let i = 0; i < segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        const nextAngle = (2 * Math.PI * (i + 1)) / segments;
        
        const x1 = ellipse.center.x + (a * Math.cos(angle) * Math.cos(rotation) - b * Math.sin(angle) * Math.sin(rotation));
        const y1 = ellipse.center.y + (a * Math.cos(angle) * Math.sin(rotation) + b * Math.sin(angle) * Math.cos(rotation));
        const x2 = ellipse.center.x + (a * Math.cos(nextAngle) * Math.cos(rotation) - b * Math.sin(nextAngle) * Math.sin(rotation));
        const y2 = ellipse.center.y + (a * Math.cos(nextAngle) * Math.sin(rotation) + b * Math.sin(nextAngle) * Math.cos(rotation));
        
        lines.push(new Line(x1, y1, x2, y2));
    }
    
    return lines;
}

function approximateSpline(points) {
    const lines = [];
    
    if (points.length < 2) return lines;

    if (points.length <= 3) {
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            if (p1.x !== undefined && p1.y !== undefined && p2.x !== undefined && p2.y !== undefined) {
                lines.push(new Line(p1.x, p1.y, p2.x, p2.y));
            }
        }
        return lines;
    }

    const segmentsPerSpan = 10;
    
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        
        if (p1.x === undefined || p1.y === undefined || p2.x === undefined || p2.y === undefined) {
            continue;
        }

        const prev = i > 0 ? points[i - 1] : p1;
        const next = i < points.length - 2 ? points[i + 2] : p2;

        const t1x = (p2.x - prev.x) / 2;
        const t1y = (p2.y - prev.y) / 2;
        const t2x = (next.x - p1.x) / 2;
        const t2y = (next.y - p1.y) / 2;

        const cp1x = p1.x + t1x / 3;
        const cp1y = p1.y + t1y / 3;
        const cp2x = p2.x - t2x / 3;
        const cp2y = p2.y - t2y / 3;

        let prevX = p1.x;
        let prevY = p1.y;

        for (let j = 1; j <= segmentsPerSpan; j++) {
            const t = j / segmentsPerSpan;
            const t2 = t * t;
            const t3 = t2 * t;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;

            const x = mt3 * p1.x + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * p2.x;
            const y = mt3 * p1.y + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * p2.y;

            lines.push(new Line(prevX, prevY, x, y));
            prevX = x;
            prevY = y;
        }
    }

    return lines;
}

function calculateBounds(objects) {
    console.log('=== ВЫЧИСЛЕНИЕ ГРАНИЦ ===');
    console.log('Объектов для вычисления границ:', objects.length);
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let objectsWithPoints = 0;
    let invalidObjects = 0;
    
    objects.forEach(obj => {
        if (obj.type === 'line') {
            // Проверка: координаты определены?
            if (typeof obj.x1 !== 'number' || typeof obj.y1 !== 'number' ||
                typeof obj.x2 !== 'number' || typeof obj.y2 !== 'number') {
                console.warn(`⚠️ Line с невалидными координатами:`, obj);
                invalidObjects++;
                return;
            }
            objectsWithPoints++;
            minX = Math.min(minX, obj.x1, obj.x2);
            maxX = Math.max(maxX, obj.x1, obj.x2);
            minY = Math.min(minY, obj.y1, obj.y2);
            maxY = Math.max(maxY, obj.y1, obj.y2);
        } else if (obj.type === 'circle') {
            if (typeof obj.cx !== 'number' || typeof obj.cy !== 'number' || typeof obj.radius !== 'number') {
                console.warn(`⚠️ Circle с невалидными координатами:`, obj);
                invalidObjects++;
                return;
            }
            objectsWithPoints++;
            minX = Math.min(minX, obj.cx - obj.radius);
            maxX = Math.max(maxX, obj.cx + obj.radius);
            minY = Math.min(minY, obj.cy - obj.radius);
            maxY = Math.max(maxY, obj.cy + obj.radius);
        } else if (obj.type === 'rect') {
            if (typeof obj.x !== 'number' || typeof obj.y !== 'number' ||
                typeof obj.width !== 'number' || typeof obj.height !== 'number') {
                console.warn(`⚠️ Rect с невалидными координатами:`, obj);
                invalidObjects++;
                return;
            }
            objectsWithPoints++;
            minX = Math.min(minX, obj.x);
            maxX = Math.max(maxX, obj.x + obj.width);
            minY = Math.min(minY, obj.y);
            maxY = Math.max(maxY, obj.y + obj.height);
        }
    });
    
    console.log(`Объектов с валидными координатами: ${objectsWithPoints}`);
    if (invalidObjects > 0) {
        console.warn(`⚠️ Невалидных объектов: ${invalidObjects}`);
    }
    console.log(`Границы: minX=${minX}, minY=${minY}, maxX=${maxX}, maxY=${maxY}`);
    console.log(`Ширина=${maxX - minX}, Высота=${maxY - minY}`);
    
    return {
        minX, minY, maxX, maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

function drawImportPreview(svgElement) {
    if (!svgElement) return;
    
    svgElement.innerHTML = '';
    
    if (importedObjects.length === 0) {
        console.log('Нет объектов для отрисовки');
        return;
    }
    
    console.log('=== ОТРИСОВКА PREVIEW ===');
    console.log('Объектов для отрисовки:', importedObjects.length);
    
    const bounds = calculateBounds(importedObjects);
    console.log('Границы для отрисовки:', bounds);
    
    const padding = 20;
    const svgWidth = parseFloat(svgElement.getAttribute('width')) || 600;
    const svgHeight = parseFloat(svgElement.getAttribute('height')) || 400;
    
    const scaleX = (svgWidth - 2 * padding) / bounds.width;
    const scaleY = (svgHeight - 2 * padding) / bounds.height;
    const scale = Math.min(scaleX, scaleY, 1);
    
    const offsetX = (svgWidth - bounds.width * scale) / 2 - bounds.minX * scale + padding;
    const offsetY = (svgHeight - bounds.height * scale) / 2 - bounds.minY * scale + padding;
    
    console.log(`Масштаб: ${scale}, offsetX: ${offsetX}, offsetY: ${offsetY}`);
    
    let drawnLines = 0;
    
    importedObjects.forEach(obj => {
        if (obj.type === 'line') {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            const x1 = obj.x1 * scale + offsetX;
            const y1 = obj.y1 * scale + offsetY;
            const x2 = obj.x2 * scale + offsetX;
            const y2 = obj.y2 * scale + offsetY;
            
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('stroke', '#007acc');
            line.setAttribute('stroke-width', '1.5');
            svgElement.appendChild(line);
            drawnLines++;
        }
    });
    
    console.log(`Отрисовано линий: ${drawnLines}`);
    console.log(`Всего элементов в SVG: ${svgElement.children.length}`);
}

function createPartFromImport(quantity, name) {
    if (importedObjects.length === 0) {
        alert('⚠️ Нет импортированных объектов');
        return null;
    }

    const bounds = calculateBounds(importedObjects);
    
    const offsetX = -bounds.minX;
    const offsetY = -bounds.minY;

    const copyObjects = importedObjects.map(obj => {
        if (obj.type === 'line') {
            return new Line(
                obj.x1 + offsetX, obj.y1 + offsetY,
                obj.x2 + offsetX, obj.y2 + offsetY
            );
        } else if (obj.type === 'circle') {
            return new Circle(
                obj.cx + offsetX, obj.cy + offsetY,
                obj.radius
            );
        } else if (obj.type === 'rect') {
            return new Rect(
                obj.x + offsetX, obj.y + offsetY,
                obj.width, obj.height
            );
        } else if (obj.type === 'polygon') {
            return new Polygon(
                obj.cx + offsetX, obj.cy + offsetY,
                obj.radius, obj.sides
            );
        }
        return obj;
    });

    const normalizedBounds = calculateBounds(copyObjects);

    const part = {
        id: typeof currentPartId !== 'undefined' ? ++currentPartId : Date.now(),
        objects: copyObjects,
        quantity: quantity,
        name: name || dxfFileName || `Импорт #${Date.now()}`,
        thickness: 0.8,  // Добавляем толщину по умолчанию
        bounds: {
            minX: 0,
            minY: 0,
            width: normalizedBounds.width,
            height: normalizedBounds.height
        },
        nestingEnabled: true,
        visible: false,
        rotationMode: 'auto',
        oneCutEnabled: false,  // Добавляем "В один рез"
        noRotate: false,  // Добавляем "Не вращать"
        spacing: 3
    };

    if (typeof parts !== 'undefined') {
        console.log(`✅ [DXF Import] Создана деталь #${part.id} "${part.name}"`);
        console.log(`   currentPartId = ${currentPartId}`);
        console.log(`   parts.length = ${parts.length}`);
        
        parts.push(part);
        if (typeof syncGlobalsToStore === 'function') syncGlobalsToStore();
        if (typeof updatePartsList === 'function') updatePartsList();
        if (typeof saveToCache === 'function') saveToCache();
    }

    console.log('✅ Импортирована деталь:', part);
    return part;
}

function resetImport() {
    importedObjects = [];
    dxfBounds = {};
    dxfFileName = '';
}