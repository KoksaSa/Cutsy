// ═══════════════════════════════════════════════════════════════
// ИМПОРТ ДЕТАЛЕЙ ИЗ DXF — С ПОДДЕРЖКОЙ БЛОКОВ ("макро" файлы)
// v5.01: $INSUNITS scaling, ELLIPSE partial arcs, POLYLINE bulge,
//        ARC angle fix (always degrees→radians), custom parser fallback
// ═══════════════════════════════════════════════════════════════

let importedObjects = [];
let dxfBounds = {};
let dxfFileName = '';

// ═══════════════════════════════════════════════════════════════
// КЛАСС ДУГИ (Arc) — сохраняет данные дуги вместо линеаризации
// ═══════════════════════════════════════════════════════════════

function Arc(cx, cy, radius, startAngle, endAngle, direction) {
    this.type = 'arc';
    this.cx = cx;           // центр X
    this.cy = cy;           // центр Y
    this.radius = radius;   // радиус
    this.startAngle = startAngle;  // начальный угол (рад)
    this.endAngle = endAngle;      // конечный угол (рад)
    this.direction = direction;    // 'CW' или 'CCW'
}

Arc.prototype.getPoints = function(segments) {
    // Возвращает массив точек для отрисовки/экспорта
    segments = segments || 36;
    const pts = [];
    let sweep;
    if (this.direction === 'CW') {
        sweep = this.startAngle - this.endAngle;
        if (sweep < 0) sweep += Math.PI * 2;
    } else {
        sweep = this.endAngle - this.startAngle;
        if (sweep < 0) sweep += Math.PI * 2;
    }
    const step = sweep / segments;
    const dir = this.direction === 'CW' ? -1 : 1;
    for (let i = 0; i <= segments; i++) {
        const angle = this.startAngle + dir * step * i;
        pts.push({
            x: this.cx + Math.cos(angle) * this.radius,
            y: this.cy + Math.sin(angle) * this.radius
        });
    }
    return pts;
};

Arc.prototype.getStartPoint = function() {
    return {
        x: this.cx + Math.cos(this.startAngle) * this.radius,
        y: this.cy + Math.sin(this.startAngle) * this.radius
    };
};

Arc.prototype.getEndPoint = function() {
    return {
        x: this.cx + Math.cos(this.endAngle) * this.radius,
        y: this.cy + Math.sin(this.endAngle) * this.radius
    };
};

Arc.prototype.getLength = function() {
    let sweep;
    if (this.direction === 'CW') {
        sweep = this.startAngle - this.endAngle;
        if (sweep < 0) sweep += Math.PI * 2;
    } else {
        sweep = this.endAngle - this.startAngle;
        if (sweep < 0) sweep += Math.PI * 2;
    }
    return Math.abs(sweep) * this.radius;
};

Arc.prototype.draw = function(ctx) {
    // Защита: нулевой или отрицательный радиус
    if (!this.radius || this.radius <= 0) return;
    // Отрисовка через getPoints() — надёжнее чем ctx.arc(),
    // т.к. не зависит от ccw-флага и проблем Y-инверсии углов.
    const pts = this.getPoints(48);
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
};

Arc.prototype.contains = function(x, y) {
    const dx = x - this.cx;
    const dy = y - this.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return Math.abs(dist - this.radius) < 3;
};

Object.defineProperty(Arc.prototype, 'center', {
    get: function() { return { x: this.cx, y: this.cy }; }
});

Object.defineProperty(Arc.prototype, 'length', {
    get: function() { return this.getLength(); }
});

Arc.prototype.move = function(dx, dy) {
    this.cx += dx;
    this.cy += dy;
};

Arc.prototype.clone = function() {
    const copy = new Arc(this.cx, this.cy, this.radius, this.startAngle, this.endAngle, this.direction);
    copy.id = Date.now() + Math.random();
    if (this._isContinuous !== undefined) copy._isContinuous = this._isContinuous;
    if (this._effectiveLineType !== undefined) copy._effectiveLineType = this._effectiveLineType;
    if (this._layerIsAuxiliary !== undefined) copy._layerIsAuxiliary = this._layerIsAuxiliary;
    if (this._fromDimensionBlock !== undefined) copy._fromDimensionBlock = this._fromDimensionBlock;
    if (this._layer !== undefined) copy._layer = this._layer;
    if (this.layer !== undefined) copy.layer = this.layer;
    if (this.color !== undefined) copy.color = this.color;
    return copy;
};

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
    
    // ═══════════════════════════════════════════════════════════
    // ТЕГИРОВАНИЕ ЛИНИЙ: осевые / пунктирные / размерные
    // ═══════════════════════════════════════════════════════════
    // Не фильтруем автоматически! Только тегируем каждую сущность,
    // чтобы UI мог показать пользователю и предложить удалить.
    const linetypeMap = buildLinetypeMap(dxf);
    const layerMap = buildLayerMap(dxf);

    for (const entity of entities) {
        if (!entity) continue;
        // Определяем эффективный тип линии
        // Приоритет: entity.lineType > raw DXF linetype (group code 6) > ByLayer
        let effectiveLT = (entity.lineType || entity.linetype || '').toString().trim();
        if (!effectiveLT) {
            // DxfParser не извлекает group code 6 — пробуем найти в raw-карте
            const handle = (entity.handle || entity._handle || '').toString().trim();
            if (handle && dxf._entityLinetypeMap) {
                const rawInfo = dxf._entityLinetypeMap.get(handle);
                if (rawInfo && rawInfo.linetype) {
                    effectiveLT = rawInfo.linetype;
                }
            }
        }
        if (!effectiveLT || effectiveLT.toUpperCase() === 'BYLAYER') {
            const layerName = (entity.layer || '').toString().trim();
            const layerInfo = layerMap.get(layerName) || layerMap.get(layerName.toUpperCase());
            effectiveLT = layerInfo ? layerInfo.linetype : 'Continuous';
        }
        if (effectiveLT.toUpperCase() === 'BYBLOCK') effectiveLT = 'Continuous';
        const ltInfo = linetypeMap.get(effectiveLT) || linetypeMap.get(effectiveLT.toUpperCase());
        entity._effectiveLineType = effectiveLT;
        entity._isContinuous = ltInfo ? ltInfo.isContinuous : true;
        entity._layerIsAuxiliary = false;
        const layerName = (entity.layer || '').toString().trim();
        if (layerName) {
            const layerInfo = layerMap.get(layerName) || layerMap.get(layerName.toUpperCase());
            if (layerInfo) entity._layerIsAuxiliary = layerInfo.isAuxiliary;
        }
        // ═══════════════════════════════════════════════════════════
        // РАЗМЕРНЫЕ БЛОКИ: если сущность пришла из блока, содержащего
        // DIMENSION (помечено _fromDimensionBlock=true), считаем её
        // вспомогательной (размерной линией / стрелкой / выноской).
        // ═══════════════════════════════════════════════════════════
        if (entity._fromDimensionBlock === true) {
            entity._layerIsAuxiliary = true;
            // Добавляем пометку, что это именно размерная линия
            // (для классификации в analyzeAuxiliaryLines)
            entity._isDimensionLine = true;
        }
    }
    
    return entities;
}

/**
 * Разбиение составных сущностей (DIMENSION, HATCH).
 * ИСПРАВЛЕНО: LEADER/MLEADER больше НЕ разбиваются на линии —
 * они полностью фильтруются в filterUnsupportedEntities().
 * Раньше explodeLeader() создавал LINE-объекты из выносок,
 * которые потом импортировались как контур детали — это было неправильно.
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
                // DIMENSION может содержать анонимный блок (*D0, *D1...)
                // с реальными линиями размера. Если блок найден —
                // раскрываем его (линии будут тегированы как вспомогательные
                // по слою и типу линии). Если блока нет — просто пропускаем.
                if (entity.block) {
                    const exploded = explodeAnonymousBlock(entity.block);
                    if (exploded.length > 0) {
                        result.push(...exploded);
                    }
                    // Нет блока — размер не имеет геометрии, пропускаем
                }
                break;
                
            case 'HATCH':
                result.push(...explodeHatch(entity));
                break;
                
            // LEADER/MLEADER — НЕ разбиваем на линии!
            // Они фильтруются в filterUnsupportedEntities()
                
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
    // Заглушка для будущей доработки
    return [];
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
 * ИСПРАВЛЕНО: добавлены TOLERANCE, TABLE (как entity), MLEADER,
 * RAY, XLINE, VIEWPORT, POINT — всё, что не является контуром детали.
 * Также фильтруются сущности на слоях Defpoints — они всегда
 * вспомогательные (точки привязки размеров и т.п.).
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
        'ATTRIB',
        'TOLERANCE',
        'TABLE',         // DXF TABLE entity (не путать с TABLE-секцией)
        'MLEADER',
        'MULTILEADER',
        'LEADER',        // Выноски — фильтруем целиком, не разбиваем на линии
        'RAY',           // Луч (бесконечный в одну сторону)
        'XLINE',         // Прямая (бесконечная в обе стороны)
        'VIEWPORT',
        'POINT',         // Точки — обычно вспомогательные
        'BODY',
        'REGION',
        '3DSOLID',
        'SURFACE',
        'EXTRUDEDSURFACE',
        'LOFTEDSURFACE',
        'REVOLVEDSURFACE',
        'SWEPTSURFACE',
        'ACAD_PROXY_ENTITY',
        'OLEFRAME',
        'OLE2FRAME',
        'SPATIAL_INDEX',
        'ARC_DIMENSION',
        'LARGE_RADIAL_DIMENSION',
        'ORDINATE_DIMENSION',
        'LINEAR_DIMENSION',
        'ALIGNED_DIMENSION',
        'ANGULAR_DIMENSION',
        'DIAMETER_DIMENSION',
        'RADIUS_DIMENSION',
        'MESH',                 // 3D-сетка (AutoCAD)
        'HELIX',                // 3D-спираль
        'ACDBPLACEHOLDER',      // Заглушка AutoCAD
        'DGNUNDERLAY',          // Подложка DGN
        'DWFUNDERLAY',          // Подложка DWF
        'PDFUNDERLAY',          // Подложка PDF
        'LIGHT',                // Источник света
        'SUN'                   // Солнечный источник света
    ];
    
    // Слои, которые всегда вспомогательные (содержат точки привязки размеров)
    const alwaysAuxiliaryLayers = ['Defpoints', 'DEFPOINTS', 'defpoints'];
    
    const filtered = entities.filter(e => {
        if (!e || !e.type) return false;
        
        // Фильтруем по типу
        if (unsupportedTypes.includes(e.type)) return false;
        
        // v3.42: Фильтруем сущности на слое Defpoints — НО только POINT,
        // не LINE/CIRCLE/ARC. Компас-3D иногда кладёт всю геометрию на Defpoints.
        const layerName = (e.layer || '').toString().trim();
        if (alwaysAuxiliaryLayers.includes(layerName)) {
            // Сохраняем геометрию (LINE, CIRCLE, ARC, LWPOLYLINE, SPLINE, ELLIPSE)
            const geometryTypes = ['LINE', 'CIRCLE', 'ARC', 'LWPOLYLINE', 'POLYLINE', 'SPLINE', 'ELLIPSE'];
            if (geometryTypes.includes(e.type)) {
                // Это геометрия на Defpoints — оставляем, но помечаем
                e._layerIsAuxiliary = true;
            } else {
                // Не геометрия (POINT, TEXT и т.д.) — фильтруем
                return false;
            }
        }
        
        return true;
    });
    return filtered;
}

// ═══════════════════════════════════════════════════════════════
// КАРТА ТИПОВ ЛИНИЙ (LTYPE) ИЗ DXF
// ═══════════════════════════════════════════════════════════════
// Определяет, является ли тип линии сплошным (Continuous) или
// с разрывами (DASHED, CENTER, HIDDEN, PHANTOM и т.д.).
// ВАЖНО: Имя типа линии НЕ определяет, сплошная она или нет!
// K5LT32768 (Компас-3D) имеет elements=0 → это сплошная линия.
// Поэтому фильтруем ТОЛЬКО по наличию штрихового шаблона.

function buildLinetypeMap(dxf) {
    const map = new Map();

    // Стандартные имена
    map.set('ByBlock', { isContinuous: true });
    map.set('BYBLOCK', { isContinuous: true });
    map.set('ByLayer', { isContinuous: true });
    map.set('BYLAYER', { isContinuous: true });
    map.set('Continuous', { isContinuous: true });
    map.set('CONTINUOUS', { isContinuous: true });

    // Известные НЕсплошные типы (стандарт AutoCAD / Компас)
    const knownDashed = [
        'DASHED', 'Dashed',
        'CENTER', 'Center', 'CENTERX2', 'CENTERTINY',
        'HIDDEN', 'Hidden', 'HIDDENX2', 'HIDDENTINY',
        'PHANTOM', 'Phantom', 'PHANTOMX2', 'PHANTOMTINY',
        'DOT', 'Dot', 'DOTX2', 'DOTTINY',
        'DASHDOT', 'DashDot', 'DASHDOTX2', 'DASHDOTTINY',
        'DIVIDE', 'Divide', 'DIVIDEX2', 'DIVIDETINY',
        'ACAD_ISO08W100', 'ACAD_ISO09W100', 'ACAD_ISO10W100',
        'ACAD_ISO11W100', 'ACAD_ISO12W100', 'ACAD_ISO13W100',
        'ACAD_ISO14W100', 'ACAD_ISO15W100',
        'JIS_08_11', 'JIS_08_15', 'JIS_08_25', 'JIS_08_37',
        'JIS_02_08', 'JIS_02_11', 'JIS_02_15',
    ];
    for (const name of knownDashed) {
        map.set(name, { isContinuous: false });
    }

    // Читаем таблицу LTYPE из DXF
    // DxfParser хранит типы линий во вложенном объекте:
    //   dxf.tables.lineType.lineTypes  (или .linetype.linetypes)
    // Поэтому нужно сначала достать вложенный объект, а уже потом
    // итерировать по его значениям.
    const ltTable = dxf?.tables?.linetype || dxf?.tables?.lineType;
    if (ltTable) {
        // Извлекаем вложенный объект с типами линий
        // Формат DxfParser: { handle: ..., lineTypes: { ByBlock: {...}, ... } }
        let ltEntries;
        if (ltTable.lineTypes || ltTable.linetypes) {
            const subObj = ltTable.lineTypes || ltTable.linetypes;
            ltEntries = Array.isArray(subObj) ? subObj : Object.values(subObj);
        } else if (Array.isArray(ltTable)) {
            ltEntries = ltTable;
        } else {
            // Возможно, таблица уже плоская (другой парсер)
            ltEntries = Object.values(ltTable).filter(v => v && v.name);
        }

        for (const lt of ltEntries) {
            if (!lt || !lt.name) continue;
            const name = lt.name.toString().trim();

            let hasDashPattern = false;
            if (lt.pattern !== undefined) {
                if (Array.isArray(lt.pattern) && lt.pattern.length > 0) hasDashPattern = true;
                if (typeof lt.pattern === 'string' && lt.pattern.length > 1) hasDashPattern = true;
            }
            // DxfParser: group code 73 → elements (количество штриховых элементов)
            if (lt.elements !== undefined && lt.elements > 0) hasDashPattern = true;
            if (lt.dashes && Array.isArray(lt.dashes) && lt.dashes.length > 0) hasDashPattern = true;

            const isContinuous = !hasDashPattern;
            if (!map.has(name)) map.set(name, { isContinuous });
            if (!map.has(name.toUpperCase())) map.set(name.toUpperCase(), { isContinuous });
        }
    }

    return map;
}

// ═══════════════════════════════════════════════════════════════
// КАРТА СЛОЁВ (LAYER) ИЗ DXF
// ═══════════════════════════════════════════════════════════════

function buildLayerMap(dxf) {
    const map = new Map();

    // Шаблоны имён вспомогательных слоёв
    const auxiliaryLayerPatterns = [
        /^осев/i, /^размер/i, /^dim/i, /^центр/i, /^center/i,
        /^axis/i, /^construct/i, /^вспомог/i, /^auxiliar/i,
        /^скрыт/i, /^hidden/i, /^пунктир/i, /^dashed/i,
        /^штриховк/i, /^hatch/i, /^text/i, /^текст/i,
        /^annotation/i, /^note/i, /^заметк/i, /^symbol/i,
        /^обознач/i, /^defpoint/i, /^_осев/i, /^_размер/i,
        /^_вспом/i, /^_dim/i, /^_center/i, /^K5_/i,
        // Fusion 360: линии гиба и зоны гиба
        /^bend/i, /^bend_extent/i,
    ];

    const layerTable = dxf?.tables?.layer;
    if (layerTable) {
        // Извлекаем вложенный объект со слоями
        // Формат DxfParser: { handle: ..., layers: { '0': {...}, 'Осевые': {...} } }
        let layerEntries;
        if (layerTable.layers) {
            const subObj = layerTable.layers;
            layerEntries = Array.isArray(subObj) ? subObj : Object.values(subObj);
        } else if (Array.isArray(layerTable)) {
            layerEntries = layerTable;
        } else {
            // Возможно, таблица уже плоская (другой парсер)
            layerEntries = Object.values(layerTable).filter(v => v && v.name);
        }

        for (const layer of layerEntries) {
            if (!layer || !layer.name) continue;
            const name = layer.name.toString().trim();

            let isAuxiliary = false;
            for (const pattern of auxiliaryLayerPatterns) {
                if (pattern.test(name)) { isAuxiliary = true; break; }
            }

            // DxfParser может не сохранять linetype для слоя;
            // в этом случае пробуем достать из DXF-текста.
            const linetype = layer.linetype || layer.lineType || 'Continuous';
            map.set(name, { linetype, isAuxiliary });
            map.set(name.toUpperCase(), { linetype, isAuxiliary });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ДОПОЛНИТЕЛЬНЫЙ ПАРСИНГ СЛОЁВ ИЗ СЫРОГО DXF
    // ═══════════════════════════════════════════════════════════
    // DxfParser часто НЕ извлекает linetype для слоя и
    // НЕ извлекает lineType (group code 6) для сущностей.
    // Поэтому мы парсим LAYER-секцию из сырого текста DXF,
    // чтобы получить связь: слой → тип линии.
    if (dxf._rawText) {
        parseLayerLinetypeFromRaw(dxf._rawText, map);
    }

    // ═══════════════════════════════════════════════════════════
    // FALLBACK: СЛОИ ИЗ СУЩНОСТЕЙ, НЕ ОПРЕДЕЛЁННЫЕ В ТАБЛИЦЕ
    // ═══════════════════════════════════════════════════════════
    // Fusion 360 и некоторые другие CAD не определяют слои вроде
    // BEND, BEND_EXTENT, OUTER_PROFILES, INTERIOR_PROFILES в
    // LAYER-таблице DXF. Однако сущности ссылаются на эти слои
    // через group code 8. Если слой не в карте — добавляем его
    // с классификацией по имени (auxiliaryLayerPatterns).
    if (dxf.entities && Array.isArray(dxf.entities)) {
        for (const entity of dxf.entities) {
            const layerName = (entity.layer || '').toString().trim();
            if (!layerName) continue;
            // Проверяем, есть ли уже этот слой в карте
            if (map.has(layerName) || map.has(layerName.toUpperCase())) continue;
            // Классифицируем по имени
            let isAuxiliary = false;
            for (const pattern of auxiliaryLayerPatterns) {
                if (pattern.test(layerName)) { isAuxiliary = true; break; }
            }
            const entry = { linetype: 'Continuous', isAuxiliary };
            map.set(layerName, entry);
            map.set(layerName.toUpperCase(), entry);
        }
    }

    return map;
}

// ═══════════════════════════════════════════════════════════════
// ДОПОЛНИТЕЛЬНЫЙ ПАРСИНГ ИЗ СЫРОГО DXF-ТЕКСТА
// ═══════════════════════════════════════════════════════════════
// DxfParser не извлекает:
//   - linetype (group code 6) из определения слоя
//   - lineType (group code 6) из сущностей
// Поэтому мы парсим сырой текст DXF для получения этих данных.

/**
 * Парсит LAYER-секцию из сырого DXF-текста и обогащает
 * карту слоёв данными о linetype (group code 6).
 * Также помечает слои как вспомогательные по имени.
 */
function parseLayerLinetypeFromRaw(rawText, layerMap) {
    if (!rawText) return;

    // Разбиваем на строки для парсинга
    const lines = rawText.split(/\r?\n/);
    let inLayerSection = false;
    let currentLayerName = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Ищем начало LAYER-таблицы
        if (line === 'LAYER' && i > 0 && lines[i - 1].trim() === '0') {
            inLayerSection = true;
            currentLayerName = null;
            continue;
        }

        // Конец таблицы
        if (inLayerSection && line === 'ENDTAB') {
            inLayerSection = false;
            continue;
        }

        if (!inLayerSection) continue;

        // Group code 2 = имя слоя
        if (line === '2' && i + 1 < lines.length) {
            currentLayerName = lines[i + 1].trim();
        }

        // Group code 6 = linetype для слоя
        if (line === '6' && currentLayerName && i + 1 < lines.length) {
            const ltName = lines[i + 1].trim();
            const existing = layerMap.get(currentLayerName) || layerMap.get(currentLayerName.toUpperCase());
            if (existing) {
                existing.linetype = ltName;
                // Обновляем в карте (оба регистра)
                layerMap.set(currentLayerName, existing);
                layerMap.set(currentLayerName.toUpperCase(), existing);
            } else {
                // Слой не был добавлен через DxfParser — добавляем вручную
                const auxiliaryLayerPatterns = [
                    /^осев/i, /^размер/i, /^dim/i, /^центр/i, /^center/i,
                    /^axis/i, /^construct/i, /^вспомог/i, /^auxiliar/i,
                    /^скрыт/i, /^hidden/i, /^пунктир/i, /^dashed/i,
                    /^штриховк/i, /^hatch/i, /^text/i, /^текст/i,
                    /^annotation/i, /^note/i, /^заметк/i, /^symbol/i,
                    /^обознач/i, /^defpoint/i, /^_осев/i, /^_размер/i,
                    /^_вспом/i, /^_dim/i, /^_center/i, /^K5_/i,
                    /^bend/i, /^bend_extent/i,
                ];
                let isAuxiliary = false;
                for (const pattern of auxiliaryLayerPatterns) {
                    if (pattern.test(currentLayerName)) { isAuxiliary = true; break; }
                }
                const entry = { linetype: ltName, isAuxiliary };
                layerMap.set(currentLayerName, entry);
                layerMap.set(currentLayerName.toUpperCase(), entry);
            }
            currentLayerName = null; // сброс — следующий group code 6 уже не для этого слоя
        }
    }
}

/**
 * Парсит сущности из сырого DXF-текста и обогащает объекты
 * данными о lineType (group code 6), которые DxfParser не извлекает.
 * Возвращает Map: handle → linetype
 */
function parseEntityLinetypesFromRaw(rawText) {
    if (!rawText) return new Map();

    const lines = rawText.split(/\r?\n/);
    const result = new Map();
    let currentHandle = null;
    let currentLinetype = null;
    let currentLayer = null;
    let inEntities = false;
    let inBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Ищем начало ENTITIES-секции
        if (line === 'ENTITIES' && i > 0 && lines[i - 1].trim() === '2') {
            inEntities = true;
            continue;
        }

        // Ищем начало BLOCKS-секции
        if (line === 'BLOCKS' && i > 0 && lines[i - 1].trim() === '2') {
            inBlock = true;
            continue;
        }

        // Конец секции
        if (line === 'ENDSEC') {
            if (inEntities) inEntities = false;
            if (inBlock) inBlock = false;
            continue;
        }

        // Начало новой сущности (group code 0)
        if (line === '0' && i + 1 < lines.length) {
            const entityType = lines[i + 1].trim();

            // Сохраняем данные предыдущей сущности
            if ((inEntities || inBlock) && currentHandle && currentLinetype) {
                result.set(currentHandle, { linetype: currentLinetype, layer: currentLayer });
            }

            // Сброс для новой сущности
            if (inEntities || inBlock) {
                currentHandle = null;
                currentLinetype = null;
                currentLayer = null;
            }

            // Внутри BLOCKS — отслеживаем BLKSE и ENDBLK
            if (entityType === 'BLOCK') {
                // Начало определения блока — парсим его сущности
            }
            continue;
        }

        if (!inEntities && !inBlock) continue;

        // Group code 5 = handle
        if (line === '5' && i + 1 < lines.length) {
            currentHandle = lines[i + 1].trim();
        }

        // Group code 6 = linetype
        if (line === '6' && i + 1 < lines.length) {
            currentLinetype = lines[i + 1].trim();
        }

        // Group code 8 = layer
        if (line === '8' && i + 1 < lines.length) {
            currentLayer = lines[i + 1].trim();
        }
    }

    // Последняя сущность
    if (currentHandle && currentLinetype) {
        result.set(currentHandle, { linetype: currentLinetype, layer: currentLayer });
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════
// v5.01: ПАРСИНГ $INSUNITS ИЗ HEADER
// ═══════════════════════════════════════════════════════════════
// Возвращает масштабный коэффициент для конвертации в мм.
// $INSUNITS: 1=дюйм, 2=фут, 4=мм, 5=см, 6=м, 0=безразмерный
function parseInsUnitsFromRaw(rawText) {
    if (!rawText) return 1;
    const lines = rawText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '$INSUNITS' && i + 2 < lines.length) {
            // $INSUNITS → code 70 → value
            if (lines[i + 1].trim() === '70') {
                const val = parseInt(lines[i + 2].trim());
                switch (val) {
                    case 0: return 1;   // Безразмерный — не масштабируем
                    case 1: return 25.4; // Дюймы → мм
                    case 2: return 304.8; // Футы → мм
                    case 4: return 1;   // Уже мм
                    case 5: return 10;  // см → мм
                    case 6: return 1000; // м → мм
                    default: return 1;
                }
            }
        }
    }
    return 1; // По умолчанию — мм (не масштабируем)
}

// v5.01: МАСШТАБИРОВАНИЕ КООРДИНАТ СУЩНОСТЕЙ
function scaleDXFEntities(entities, scale) {
    if (!entities || scale === 1) return;
    const scalePoint = (p) => {
        if (!p) return p;
        if (typeof p.x === 'number') p.x *= scale;
        if (typeof p.y === 'number') p.y *= scale;
        return p;
    };
    for (const e of entities) {
        if (!e) continue;
        if (e.start) scalePoint(e.start);
        if (e.end) scalePoint(e.end);
        if (e.center) scalePoint(e.center);
        if (e.position) scalePoint(e.position);
        if (e.radius && typeof e.radius === 'number') e.radius *= scale;
        if (e.vertices && Array.isArray(e.vertices)) e.vertices.forEach(v => scalePoint(v));
        if (e.controlPoints && Array.isArray(e.controlPoints)) e.controlPoints.forEach(v => scalePoint(v));
        if (e.fitPoints && Array.isArray(e.fitPoints)) e.fitPoints.forEach(v => scalePoint(v));
        if (e.majorAxisEndPoint) scalePoint(e.majorAxisEndPoint);
        if (e.xScale) e.xScale *= scale;
        if (e.yScale) e.yScale *= scale;
        // INSERT position
        if (e.position) scalePoint(e.position);
    }
}

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// Возвращает сводку: какие типы вспомогательных линий содержит
// деталь, и сколько объектов каждого типа.
// Вызывается из UI для показа чекбоксов.

function analyzeAuxiliaryLines(objects) {
    if (!objects || objects.length === 0) return null;

    const categories = {
        dashed:  { label: 'Пунктирные линии', count: 0, objects: [] },
        axial:   { label: 'Осевые линии', count: 0, objects: [] },
        dim:     { label: 'Размерные линии', count: 0, objects: [] },
        bend:    { label: 'Линии гиба', count: 0, objects: [] },
        aux:     { label: 'Вспомогательные', count: 0, objects: [] },
    };

    for (const obj of objects) {
        if (!obj) continue;

        const isDashed = obj._isContinuous === false;
        const layerAux = obj._layerIsAuxiliary === true;
        const isDimLine = obj._isDimensionLine === true;
        const layerName = (obj.layer || '').toString().trim().toLowerCase();
        const lineType = (obj._effectiveLineType || '').toString().trim().toUpperCase();

        if (!isDashed && !layerAux && !isDimLine) continue; // сплошная линия на обычном слое

        // Классифицируем
        if (isDimLine) {
            // Сущность из размерного блока (Компас-3D / AutoCAD)
            categories.dim.count++;
            categories.dim.objects.push(obj);
        } else if (layerAux) {
            // По имени слоя определяем категорию
            if (/^осев|^_осев|^center|^_center|^axis/i.test(layerName) ||
                /CENTER|^AXIS/i.test(lineType)) {
                categories.axial.count++;
                categories.axial.objects.push(obj);
            } else if (/^размер|^_размер|^dim|^_dim/i.test(layerName)) {
                categories.dim.count++;
                categories.dim.objects.push(obj);
            } else if (/^bend/i.test(layerName)) {
                // Fusion 360: линии гиба (BEND, BEND_EXTENT)
                categories.bend.count++;
                categories.bend.objects.push(obj);
            } else if (/^вспомог|^_вспом|^auxiliar|^construct/i.test(layerName)) {
                categories.aux.count++;
                categories.aux.objects.push(obj);
            } else {
                // Другие вспомогательные слои (hatch, text, defpoint и т.д.)
                categories.aux.count++;
                categories.aux.objects.push(obj);
            }
        } else if (isDashed) {
            // Несплошная линия на обычном слое
            if (/CENTER|^AXIS/i.test(lineType)) {
                categories.axial.count++;
                categories.axial.objects.push(obj);
            } else {
                categories.dashed.count++;
                categories.dashed.objects.push(obj);
            }
        }
    }

    // Убираем пустые категории
    const result = {};
    let totalAux = 0;
    for (const [key, cat] of Object.entries(categories)) {
        if (cat.count > 0) {
            result[key] = { label: cat.label, count: cat.count };
            totalAux += cat.count;
        }
    }

    if (totalAux === 0) return null;

    result._totalAux = totalAux;
    return result;
}

/**
 * Раскрывает блоки и обрабатывает бинарные данные в импортированных объектах
 * @param {Object} dxf - Распарсенный DXF объект от DxfParser
 * @returns {Array} - Массив объектов с раскрытыми блоками
 */
function expandDXFBlocks(dxf) {
    if (!dxf || !dxf.entities) return [];
    
    // Нормализуем blocks в единый объект
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
        if (count > 0) { /* collected */ }
    };
    
    // Собираем блоки из всех возможных источников
    collectBlocks(dxf.blocks, 'dxf.blocks');
    collectBlocks(dxf._blocks, 'dxf._blocks');
    collectBlocks(dxf.tables?.blocks, 'dxf.tables.blocks');
    
    // ═══════════════════════════════════════════════════════════
    // ОПРЕДЕЛЕНИЕ РАЗМЕРНЫХ БЛОКОВ
    // ═══════════════════════════════════════════════════════════
    // Блоки с именами D0-D9, *D0-*D9, KDIMARROW* — это размерные
    // блоки (стрелки, выносные линии, текст размеров).
    // Все сущности из таких блоков помечаются _fromDimensionBlock=true
    // и потом тегируются как вспомогательные (размерные линии).
    const isDimensionBlock = (name) => {
        if (!name) return false;
        const n = name.toString().trim().toUpperCase();
        // *D0, *D1, ..., D0, D1, ... — анонимные размерные блоки
        if (/^\*?D\d+$/.test(n)) return true;
        // KDIMARROW_00 ... KDIMARROW_99 — стрелки размеров Компас-3D
        if (/^KDIMARROW/i.test(n)) return true;
        // U0-U99 — если содержит DIMENSION внутри, тоже размерный
        // (проверяется ниже при раскрытии)
        return false;
    };

    const result = [];
    
    (dxf.entities || []).forEach((entity, idx) => {
        if (entity.type === 'INSERT' && entity.name) {
            const blockName = entity.name.toString().trim();
            // Определяем: это размерный блок?
            const fromDimBlock = isDimensionBlock(blockName);
            
            let block = blocks[blockName] 
                || blocks[blockName.toUpperCase()] 
                || blocks[blockName.toLowerCase()]
                || Object.values(blocks).find(b => 
                    b?.name?.toString().trim() === blockName ||
                    b?.name?.toString().trim().toUpperCase() === blockName.toUpperCase() ||
                    b?.name?.toString().trim().toLowerCase() === blockName.toLowerCase()
                );
            
            if (block) {
                const insertX = entity.position?.x || entity.x || 0;
                const insertY = entity.position?.y || entity.y || 0;
                const scaleX = entity.xScale || entity.scaleX || 1;
                const scaleY = entity.yScale || entity.scaleY || 1;
                const rotation = (entity.angle || 0) * Math.PI / 180;
                
                const blockEntities = block.entities || block.objects || block.geometry || [];
                
                // Проверяем, содержит ли блок DIMENSION внутри
                // (Компас-3D оборачивает размеры в блоки U0, U3 и т.д.)
                let blockHasDimension = fromDimBlock;
                if (!blockHasDimension) {
                    for (const be of blockEntities) {
                        if (be.type === 'DIMENSION') {
                            blockHasDimension = true;
                            break;
                        }
                        // Рекурсивная проверка: вложенный INSERT в размерный блок
                        if (be.type === 'INSERT' && be.name && isDimensionBlock(be.name)) {
                            blockHasDimension = true;
                            break;
                        }
                    }
                }
                
                if (blockEntities.length === 0) {
                    console.warn('Пустой блок:', blockName);
                }
                
                // Рекурсивно раскрываем вложенные блоки
                blockEntities.forEach((blockEnt, bIdx) => {
                    if (blockEnt.type === 'INSERT' && blockEnt.name) {
                        const nestedExpanded = expandDXFBlocksForEntity(blockEnt, insertX, insertY, scaleX, scaleY, rotation, blocks, new Set());
                        if (nestedExpanded) {
                            // Помечаем все сущности из размерного блока
                            if (blockHasDimension) {
                                nestedExpanded.forEach(e => {
                                    if (e) e._fromDimensionBlock = true;
                                });
                            }
                            result.push(...nestedExpanded);
                        }
                    } else {
                        const expanded = transformEntity(blockEnt, insertX, insertY, scaleX, scaleY, rotation);
                        if (expanded) {
                            // Помечаем сущность из размерного блока
                            if (blockHasDimension) {
                                expanded._fromDimensionBlock = true;
                            }
                            result.push(expanded);
                        }
                    }
                });
                return;
            } else {
                console.warn(`Блок "${blockName}" не найден`);
            }
        }
        // Обработка DIMENSION с анонимным блоком
        else if (entity.type === 'DIMENSION' && entity.block) {
            const anonBlock = blocks[entity.block];
            if (anonBlock?.entities) {
                const exploded = anonBlock.entities.map(e => {
                    const transformed = transformEntity(e, 0, 0, 1, 1, 0);
                    if (transformed) {
                        transformed._fromDimensionBlock = true;
                    }
                    return transformed;
                }).filter(e => e !== null);
                result.push(...exploded);
                return;
            }
            result.push(entity);
        }
        // Пропускаем бинарные данные
        else if (entity.binaryData || entity.code === 310 || entity.value?.startsWith?.('1E')) {
            // бинарная сущность — пропускаем
        }
        // Обычные объекты
        else {
            result.push(entity);
        }
    });
            
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
                // cloned.startAngle/endAngle в ГРАДУСАХ (из DXF/npm-парсера),
                // rotation — в РАДИАНАХ. Конвертируем rotation в градусы.
                if (rotation !== 0) {
                    const rotDeg = rotation * 180 / Math.PI;
                    cloned.startAngle = (cloned.startAngle || 0) + rotDeg;
                    cloned.endAngle = (cloned.endAngle || 0) + rotDeg;
                }
                // v4.74: Зеркальное отражение (одно из scaleX/scaleY отрицательное)
                // меняет направление обхода дуги.
                if ((scaleX < 0) !== (scaleY < 0)) {
                    // Зеркало → направление CCW ↔ CW
                    // Углы остаются те же (отражение сохраняет atan2),
                    // но направление обхода между ними меняется.
                    if (cloned.direction === 'CW') cloned.direction = 'CCW';
                    else if (cloned.direction === 'CCW') cloned.direction = 'CW';
                }
            }
            break;

        case 'LWPOLYLINE':
        case 'POLYLINE':
            if (cloned.vertices && Array.isArray(cloned.vertices)) {
                // v4.74: Если mirror (одно из scale отрицательное), инвертируем bulge.
                // bulge > 0 = CCW, bulge < 0 = CW. При зеркале направление дуги меняется.
                const mirrorFactor = ((scaleX < 0) !== (scaleY < 0)) ? -1 : 1;
                cloned.vertices = cloned.vertices.map(v => {
                    if (v && typeof v === 'object') {
                        const p = transformPoint(v.x || 0, v.y || 0);
                        const newV = { ...v, x: p.x, y: p.y };
                        if (typeof v.bulge === 'number' && mirrorFactor === -1) {
                            newV.bulge = -v.bulge;
                        }
                        return newV;
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

        case 'SPLINE':
            // v4.74: Трансформация контрольных и fit-точек сплайна
            if (cloned.controlPoints && Array.isArray(cloned.controlPoints)) {
                cloned.controlPoints = cloned.controlPoints.map(p => {
                    if (!p) return p;
                    const tp = transformPoint(p.x || 0, p.y || 0);
                    return { ...p, x: tp.x, y: tp.y };
                });
            }
            if (cloned.fitPoints && Array.isArray(cloned.fitPoints)) {
                cloned.fitPoints = cloned.fitPoints.map(p => {
                    if (!p) return p;
                    const tp = transformPoint(p.x || 0, p.y || 0);
                    return { ...p, x: tp.x, y: tp.y };
                });
            }
            if (Array.isArray(cloned.points)) {
                cloned.points = cloned.points.map(p => {
                    if (!p) return p;
                    const tp = transformPoint(p.x || 0, p.y || 0);
                    return { ...p, x: tp.x, y: tp.y };
                });
            }
            break;

        case 'ELLIPSE':
            // v4.74: Корректная трансформация эллипса
            // - center: трансформируется как обычная точка (сдвиг + масштаб + поворот)
            // - majorAxisEndPoint: это ВЕКТОР от центра до конца большой полуоси.
            //   Он масштабируется и поворачивается, но НЕ сдвигается.
            if (cloned.center) {
                const c = transformPoint(cloned.center.x || 0, cloned.center.y || 0);
                cloned.center = { x: c.x, y: c.y };
            }
            if (cloned.majorAxisEndPoint) {
                // Вектор: только масштаб + поворот (без сдвига)
                let vx = (cloned.majorAxisEndPoint.x || 0) * scaleX;
                let vy = (cloned.majorAxisEndPoint.y || 0) * scaleY;
                if (rotation !== 0) {
                    const cos = Math.cos(rotation);
                    const sin = Math.sin(rotation);
                    const rx = vx * cos - vy * sin;
                    const ry = vx * sin + vy * cos;
                    vx = rx; vy = ry;
                }
                cloned.majorAxisEndPoint = { x: vx, y: vy };
            }
            // axisRatio: при равномерном масштабе не меняется.
            // При неравномерном — нужно корректировать. Если большая полуось
            // была X и масштабировали Y больше — axisRatio растёт.
            // Это сложная корректировка, оставляем как есть (погрешность редкая).
            break;

        // Для остальных типов — базовая трансформация прямых координат
        // (только сдвиг + масштаб, без поворота — поворот точек требует
        // одновременной обработки x и y, что невозможно в этом цикле).
        // Если у вас есть тип с x/y и поворотом INSERT — добавьте его явно выше.
        default:
            if (typeof cloned.x === 'number') cloned.x = cloned.x * scaleX + offsetX;
            if (typeof cloned.y === 'number') cloned.y = cloned.y * scaleY + offsetY;
            if (typeof cloned.cx === 'number') cloned.cx = cloned.cx * scaleX + offsetX;
            if (typeof cloned.cy === 'number') cloned.cy = cloned.cy * scaleY + offsetY;
            if (typeof cloned.x1 === 'number') cloned.x1 = cloned.x1 * scaleX + offsetX;
            if (typeof cloned.y1 === 'number') cloned.y1 = cloned.y1 * scaleY + offsetY;
            if (typeof cloned.x2 === 'number') cloned.x2 = cloned.x2 * scaleX + offsetX;
            if (typeof cloned.y2 === 'number') cloned.y2 = cloned.y2 * scaleY + offsetY;
            // Предупреждение, если есть поворот — он не применён
            if (rotation !== 0) {
                console.warn(`⚠️ transformEntity: тип "${cloned.type}" не поддерживает поворот INSERT — геометрия может быть неточной`);
            }
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
        let usedCustomParser = false;
        
        if (typeof DxfParser !== 'undefined') {
            try {
                const parser = new DxfParser();
                dxf = parser.parseSync(text);
            } catch (parseErr) {
                console.warn('⚠️ npm DxfParser не смог распарсить файл, использую кастомный парсер:', parseErr.message);
                dxf = null;
            }
        }
        
        // Fallback на кастомный парсер (dxf-parser.js)
        // Он надёжнее для нестандартных DXF от Компас-3D и Fusion 360
        if (!dxf && typeof parseDXF === 'function') {
            console.log('📋 Использую кастомный parseDXF (fallback)');
            dxf = parseDXF(text);
            usedCustomParser = true;
        }
        
        if (!dxf) {
            console.error('DxfParser не подключён');
            alert('❌ Ошибка: не удалось распарсить DXF файл. Библиотека dxf-parser не подключена.');
            return null;
        }
        
        // Сохраняем сырой текст DXF для дополнительного парсинга
        // ═══════════════════════════════════════════════════════
        // DxfParser не извлекает lineType (group code 6) из сущностей
        // и linetype (group code 6) из определений слоёв.
        // Поэтому сохраняем сырой текст для парсинга этих данных.
        dxf._rawText = text;

        // ═══════════════════════════════════════════════════════
        // v5.01: ПРОВЕРКА ЕДИНИЦ ИЗМЕРЕНИЯ ($INSUNITS)
        // ═══════════════════════════════════════════════════════
        // DXF может хранить размеры в дюймах, футах, километрах и т.д.
        // $INSUNITS определяет единицы: 1=英寸, 2=фут, 4=мм, 5=см, 6=м
        // Мы работаем в мм. Если файл в других единицах — масштабируем.
        const unitScale = parseInsUnitsFromRaw(text);
        if (unitScale !== 1 && unitScale > 0) {
            console.log(`📐 $INSUNITS: масштабирование координат ×${unitScale} (в мм)`);
            scaleDXFEntities(dxf.entities, unitScale);
        }

        // ═══════════════════════════════════════════════════════
        // ДОПОЛНИТЕЛЬНЫЙ ПАРСИНГ ТИПОВ ЛИНИЙ СУЩНОСТЕЙ
        // ═══════════════════════════════════════════════════════
        // Парсим group code 6 из ENTITIES и BLOCKS секций
        dxf._entityLinetypeMap = parseEntityLinetypesFromRaw(text);

        // ═══════════════════════════════════════════════════════
        // PREPROCESS DXF ENTITIES
        // ═══════════════════════════════════════════════════════
        const preprocessedEntities = preprocessDXFEntities(dxf);

        importedObjects = [];
        preprocessedEntities.forEach(entity => {
            const prevLength = importedObjects.length;
            convertDXFEntity(entity);
            
            // ═══════════════════════════════════════════════════════
            // ТЕГИРОВАНИЕ: переносим метаданные линий/слоёв на
            // созданные объекты (одна entity → N объектов)
            // ═══════════════════════════════════════════════════════
            const newObjects = importedObjects.slice(prevLength);
            for (const obj of newObjects) {
                if (!obj) continue;
                if (entity._isContinuous !== undefined) obj._isContinuous = entity._isContinuous;
                if (entity._layerIsAuxiliary !== undefined) obj._layerIsAuxiliary = entity._layerIsAuxiliary;
                if (entity._effectiveLineType) obj._effectiveLineType = entity._effectiveLineType;
                if (entity.layer) obj.layer = entity.layer;
                // Передаём флаг размерного блока
                if (entity._fromDimensionBlock !== undefined) obj._fromDimensionBlock = entity._fromDimensionBlock;
                if (entity._isDimensionLine !== undefined) obj._isDimensionLine = entity._isDimensionLine;

                // Пунктирные линии и вспомогательные слои (BEND, осевые и т.д.)
                // → жёлтый цвет (#FFFF79 = colorIndex 3 в CypCut = Маркировка)
                if (obj._isContinuous === false || obj._layerIsAuxiliary === true) {
                    obj.color = '#FFFF79';
                }
            }
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

        dxfBounds = calculateBounds(importedObjects);

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
    } else if (obj.type === 'arc') {
        obj.cy = maxY - obj.cy;
        // Y-инверсия для дуги:
        // При зеркале по Y: (x, y) → (x, maxY-y).
        // Точка на дуге: (cx+R*cos(a), cy+R*sin(a)) → (cx+R*cos(a), maxY-cy-R*sin(a))
        //              = (cx+R*cos(-a), cy'+R*sin(-a))
        // Поэтому: startAngle → -startAngle, endAngle → -endAngle (без swap!)
        // Направление обхода МЕНЯЕТСЯ: CW ↔ CCW
        obj.startAngle = -obj.startAngle;
        obj.endAngle = -obj.endAngle;
        obj.direction = obj.direction === 'CW' ? 'CCW' : 'CW';
    } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        // Y-инверсия для полилинии: инвертируем Y каждой точки
        if (obj.points && Array.isArray(obj.points)) {
            for (let i = 0; i < obj.points.length; i++) {
                obj.points[i].y = maxY - obj.points[i].y;
            }
        }
        if (obj.vertices && Array.isArray(obj.vertices)) {
            for (let i = 0; i < obj.vertices.length; i++) {
                obj.vertices[i].y = maxY - obj.vertices[i].y;
            }
        }
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
    // Проверка наличия необходимых классов
    if (typeof Line === 'undefined') {
        console.error('❌ Критическая ошибка: класс Line не определён. Проверьте подключение shapes.js');
        return;
    }
    if (typeof Circle === 'undefined') {
        console.error('❌ Критическая ошибка: класс Circle не определён. Проверьте подключение shapes.js');
        return;
    }
    if (typeof Rect === 'undefined') {
        console.error('❌ Критическая ошибка: класс Rect не определён. Проверьте подключение shapes.js');
        return;
    }
    
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
                break;
            }
            
            // Fallback: если класс Line не определён, создаём простой объект
            if (typeof Line !== 'undefined') {
                const line = new Line(startX, startY, endX, endY);
                importedObjects.push(line);
            } else {
                importedObjects.push({
                    type: 'line',
                    x1: startX, y1: startY,
                    x2: endX, y2: endY,
                    id: Date.now() + Math.random()
                });
            }
            break;

        case 'CIRCLE':
            if (entity.center && entity.center.x !== undefined && entity.center.y !== undefined && entity.radius) {
                // Если класс Circle определён — используем его
                if (typeof Circle !== 'undefined') {
                    const circle = new Circle(
                        entity.center.x,
                        entity.center.y,
                        entity.radius
                    );
                    importedObjects.push(circle);
                } else {
                    // Fallback: создаём простой объект
                    importedObjects.push({
                        type: 'circle',
                        cx: entity.center.x,
                        cy: entity.center.y,
                        radius: entity.radius,
                        id: Date.now() + Math.random()
                    });
                }
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

            // Проверка замкнутости LWPOLYLINE
            // В DXF group code 70 бит 0 = замкнутая полилиния
            // DxfParser может хранить это как entity.closed или entity.shape
            const isLWPolyClosed = entity.closed === true || entity.shape === true;

            const bulgeArray = extractBulgeValues(entity);
            const hasArcs = bulgeArray.some((b, i) => i < normalizedVertices.length && Math.abs(b) > 0.001);

            // Прямоугольник — только если полилиния замкнута!
            // Открытая полилиния с 4 вершинами — это НЕ прямоугольник
            if (!hasArcs && isLWPolyClosed && normalizedVertices.length === 4 && isRectangle(normalizedVertices)) {
                const rect = createRectFromVertices(normalizedVertices);
                importedObjects.push(rect);
            } else {
                // Количество сегментов: для замкнутой — все вершины соединяются,
                // для открытой — на один сегмент меньше
                const segmentCount = isLWPolyClosed ? normalizedVertices.length : normalizedVertices.length - 1;
                for (let i = 0; i < segmentCount; i++) {
                    const v1 = normalizedVertices[i];
                    const v2 = normalizedVertices[(i + 1) % normalizedVertices.length];
                    let bulge = bulgeArray[i] || 0;

                    if (Math.abs(bulge) < 0.001) {
                        // Fallback для Line
                        if (typeof Line !== 'undefined') {
                            const line = new Line(v1.x, v1.y, v2.x, v2.y);
                            importedObjects.push(line);
                        } else {
                            importedObjects.push({
                                type: 'line',
                                x1: v1.x, y1: v1.y,
                                x2: v2.x, y2: v2.y,
                                id: Date.now() + Math.random()
                            });
                        }
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
                        return { x: v[0] ?? 0, y: v[1] ?? 0, bulge: v[2] ?? 0 };
                    } else if (v && typeof v === 'object') {
                        return {
                            x: v.x ?? v[0] ?? 0,
                            y: v.y ?? v[1] ?? 0,
                            bulge: v.bulge ?? v.b ?? 0
                        };
                    }
                    return null;
                }).filter(v => v !== null);

                // Проверка: полилиния замкнута?
                const isClosed = entity.closed === true || entity.shape === true;
                
                // v5.01: Обработка bulge (дуговых сегментов) — как в LWPOLYLINE
                const vertexCount = isClosed ? normalizedVertices.length : normalizedVertices.length - 1;
                for (let i = 0; i < vertexCount; i++) {
                    const v1 = normalizedVertices[i];
                    const v2 = normalizedVertices[(i + 1) % normalizedVertices.length];
                    const bulge = v1.bulge || 0;

                    if (Math.abs(bulge) < 0.001) {
                        // Прямой сегмент
                        if (typeof Line !== 'undefined') {
                            importedObjects.push(new Line(v1.x, v1.y, v2.x, v2.y));
                        } else {
                            importedObjects.push({
                                type: 'line',
                                x1: v1.x, y1: v1.y,
                                x2: v2.x, y2: v2.y,
                                id: Date.now() + Math.random()
                            });
                        }
                    } else {
                        // Дуговой сегмент (bulge)
                        const arcLines = approximateBulgeArc(v1, v2, bulge);
                        importedObjects.push(...arcLines);
                    }
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
            {
                const splineDegree = entity.degreeOfSplineCurve || entity.degree || 3;
                // Компас-3D часто экспортирует замкнутые контуры как "открытые" сплайны,
                // у которых первая и последняя контрольная/fit-точка совпадают.
                // Поэтому проверяем не только флаг closed, но и геометрическую замкнутость.
                let isClosed = entity.closed === true;
                if (!isClosed && entity.controlPoints && entity.controlPoints.length > 1) {
                    const first = entity.controlPoints[0];
                    const last = entity.controlPoints[entity.controlPoints.length - 1];
                    const dist = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2);
                    if (dist < 0.1) isClosed = true;
                }
                if (!isClosed && entity.fitPoints && entity.fitPoints.length > 1) {
                    const first = entity.fitPoints[0];
                    const last = entity.fitPoints[entity.fitPoints.length - 1];
                    const dist = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2);
                    if (dist < 0.1) isClosed = true;
                }

                if (entity.fitPoints && entity.fitPoints.length > 0) {
                    // Fit-точки лежат НА кривой — используем Catmull-Rom
                    const splineLines = approximateSpline(entity.fitPoints);
                    importedObjects.push(...splineLines);
                } else if (entity.controlPoints && entity.controlPoints.length > 0 && entity.knotValues && entity.knotValues.length > 0) {
                    // Есть контрольные точки и узловой вектор → точная оценка B-сплайна (Де Бур)
                    // Увеличиваем segmentsPerSpan для точной тесселяции свободных кривых
                    const points = splineToPolyline(splineDegree, entity.knotValues, entity.controlPoints, isClosed, 40);
                    if (points.length >= 2) {
                        // v4.73: Проверяем, нужно ли замкнуть полилинию.
                        // Fusion 360 может экспортировать замкнутый контур как незамкнутый
                        // сплайн, где первая и последняя точки близки (но не совпадают).
                        if (!isClosed && points.length >= 3) {
                            const first = points[0];
                            const last = points[points.length - 1];
                            const closeDist = Math.hypot(first.x - last.x, first.y - last.y);
                            // Если концы ближе 1мм — замыкаем
                            if (closeDist < 1.0) {
                                isClosed = true;
                            }
                        }
                        
                        // ═══════════════════════════════════════════════════════════
                        // Сначала пробуем распознать ВЕСЬ сплайн как одну дугу.
                        // Это для слотов и окружностей, которые CAD экспортирует
                        // как B-сплайны вместо настоящих дуг.
                        // Если сплайн НЕ является простой дугой — это свободная
                        // кривая (например, контур детали из Компас-3D),
                        // и её нужно сохранить как полилинию, а НЕ разбивать
                        // на набор мелких дуг.
                        // ═══════════════════════════════════════════════════════════
                        const wholeArc = tryDetectArcFromPoints(points, 0.05);
                        
                        if (wholeArc) {
                            // Сплайн = простая дуга (слот, окружность)
                            importedObjects.push(wholeArc);
                        } else {
                            // v4.73: Свободная кривая → разбиваем на ОТДЕЛЬНЫЕ ЛИНИИ
                            // (а не одну полилинию). Это позволяет mergeObjectsToContours
                            // сшить сплайн с дугами/линиями в замкнутый контур при
                            // создании детали. Раньше создавалась незамкнутая полилиния,
                            // которая не сшивалась с другими объектами → контур рвался.
                            for (let i = 0; i < points.length - 1; i++) {
                                if (typeof Line !== 'undefined') {
                                    const line = new Line(points[i].x, points[i].y, points[i+1].x, points[i+1].y);
                                    importedObjects.push(line);
                                } else {
                                    importedObjects.push({
                                        type: 'line',
                                        x1: points[i].x, y1: points[i].y,
                                        x2: points[i+1].x, y2: points[i+1].y,
                                        id: Date.now() + Math.random() + i
                                    });
                                }
                            }
                            // Если сплайн замкнут — добавляем замыкающую линию
                            if (isClosed && points.length >= 3) {
                                const first = points[0];
                                const last = points[points.length - 1];
                                if (typeof Line !== 'undefined') {
                                    importedObjects.push(new Line(last.x, last.y, first.x, first.y));
                                } else {
                                    importedObjects.push({
                                        type: 'line',
                                        x1: last.x, y1: last.y,
                                        x2: first.x, y2: first.y,
                                        id: Date.now() + Math.random()
                                    });
                                }
                            }
                        }
                    }
                } else if (entity.controlPoints && entity.controlPoints.length > 0) {
                    // Только контрольные точки, без узлов → приближение Catmull-Rom
                    const splineLines = approximateSpline(entity.controlPoints);
                    importedObjects.push(...splineLines);
                }
            }
            break;

         case 'INSERT':
            // INSERT должен быть раскрыт в expandDXFBlocks, но если попал сюда — предупреждаем
            console.warn(`INSERT "${entity.name}" не был раскрыт — проверьте секцию BLOCKS`);
            break;
            default:
            // Неподдерживаемый тип — пропускаем
    }
}

function isRectangle(vertices) {
    if (vertices.length !== 4) return false;

    // v4.72: Проверяем что 4-угольник — axis-aligned прямоугольник
    // (стороны параллельны осям X/Y). Раньше проверялась только
    // перпендикулярность сторон — ромбы и косынки (повёрнутые квадраты)
    // тоже проходят эту проверку, но createRectFromVertices создаёт
    // axis-aligned Rect по bbox → искажение геометрии.
    //
    // Для axis-aligned прямоугольника каждая сторона должна быть
    // либо горизонтальной (dy ≈ 0), либо вертикальной (dx ≈ 0).

    for (let i = 0; i < 4; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % 4];
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;

        // Сторона должна быть либо горизонтальной, либо вертикальной
        const isHorizontal = Math.abs(dy) < 0.01;
        const isVertical = Math.abs(dx) < 0.01;

        if (!isHorizontal && !isVertical) {
            // Наклонная сторона — это не axis-aligned прямоугольник
            // (может быть ромб, косынка, или повёрнутый прямоугольник)
            return false;
        }
    }

    // Дополнительная проверка: перпендикулярность сторон
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
    
    // Fallback для Rect
    if (typeof Rect !== 'undefined') {
        return new Rect(minX, minY, maxX - minX, maxY - minY);
    } else {
        return {
            type: 'rect',
            x: minX, y: minY,
            width: maxX - minX, height: maxY - minY,
            id: Date.now() + Math.random()
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// ИСПРАВЛЕННАЯ ФУНКЦИЯ ДЛЯ ARC (с конвертацией градусов в радианы)
// ═══════════════════════════════════════════════════════════════

function approximateArc(arc) {
    // ═══════════════════════════════════════════════════════════
    // Возвращаем объект Arc вместо массива Line
    // Это сохраняет информацию о дуге для генерации G2/G3
    // ═══════════════════════════════════════════════════════════

    let centerX = arc.center.x;
    let centerY = arc.center.y;
    let radius = arc.radius;

    let startAngle = arc.startAngle;
    let endAngle = arc.endAngle;

    // DXF хранит углы ARC в ГРАДУСАХ. npm dxf-parser возвращает их как есть.
    // Кастомный parseDXF (fallback) тоже возвращает градусы (v5.01).
    // Надёжная конвертация: если значение > 2π — точно градусы.
    // Если ≤ 2π — можем проверить флаг _angleUnit.
    // Большинство реальных дуг имеют углы 0-360°, значения 1-6° (радиан)
    // практически не встречаются. Для надежности: если нет флага _angleInRadians,
    // всегда конвертируем из градусов.
    if (!arc._angleInRadians) {
        startAngle = startAngle * Math.PI / 180;
        endAngle = endAngle * Math.PI / 180;
    }

    // Определяем направление: DXF ARC всегда CCW (против часовой)
    // но sweepAngle может быть любым
    let sweepAngle = endAngle - startAngle;
    if (sweepAngle < 0) sweepAngle += Math.PI * 2;
    // В DXF дуги всегда рисуются CCW (против часовой стрелки)
    const direction = 'CCW';

    if (typeof Arc !== 'undefined') {
        return [new Arc(centerX, centerY, radius, startAngle, endAngle, direction)];
    } else {
        // Создаём упрощённую дугу как массив точек
        const points = [];
        const segments = 12;
        for (let i = 0; i <= segments; i++) {
            const angle = startAngle + (endAngle - startAngle) * (i / segments);
            points.push({
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius
            });
        }
        // Возвращаем как полилинию
        return [{ type: 'polyline', points, id: Date.now() + Math.random() }];
    }
}

function approximateBulgeArc(v1, v2, bulge) {
    // ═══════════════════════════════════════════════════════════
    // Возвращаем объект Arc вместо массива Line
    // Это сохраняет информацию о дуге для генерации G2/G3
    // ═══════════════════════════════════════════════════════════
    const result = [];
    
    if (!v1 || !v2 || v1.x === undefined || v1.y === undefined || 
        v2.x === undefined || v2.y === undefined) {
        return result;
    }
    
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const chordLength = Math.sqrt(dx * dx + dy * dy);
    
        if (chordLength < 0.001) {
            if (typeof Line !== 'undefined') {
                result.push(new Line(v1.x, v1.y, v2.x, v2.y));
            } else {
                result.push({ type: 'line', x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y, id: Date.now() + Math.random() });
            }
            return result;
        }
        
        try {
            if (Math.abs(bulge) < 0.001) {
                if (typeof Line !== 'undefined') {
                    result.push(new Line(v1.x, v1.y, v2.x, v2.y));
                } else {
                    result.push({ type: 'line', x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y, id: Date.now() + Math.random() });
                }
                return result;
            }
        
        // Угол дуги: theta = 4 * atan(|bulge|)
        const theta = 4 * Math.atan(Math.abs(bulge));

        const sinThetaHalf = Math.sin(theta / 2);
        if (Math.abs(sinThetaHalf) < 0.0001) {
            if (typeof Line !== 'undefined') {
                result.push(new Line(v1.x, v1.y, v2.x, v2.y));
            } else {
                result.push({ type: 'line', x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y, id: Date.now() + Math.random() });
            }
            return result;
        }
        
        const radius = chordLength / (2 * sinThetaHalf);
        if (!isFinite(radius) || radius > 1e10) {
            if (typeof Line !== 'undefined') {
                result.push(new Line(v1.x, v1.y, v2.x, v2.y));
            } else {
                result.push({ type: 'line', x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y, id: Date.now() + Math.random() });
            }
            return result;
        }

        const mx = (v1.x + v2.x) / 2;
        const my = (v1.y + v2.y) / 2;

        const dist = Math.sqrt(Math.abs(radius * radius - (chordLength * chordLength) / 4));

        // Левый перпендикуляр: (-dy, dx)
        const leftPerpX = -dy / chordLength;
        const leftPerpY = dx / chordLength;

        // Сторона центра относительно хорды:
        // - |bulge| < 1 (малая дуга, theta < π): bulge > 0 → слева, bulge < 0 → справа
        // - |bulge| > 1 (большая дуга, theta > π): центр на ПРОТИВОПОЛОЖНОЙ стороне,
        //   т.к. CCW sweep > π возможен только если центр справа от хорды.
        const sideSign = Math.abs(bulge) > 1 ? -1 : 1;
        const offsetSign = Math.sign(bulge) * sideSign;
        const cx = mx + leftPerpX * dist * offsetSign;
        const cy = my + leftPerpY * dist * offsetSign;

        if (!isFinite(cx) || !isFinite(cy)) {
            if (typeof Line !== 'undefined') {
                result.push(new Line(v1.x, v1.y, v2.x, v2.y));
            } else {
                result.push({ type: 'line', x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y, id: Date.now() + Math.random() });
            }
            return result;
        }

        // Начальный и конечный углы (стандартные формулы)
        const startAngle = Math.atan2(v1.y - cy, v1.x - cx);
        const endAngle   = Math.atan2(v2.y - cy, v2.x - cx);

        // Направление определяется знаком bulge по стандарту DXF:
        // bulge > 0 → CCW (против часовой), bulge < 0 → CW (по часовой)
        // Это надёжнее сравнения sweep-углов, которое для полудуг (|bulge|≈1)
        // даёт неправильный результат из-за погрешностей float.
        const direction = bulge > 0 ? 'CCW' : 'CW';

        if (typeof Arc !== 'undefined') {
            result.push(new Arc(cx, cy, radius, startAngle, endAngle, direction));
        } else {
            // Создаём аппроксимацию дуги как полилиния
            const points = [];
            const segments = 12;
            for (let i = 0; i <= segments; i++) {
                const angle = startAngle + (endAngle - startAngle) * (i / segments);
                points.push({
                    x: cx + Math.cos(angle) * radius,
                    y: cy + Math.sin(angle) * radius
                });
            }
            result.push({ type: 'polyline', points, id: Date.now() + Math.random() });
        }
        return result;
        
    } catch (err) {
        console.error('Ошибка в approximateBulgeArc:', err);
        if (typeof Line !== 'undefined') {
            result.push(new Line(v1.x, v1.y, v2.x, v2.y));
        } else {
            result.push({ type: 'line', x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y, id: Date.now() + Math.random() });
        }
    }
    
    if (result.length === 0) {
        if (typeof Line !== 'undefined') {
            result.push(new Line(v1.x, v1.y, v2.x, v2.y));
        } else {
            result.push({ type: 'line', x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y, id: Date.now() + Math.random() });
        }
    }
    return result;
}

function approximateEllipse(ellipse) {
    const lines = [];
    const segments = 72; // v5.01: увеличено с 36 до 72 для точности
    
    // majorAxisEndPoint — ВЕКТОР от центра до конца большой полуоси (из DXF)
    const a = Math.sqrt(ellipse.majorAxisEndPoint.x * ellipse.majorAxisEndPoint.x + 
                        ellipse.majorAxisEndPoint.y * ellipse.majorAxisEndPoint.y);
    const b = a * (ellipse.axisRatio || 1);
    const rotation = Math.atan2(ellipse.majorAxisEndPoint.y, ellipse.majorAxisEndPoint.x);
    
    // v5.01: Поддержка частичных эллипсов (startParam/endParam в радианах)
    // DXF ELLIPSE хранит startParam (code 41) и endParam (code 42) в РАДИАНАХ.
    // Полный эллипс: startParam=0, endParam=2π.
    // npm dxf-parser возвращает их как startAngle/endAngle.
    let startParam = ellipse.startAngle ?? 0;
    let endParam = ellipse.endAngle ?? (2 * Math.PI);
    
    // Нормализуем: если параметры выглядят как градусы (> 2π), конвертируем
    // (некоторые CAD могут хранить в градусах, хотя спецификация требует радианы)
    if (Math.abs(startParam) > Math.PI * 2 || Math.abs(endParam) > Math.PI * 2) {
        startParam = startParam * Math.PI / 180;
        endParam = endParam * Math.PI / 180;
    }
    
    // Если полный эллипс (0 → 2π) — рисуем замкнутый контур
    const isFull = Math.abs(startParam - 0) < 0.001 && Math.abs(endParam - 2 * Math.PI) < 0.001;
    const segCount = isFull ? segments : Math.max(8, Math.ceil(segments * (endParam - startParam) / (2 * Math.PI)));
    
    for (let i = 0; i < segCount; i++) {
        const t1 = startParam + (endParam - startParam) * (i / segCount);
        const t2 = startParam + (endParam - startParam) * ((i + 1) / segCount);
        
        const x1 = ellipse.center.x + (a * Math.cos(t1) * Math.cos(rotation) - b * Math.sin(t1) * Math.sin(rotation));
        const y1 = ellipse.center.y + (a * Math.cos(t1) * Math.sin(rotation) + b * Math.sin(t1) * Math.cos(rotation));
        const x2 = ellipse.center.x + (a * Math.cos(t2) * Math.cos(rotation) - b * Math.sin(t2) * Math.sin(rotation));
        const y2 = ellipse.center.y + (a * Math.cos(t2) * Math.sin(rotation) + b * Math.sin(t2) * Math.cos(rotation));
        
        if (typeof Line !== 'undefined') {
            lines.push(new Line(x1, y1, x2, y2));
        } else {
            lines.push({ type: 'line', x1, y1, x2, y2, id: Date.now() + Math.random() });
        }
    }
    
    return lines;
}

// ═══════════════════════════════════════════════════════════════
// РАСПОЗНАВАНИЕ ДУГ ИЗ ПОЛИЛИНИЙ (SPLINE → Arc)
// ═══════════════════════════════════════════════════════════════

/**
 * Проверяет, лежат ли точки полилинии на одной дуге окружности.
 * Если да — возвращает объект Arc, иначе null.
 * Алгоритм: через 3 равноотстоящие точки проводим окружность,
 * затем проверяем, что все точки лежат на ней с допуском.
 * @param {Array} points - массив точек {x, y}
 * @param {number} tolerance - допуск отклонения от окружности (мм)
 * @returns {Arc|null}
 */
function tryDetectArcFromPoints(points, tolerance) {
    if (!points || points.length < 5) return null;
    tolerance = tolerance || 0.05; // 0.05 мм — допуск для лазерной резки

    // Берём 3 точки: начало, середина, конец
    const p1 = points[0];
    const p2 = points[Math.floor(points.length / 2)];
    const p3 = points[points.length - 1];

    // Вычисляем центр окружности через 3 точки
    const ax = p1.x, ay = p1.y;
    const bx = p2.x, by = p2.y;
    const cx = p3.x, cy = p3.y;

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-10) return null; // точки коллинеарны

    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;

    const radius = Math.sqrt((ax - ux) * (ax - ux) + (ay - uy) * (ay - uy));
    if (!isFinite(radius) || radius < 0.001 || radius > 1e8) return null;

    // Проверяем ВСЕ точки на принадлежность окружности
    let maxDeviation = 0;
    for (let i = 0; i < points.length; i++) {
        const dx = points[i].x - ux;
        const dy = points[i].y - uy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const deviation = Math.abs(dist - radius);
        maxDeviation = Math.max(maxDeviation, deviation);
        if (deviation > tolerance) return null; // точка не на окружности
    }

    // Все точки лежат на окружности — определяем углы и направление
    const startAngle = Math.atan2(p1.y - uy, p1.x - ux);
    const endAngle = Math.atan2(p3.y - uy, p3.x - ux);

    // Определяем направление обхода по векторному произведению
    // (start - center) × (midpoint - center)
    // В стандартных координатах (Y-up, как DXF): cross > 0 → CCW, cross < 0 → CW
    // Это надёжнее чем shoelace signed area, которая для открытых полилиний
    // даёт неправильный знак (зависит от абсолютного положения, а не от поворота)
    const v1x = p1.x - ux;
    const v1y = p1.y - uy;
    const v2x = p2.x - ux;
    const v2y = p2.y - uy;
    const cross = v1x * v2y - v1y * v2x;
    const direction = cross > 0 ? 'CCW' : 'CW';

    if (typeof Arc !== 'undefined') {
        return new Arc(ux, uy, radius, startAngle, endAngle, direction);
    } else {
        return {
            type: 'arc',
            cx: ux, cy: uy,
            radius: radius,
            startAngle: startAngle,
            endAngle: endAngle,
            direction: direction,
            id: Date.now() + Math.random()
        };
    }
}

/**
 * Разбивает массив точек полилинии на сегменты: прямые и дуги.
 * Возвращает массив объектов (Line и Arc).
 * Оптимизация: для больших полилиний (>50 точек) сначала пробуем
 * распознать всю кривую как дугу; если нет — делим пополам рекурсивно.
 * @param {Array} points - массив точек {x, y}
 * @returns {Array} - массив объектов Line и Arc
 */
function polylineToArcsAndLines(points) {
    if (!points || points.length < 2) return [];

    // Сначала пробуем распознать ВСЮ полилинию как одну дугу
    const wholeArc = tryDetectArcFromPoints(points, 0.05);
    if (wholeArc) {
        return [wholeArc];
    }

    // Если точек мало — просто линии
    if (points.length < 6) {
        const result = [];
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            if (typeof Line !== 'undefined') {
                result.push(new Line(p1.x, p1.y, p2.x, p2.y));
            } else {
                result.push({ type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, id: Date.now() + Math.random() });
            }
        }
        return result;
    }

    // Для больших полилиний: делим пополам и пробуем распознать каждую половину
    const mid = Math.floor(points.length / 2);
    const firstHalf = points.slice(0, mid + 1); // +1 чтобы концы совпадали
    const secondHalf = points.slice(mid);

    const firstResult = polylineToArcsAndLines(firstHalf);
    const secondResult = polylineToArcsAndLines(secondHalf);

    // Объединяем, убирая дублирующую точку на стыке
    return [...firstResult, ...secondResult];
}

// ═══════════════════════════════════════════════════════════════
// B-SPINE: Алгоритм Де Бура для точной оценки B-сплайна
// ═══════════════════════════════════════════════════════════════

/**
 * Алгоритм Де Бура — вычисляет точку на B-сплайне
 * @param {number} degree - степень сплайна (обычно 3)
 * @param {number[]} knots - узловой вектор
 * @param {Object[]} controlPoints - массив контрольных точек {x, y}
 * @param {number} t - параметр [tMin, tMax]
 * @returns {{x: number, y: number}} - точка на кривой
 */
function deBoor(degree, knots, controlPoints, t) {
    const n = controlPoints.length - 1;
    const tMin = knots[degree];
    const tMax = knots[n + 1];
    t = Math.max(tMin, Math.min(tMax, t));

    // Находим интервал узла (knot span)
    let k = n;
    for (let i = degree; i < n + 1; i++) {
        if (t >= knots[i] && t < knots[i + 1]) {
            k = i;
            break;
        }
    }

    // Инициализация массива d
    const d = [];
    for (let j = 0; j <= degree; j++) {
        const idx = j + k - degree;
        d[j] = { x: controlPoints[idx].x, y: controlPoints[idx].y };
    }

    // Рекурсия Де Бура
    for (let r = 1; r <= degree; r++) {
        for (let j = degree; j >= r; j--) {
            const i1 = j + k - degree;
            const i2 = j + 1 + k - r;
            const denominator = knots[i2] - knots[i1];
            let alpha = 0;
            if (Math.abs(denominator) > 1e-10) {
                alpha = (t - knots[i1]) / denominator;
            }
            d[j] = {
                x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
                y: (1 - alpha) * d[j - 1].y + alpha * d[j].y
            };
        }
    }

    return d[degree];
}

/**
 * Конвертирует B-сплайн в полилинию (массив точек)
 * @param {number} degree - степень сплайна
 * @param {number[]} knots - узловой вектор
 * @param {Object[]} controlPoints - контрольные точки {x, y}
 * @param {boolean} closed - замкнутый сплайн
 * @param {number} segmentsPerSpan - сегментов на каждый интервал
 * @returns {{x: number, y: number}[]} - массив точек полилинии
 */
function splineToPolyline(degree, knots, controlPoints, closed, segmentsPerSpan) {
    segmentsPerSpan = segmentsPerSpan || 20;
    const n = controlPoints.length - 1;
    const tMin = knots[degree];
    const tMax = knots[n + 1];
    const tRange = tMax - tMin;

    if (tRange <= 0) return [];

    const numSpans = n - degree + 1;
    const totalSegments = numSpans * segmentsPerSpan;

    const points = [];
    for (let i = 0; i <= totalSegments; i++) {
        const t = tMin + (i / totalSegments) * tRange;
        const pt = deBoor(degree, knots, controlPoints, t);
        points.push(pt);
    }

    // Для замкнутого сплайна: проверяем, замыкается ли последняя точка на первую
    if (closed && points.length > 1) {
        const first = points[0];
        const last = points[points.length - 1];
        if (Math.abs(last.x - first.x) > 0.01 || Math.abs(last.y - first.y) > 0.01) {
            points.push({ x: first.x, y: first.y });
        }
    }

    return points;
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

            if (typeof Line !== 'undefined') {
                lines.push(new Line(prevX, prevY, x, y));
            } else {
                lines.push({ type: 'line', x1: prevX, y1: prevY, x2: x, y2: y, id: Date.now() + Math.random() });
            }
            prevX = x;
            prevY = y;
        }
    }

    return lines;
}

/** Проверяет, попадает ли угол в диапазон дуги */
function isAngleInArcRange(angle, startAngle, endAngle, direction) {
    // Нормализуем углы в [0, 2π)
    const norm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const a = norm(angle);
    const s = norm(startAngle);
    const e = norm(endAngle);

    if (direction === 'CCW') {
        // CCW: от startAngle до endAngle против часовой
        if (s <= e) {
            return a >= s && a <= e;
        } else {
            return a >= s || a <= e;
        }
    } else {
        // CW: от startAngle до endAngle по часовой
        if (s >= e) {
            return a <= s && a >= e;
        } else {
            return a <= s || a >= e;
        }
    }
}

function calculateBounds(objects) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
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
            
            minX = Math.min(minX, obj.x1, obj.x2);
            maxX = Math.max(maxX, obj.x1, obj.x2);
            minY = Math.min(minY, obj.y1, obj.y2);
            maxY = Math.max(maxY, obj.y1, obj.y2);
        } else if (obj.type === 'arc') {
            // Дуга: используем точки начала/конца + крайние точки дуги
            if (typeof obj.cx !== 'number' || typeof obj.cy !== 'number' || typeof obj.radius !== 'number') {
                console.warn(`⚠️ Arc с невалидными координатами:`, obj);
                invalidObjects++;
                return;
            }
            
            // Начальная и конечная точки дуги
            const sx = obj.cx + Math.cos(obj.startAngle) * obj.radius;
            const sy = obj.cy + Math.sin(obj.startAngle) * obj.radius;
            const ex = obj.cx + Math.cos(obj.endAngle) * obj.radius;
            const ey = obj.cy + Math.sin(obj.endAngle) * obj.radius;
            minX = Math.min(minX, sx, ex);
            maxX = Math.max(maxX, sx, ex);
            minY = Math.min(minY, sy, ey);
            maxY = Math.max(maxY, sy, ey);
            // Проверяем крайние точки на 0°, 90°, 180°, 270° если они в диапазоне дуги
            const angles = [0, Math.PI/2, Math.PI, 3*Math.PI/2];
            for (const a of angles) {
                if (isAngleInArcRange(a, obj.startAngle, obj.endAngle, obj.direction)) {
                    minX = Math.min(minX, obj.cx + Math.cos(a) * obj.radius);
                    maxX = Math.max(maxX, obj.cx + Math.cos(a) * obj.radius);
                    minY = Math.min(minY, obj.cy + Math.sin(a) * obj.radius);
                    maxY = Math.max(maxY, obj.cy + Math.sin(a) * obj.radius);
                }
            }
        } else if (obj.type === 'circle') {
            if (typeof obj.cx !== 'number' || typeof obj.cy !== 'number' || typeof obj.radius !== 'number') {
                console.warn(`⚠️ Circle с невалидными координатами:`, obj);
                invalidObjects++;
                return;
            }
            
            minX = Math.min(minX, obj.cx - obj.radius);
            maxX = Math.max(maxX, obj.cx + obj.radius);
            minY = Math.min(minY, obj.cy - obj.radius);
            maxY = Math.max(maxY, obj.cy + obj.radius);
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            if (!obj.points || obj.points.length === 0) {
                console.warn(`⚠️ Polyline без точек:`, obj);
                invalidObjects++;
                return;
            }
            
            for (const pt of obj.points) {
                minX = Math.min(minX, pt.x);
                maxX = Math.max(maxX, pt.x);
                minY = Math.min(minY, pt.y);
                maxY = Math.max(maxY, pt.y);
            }
        } else if (obj.type === 'rect') {
            if (typeof obj.x !== 'number' || typeof obj.y !== 'number' ||
                typeof obj.width !== 'number' || typeof obj.height !== 'number') {
                console.warn(`⚠️ Rect с невалидными координатами:`, obj);
                invalidObjects++;
                return;
            }
            
            minX = Math.min(minX, obj.x);
            maxX = Math.max(maxX, obj.x + obj.width);
            minY = Math.min(minY, obj.y);
            maxY = Math.max(maxY, obj.y + obj.height);
        } else if (obj.type === 'polygon') {
            // Регулярный многоугольник: cx, cy, radius, sides
            if (typeof obj.cx === 'number' && typeof obj.cy === 'number' && typeof obj.radius === 'number') {

                minX = Math.min(minX, obj.cx - obj.radius);
                maxX = Math.max(maxX, obj.cx + obj.radius);
                minY = Math.min(minY, obj.cy - obj.radius);
                maxY = Math.max(maxY, obj.cy + obj.radius);
            } else if (obj.points && obj.points.length > 0) {

                for (const pt of obj.points) {
                    minX = Math.min(minX, pt.x);
                    maxX = Math.max(maxX, pt.x);
                    minY = Math.min(minY, pt.y);
                    maxY = Math.max(maxY, pt.y);
                }
            }
        } else if (obj.type === 'spline') {
            // v4.60: Сплайн
            const pts = obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [];
            for (const pt of pts) {
                if (pt && typeof pt.x === 'number' && typeof pt.y === 'number') {
                    minX = Math.min(minX, pt.x);
                    maxX = Math.max(maxX, pt.x);
                    minY = Math.min(minY, pt.y);
                    maxY = Math.max(maxY, pt.y);
                }
            }
        } else if (obj.type === 'ellipse') {
            // v4.60: Эллипс
            if (typeof obj.cx === 'number' && typeof obj.cy === 'number') {
                const rx = Math.abs(obj.rx || 0);
                const ry = Math.abs(obj.ry || 0);
                minX = Math.min(minX, obj.cx - rx);
                maxX = Math.max(maxX, obj.cx + rx);
                minY = Math.min(minY, obj.cy - ry);
                maxY = Math.max(maxY, obj.cy + ry);
            }
        }
    });
    
    if (invalidObjects > 0) {
        console.warn(`Невалидных объектов: ${invalidObjects}`);
    }
    
    const width = Math.abs(maxX - minX);
    const height = Math.abs(maxY - minY);
    
    return {
        minX, minY, maxX, maxY,
        width,
        height
    };
}

function drawImportPreview(svgElement) {
    if (!svgElement) return;
    
    svgElement.innerHTML = '';
    
    if (importedObjects.length === 0) {
        return;
    }
    
    const bounds = calculateBounds(importedObjects);
    
    const padding = 20;
    const svgWidth = parseFloat(svgElement.getAttribute('width')) || 600;
    const svgHeight = parseFloat(svgElement.getAttribute('height')) || 400;
    
    const scaleX = (svgWidth - 2 * padding) / bounds.width;
    const scaleY = (svgHeight - 2 * padding) / bounds.height;
    const scale = Math.min(scaleX, scaleY, 1);
    
    const offsetX = (svgWidth - bounds.width * scale) / 2 - bounds.minX * scale + padding;
    const offsetY = (svgHeight - bounds.height * scale) / 2 - bounds.minY * scale + padding;
    
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
        } else if (obj.type === 'arc') {
            // SVG-дуга для preview — через polyline (надёжнее чем SVG arc command)
            const cx = obj.cx * scale + offsetX;
            const cy = obj.cy * scale + offsetY;
            const r = Math.abs(obj.radius || 0) * scale;
            if (r <= 0) { return; }
            const startAngle = obj.startAngle ?? 0;
            const endAngle = obj.endAngle ?? (2 * Math.PI);
            const direction = obj.direction || 'CCW';

            // Вычисление sweep и генерация точек (как в getPoints)
            let sweep;
            if (direction === 'CW') { sweep = startAngle - endAngle; if (sweep < 0) sweep += 2 * Math.PI; }
            else { sweep = endAngle - startAngle; if (sweep < 0) sweep += 2 * Math.PI; }
            const segments = Math.max(24, Math.ceil(sweep / (Math.PI / 12)));
            const step = sweep / segments;
            const dir = direction === 'CW' ? -1 : 1;

            const pts = [];
            for (let i = 0; i <= segments; i++) {
                const a = startAngle + dir * step * i;
                pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
            }

            const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            polyline.setAttribute('points', pts.join(' '));
            polyline.setAttribute('stroke', '#007acc');
            polyline.setAttribute('stroke-width', '1.5');
            polyline.setAttribute('fill', 'none');
            svgElement.appendChild(polyline);
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            // SVG-полилиния для preview
            if (obj.points && obj.points.length >= 2) {
                const pts = obj.points.map(p => `${p.x * scale + offsetX},${p.y * scale + offsetY}`).join(' ');
                // Замкнутая полилиния → <polygon>, открытая → <polyline>
                const svgEl = obj.closed
                    ? document.createElementNS("http://www.w3.org/2000/svg", "polygon")
                    : document.createElementNS("http://www.w3.org/2000/svg", "polyline");
                svgEl.setAttribute('points', pts);
                svgEl.setAttribute('stroke', '#007acc');
                svgEl.setAttribute('stroke-width', '1.5');
                svgEl.setAttribute('fill', 'none');
                svgElement.appendChild(svgEl);
            }
        } else if (obj.type === 'circle') {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute('cx', obj.cx * scale + offsetX);
            circle.setAttribute('cy', obj.cy * scale + offsetY);
            circle.setAttribute('r', obj.radius * scale);
            circle.setAttribute('stroke', '#007acc');
            circle.setAttribute('stroke-width', '1.5');
            circle.setAttribute('fill', 'none');
            svgElement.appendChild(circle);
        }
    });
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
            if (typeof Line !== 'undefined') {
                return new Line(
                    obj.x1 + offsetX, obj.y1 + offsetY,
                    obj.x2 + offsetX, obj.y2 + offsetY
                );
            } else {
                return { type: 'line', x1: obj.x1 + offsetX, y1: obj.y1 + offsetY, x2: obj.x2 + offsetX, y2: obj.y2 + offsetY, id: Date.now() + Math.random() };
            }
        } else if (obj.type === 'circle') {
            if (typeof Circle !== 'undefined') {
                return new Circle(
                    obj.cx + offsetX, obj.cy + offsetY,
                    obj.radius
                );
            } else {
                return { type: 'circle', cx: obj.cx + offsetX, cy: obj.cy + offsetY, radius: obj.radius, id: Date.now() + Math.random() };
            }
        } else if (obj.type === 'rect') {
            if (typeof Rect !== 'undefined') {
                return new Rect(
                    obj.x + offsetX, obj.y + offsetY,
                    obj.width, obj.height
                );
            } else {
                return { type: 'rect', x: obj.x + offsetX, y: obj.y + offsetY, width: obj.width, height: obj.height, id: Date.now() + Math.random() };
            }
        } else if (obj.type === 'polygon') {
            if (typeof Polygon !== 'undefined') {
                return new Polygon(
                    obj.cx + offsetX, obj.cy + offsetY,
                    obj.radius, obj.sides
                );
            } else {
                return { type: 'polygon', cx: obj.cx + offsetX, cy: obj.cy + offsetY, radius: obj.radius, sides: obj.sides, id: Date.now() + Math.random() };
            }
        } else if (obj.type === 'arc') {
            if (typeof Arc !== 'undefined') {
                const arc = new Arc(
                    obj.cx + offsetX, obj.cy + offsetY,
                    obj.radius,
                    obj.startAngle, obj.endAngle, obj.direction
                );
                arc.id = obj.id || Date.now() + Math.random();
                return arc;
            } else {
                return { type: 'arc', cx: obj.cx + offsetX, cy: obj.cy + offsetY, radius: obj.radius, startAngle: obj.startAngle, endAngle: obj.endAngle, direction: obj.direction, id: obj.id || Date.now() + Math.random() };
            }
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            let pl = {
                type: obj.type,
                points: obj.points.map(pt => ({ x: pt.x + offsetX, y: pt.y + offsetY })),
                closed: obj.closed === true,
                id: obj.id || Date.now() + Math.random()
            };
            if (typeof addPolylineMethods === 'function') pl = addPolylineMethods(pl);
            else {
                pl.draw = function(ctx) {
                    if (!this.points || this.points.length < 2) return;
                    ctx.beginPath();
                    ctx.moveTo(this.points[0].x, this.points[0].y);
                    for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
                    if (this.closed) ctx.closePath();
                    ctx.stroke();
                };
                pl.contains = function(x, y) {
                    if (!this.points || this.points.length < 2) return false;
                    const segCount = this.closed ? this.points.length : this.points.length - 1;
                    for (let i = 0; i < segCount; i++) {
                        const p1 = this.points[i];
                        const p2 = this.points[(i + 1) % this.points.length];
                        const dx = p2.x - p1.x, dy = p2.y - p1.y;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        if (len < 0.001) continue;
                        const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / (len * len)));
                        const px = p1.x + t * dx, py = p1.y + t * dy;
                        if (Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) < 3) return true;
                    }
                    return false;
                };
            }
            return pl;
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
        // v4.68: Новая деталь — в НАЧАЛО списка (а не в конец)
        parts.unshift(part);
        if (typeof syncGlobalsToStore === 'function') syncGlobalsToStore();
        if (typeof updatePartsList === 'function') updatePartsList();
        if (typeof saveToCache === 'function') saveToCache();
    }

    return part;
}

function resetImport() {
    importedObjects = [];
    dxfBounds = {};
    dxfFileName = '';
}