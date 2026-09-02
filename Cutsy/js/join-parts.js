// ═══════════════════════════════════════════════════════════════
// JOIN PARTS - Соединение деталей в один рез
// ═══════════════════════════════════════════════════════════════

const JoinParts = {
    // ═══════════════════════════════════════════════════════════
    // НАСТРОЙКИ
    // ═══════════════════════════════════════════════════════════
    maxJoinDistance: 100,  // Макс. расстояние для соединения (мм)
    minEdgeLength: 50,     // Мин. длина грани для соединения (мм)
    
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ: можно ли соединить две детали
    // ═══════════════════════════════════════════════════════════
    canJoin(nested1, nested2) {
        // Проверка: обе детали существуют
        if (!nested1 || !nested2) {
            return { can: false, reason: 'Детали не найдены' };
        }
        
        // Проверка: это разные индексы в массиве (не одна и та же деталь)
        // Используем ссылку на объект, а не partId (т.к. могут быть копии)
        if (nested1 === nested2) {
            return { can: false, reason: 'Это одна и та же деталь' };
        }
        
        // Проверка: обе детали прямоугольные (или имеют bounding box)
        const bbox1 = {
            x: nested1.x,
            y: nested1.y,
            width: nested1.width || nested1.baseWidth,
            height: nested1.height || nested1.baseHeight
        };
        
        const bbox2 = {
            x: nested2.x,
            y: nested2.y,
            width: nested2.width || nested2.baseWidth,
            height: nested2.height || nested2.baseHeight
        };
        
        // Проверка: расстояние между деталями
        const distance = this.getDistance(bbox1, bbox2);
        if (distance > this.maxJoinDistance) {
            return { can: false, reason: 'Слишком далеко друг от друга' };
        }
        
        // Найти общую грань
        const commonEdge = this.findCommonEdge(bbox1, bbox2);
        if (!commonEdge) {
            return { can: false, reason: 'Нет параллельных граней' };
        }
        
        // Проверка: длина общей грани
        if (commonEdge.length < this.minEdgeLength) {
            return { can: false, reason: 'Грань слишком короткая' };
        }
        
        return {
            can: true,
            commonEdge: commonEdge,
            distance: distance
        };
    },
    
    // ═══════════════════════════════════════════════════════════
    // НАЙТИ общую грань между двумя прямоугольниками
    // ═══════════════════════════════════════════════════════════
    findCommonEdge(bbox1, bbox2) {
        // Грани прямоугольника 1
        const edges1 = {
            top: { y: bbox1.y, x1: bbox1.x, x2: bbox1.x + bbox1.width, length: bbox1.width },
            bottom: { y: bbox1.y + bbox1.height, x1: bbox1.x, x2: bbox1.x + bbox1.width, length: bbox1.width },
            left: { x: bbox1.x, y1: bbox1.y, y2: bbox1.y + bbox1.height, length: bbox1.height },
            right: { x: bbox1.x + bbox1.width, y1: bbox1.y, y2: bbox1.y + bbox1.height, length: bbox1.height }
        };
        
        // Грани прямоугольника 2
        const edges2 = {
            top: { y: bbox2.y, x1: bbox2.x, x2: bbox2.x + bbox2.width, length: bbox2.width },
            bottom: { y: bbox2.y + bbox2.height, x1: bbox2.x, x2: bbox2.x + bbox2.width, length: bbox2.width },
            left: { x: bbox2.x, y1: bbox2.y, y2: bbox2.y + bbox2.height, length: bbox2.height },
            right: { x: bbox2.x + bbox2.width, y1: bbox2.y, y2: bbox2.y + bbox2.height, length: bbox2.height }
        };
        
        // Проверка: правая грань 1 = левая грань 2 (горизонтальное соединение)
        if (this.edgesAlign(edges1.right, edges2.left)) {
            return {
                type: 'horizontal',
                edge: edges1.right,
                length: this.getOverlapLength(edges1.right, edges2.left)
            };
        }
        
        // Проверка: левая грань 1 = правая грань 2 (горизонтальное соединение)
        if (this.edgesAlign(edges1.left, edges2.right)) {
            return {
                type: 'horizontal',
                edge: edges1.left,
                length: this.getOverlapLength(edges1.left, edges2.right)
            };
        }
        
        // Проверка: нижняя грань 1 = верхняя грань 2 (вертикальное соединение)
        if (this.edgesAlign(edges1.bottom, edges2.top)) {
            return {
                type: 'vertical',
                edge: edges1.bottom,
                length: this.getOverlapLength(edges1.bottom, edges2.top)
            };
        }
        
        // Проверка: верхняя грань 1 = нижняя грань 2 (вертикальное соединение)
        if (this.edgesAlign(edges1.top, edges2.bottom)) {
            return {
                type: 'vertical',
                edge: edges1.top,
                length: this.getOverlapLength(edges1.top, edges2.bottom)
            };
        }
        
        return null;
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ: грани выровнены (параллельны и близки)
    // ═══════════════════════════════════════════════════════════
    edgesAlign(edge1, edge2) {
        const tolerance = 100;  // Допуск выравнивания (мм) - увеличено до 100
        
        // Вертикальные грани (x координата)
        if (edge1.x !== undefined && edge2.x !== undefined) {
            return Math.abs(edge1.x - edge2.x) < tolerance &&
                   this.edgesOverlap(edge1, edge2);
        }
        
        // Горизонтальные грани (y координата)
        if (edge1.y !== undefined && edge2.y !== undefined) {
            return Math.abs(edge1.y - edge2.y) < tolerance &&
                   this.edgesOverlap(edge1, edge2);
        }
        
        return false;
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ: грани перекрываются
    // ═══════════════════════════════════════════════════════════
    edgesOverlap(edge1, edge2) {
        // Вертикальные грани
        if (edge1.y1 !== undefined && edge2.y1 !== undefined) {
            const max1 = Math.max(edge1.y1, edge1.y2);
            const min1 = Math.min(edge1.y1, edge1.y2);
            const max2 = Math.max(edge2.y1, edge2.y2);
            const min2 = Math.min(edge2.y1, edge2.y2);
            
            return max1 >= min2 && max2 >= min1;
        }
        
        // Горизонтальные грани
        if (edge1.x1 !== undefined && edge2.x1 !== undefined) {
            const max1 = Math.max(edge1.x1, edge1.x2);
            const min1 = Math.min(edge1.x1, edge1.x2);
            const max2 = Math.max(edge2.x1, edge2.x2);
            const min2 = Math.min(edge2.x1, edge2.x2);
            
            return max1 >= min2 && max2 >= min1;
        }
        
        return false;
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПОЛУЧИТЬ длину перекрытия граней
    // ═══════════════════════════════════════════════════════════
    getOverlapLength(edge1, edge2) {
        // Вертикальные грани
        if (edge1.y1 !== undefined && edge2.y1 !== undefined) {
            const max1 = Math.max(edge1.y1, edge1.y2);
            const min1 = Math.min(edge1.y1, edge1.y2);
            const max2 = Math.max(edge2.y1, edge2.y2);
            const min2 = Math.min(edge2.y1, edge2.y2);
            
            return Math.max(0, Math.min(max1, max2) - Math.max(min1, min2));
        }
        
        // Горизонтальные грани
        if (edge1.x1 !== undefined && edge2.x1 !== undefined) {
            const max1 = Math.max(edge1.x1, edge1.x2);
            const min1 = Math.min(edge1.x1, edge1.x2);
            const max2 = Math.max(edge2.x1, edge2.x2);
            const min2 = Math.min(edge2.x1, edge2.x2);
            
            return Math.max(0, Math.min(max1, max2) - Math.max(min1, min2));
        }
        
        return 0;
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПОЛУЧИТЬ расстояние между двумя прямоугольниками
    // ═══════════════════════════════════════════════════════════
    getDistance(bbox1, bbox2) {
        // Проверка на пересечение
        if (this.intersect(bbox1, bbox2)) {
            return 0;
        }
        
        // Горизонтальное расстояние
        const dx = bbox1.x < bbox2.x 
            ? bbox2.x - (bbox1.x + bbox1.width)
            : bbox1.x - (bbox2.x + bbox2.width);
        
        // Вертикальное расстояние
        const dy = bbox1.y < bbox2.y
            ? bbox2.y - (bbox1.y + bbox1.height)
            : bbox1.y - (bbox2.y + bbox2.height);
        
        // Вернуть минимальное расстояние
        if (dx > 0 && dy > 0) {
            return Math.sqrt(dx * dx + dy * dy);
        }
        
        return Math.max(0, Math.max(dx, dy));
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ: пересекаются ли прямоугольники
    // ═══════════════════════════════════════════════════════════
    intersect(bbox1, bbox2) {
        return !(bbox1.x + bbox1.width < bbox2.x ||
                 bbox2.x + bbox2.width < bbox1.x ||
                 bbox1.y + bbox1.height < bbox2.y ||
                 bbox2.y + bbox2.height < bbox1.y);
    },
    
    // ═══════════════════════════════════════════════════════════
    // СОЕДИНИТЬ две детали (сдвинуть вплотную)
    // ═══════════════════════════════════════════════════════════
    joinTwoParts(nested1, nested2) {
        const result = this.canJoin(nested1, nested2);
        
        if (!result.can) {
            return { success: false, reason: result.reason };
        }
        
        const bbox1 = {
            x: nested1.x,
            y: nested1.y,
            width: nested1.width || nested1.baseWidth,
            height: nested1.height || nested1.baseHeight
        };
        
        const bbox2 = {
            x: nested2.x,
            y: nested2.y,
            width: nested2.width || nested2.baseWidth,
            height: nested2.height || nested2.baseHeight
        };
        
        // Сдвинуть nested2 вплотную к nested1
        if (result.commonEdge.type === 'horizontal') {
            // Горизонтальное соединение
            if (bbox1.x < bbox2.x) {
                // nested2 справа от nested1
                nested2.x = bbox1.x + bbox1.width;
            } else {
                // nested2 слева от nested1
                nested2.x = bbox1.x - bbox2.width;
            }
        } else {
            // Вертикальное соединение
            if (bbox1.y < bbox2.y) {
                // nested2 снизу от nested1
                nested2.y = bbox1.y + bbox1.height;
            } else {
                // nested2 сверху от nested1
                nested2.y = bbox1.y - bbox2.height;
            }
        }
        
        // Обновить bounding box если есть
        if (nested2.polygon && nested2.polygon.length > 0) {
            // Пересчитать полигон с новыми координатами
            const dx = nested2.x - bbox2.x;
            const dy = nested2.y - bbox2.y;
            
            nested2.polygon = nested2.polygon.map(p => ({
                x: p.x + dx,
                y: p.y + dy
            }));
        }
        
        return {
            success: true,
            newX: nested2.x,
            newY: nested2.y,
            edgeType: result.commonEdge.type
        };
    },
    
    // ═══════════════════════════════════════════════════════════
    // ДОБАВИТЬ деталь к существующему блоку
    // ═══════════════════════════════════════════════════════════
    addToBlock(blockNested, newNested) {
        // blockNested - массив деталей в блоке
        // newNested - новая деталь для добавления
        
        if (!Array.isArray(blockNested) || blockNested.length === 0) {
            return { success: false, reason: 'Блок пуст' };
        }
        
        if (!newNested) {
            return { success: false, reason: 'Деталь не найдена' };
        }
        
        // ═══════════════════════════════════════════════════════
        // 1. ВЫЧИСЛЯЕМ ГРАНИЦЫ БЛОКА
        // ═══════════════════════════════════════════════════════
        const blockBounds = this.getBlockBounds(blockNested);
        const newBounds = this.getNestedBounds(newNested);
        
        console.log('🔍 Блок:', blockBounds);
        console.log('🔍 Новая деталь:', newBounds);
        
        // ═══════════════════════════════════════════════════════
        // 2. НАХОДИМ БЛИЖАЙШУЮ ГРАНЬ
        // ═══════════════════════════════════════════════════════
        const nearestEdge = this.findNearestEdge(blockBounds, newBounds);
        
        if (!nearestEdge) {
            return { success: false, reason: 'Не найдено подходящей грани для соединения' };
        }
        
        console.log('✅ Ближайшая грань:', nearestEdge);
        
        // ═══════════════════════════════════════════════════════
        // 3. ВЫЧИСЛЯЕМ ПОЗИЦИЮ ДЛЯ НОВОЙ ДЕТАЛИ
        // ═══════════════════════════════════════════════════════
        const targetPosition = this.calculateTargetPosition(blockBounds, newBounds, nearestEdge);
        
        console.log('📍 Целевая позиция:', targetPosition);
        
        // ═══════════════════════════════════════════════════════
        // 4. СДВИГАЕМ ТОЛЬКО НОВУЮ ДЕТАЛЬ
        // ═══════════════════════════════════════════════════════
        const dx = targetPosition.x - newNested.x;
        const dy = targetPosition.y - newNested.y;
        
        newNested.x = targetPosition.x;
        newNested.y = targetPosition.y;
        
        // Обновляем полигон если есть
        if (newNested.polygon && newNested.polygon.length > 0) {
            newNested.polygon = newNested.polygon.map(p => ({
                x: p.x + dx,
                y: p.y + dy
            }));
        }
        
        return {
            success: true,
            newX: newNested.x,
            newY: newNested.y,
            edgeType: nearestEdge.type,
            edge: nearestEdge.edge
        };
    },
    
    // ═══════════════════════════════════════════════════════════
    // ВЫЧИСЛИТЬ границы блока (все детали вместе)
    // ═══════════════════════════════════════════════════════════
    getBlockBounds(blockNested) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        blockNested.forEach(nested => {
            const bounds = this.getNestedBounds(nested);
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        });
        
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            right: maxX,
            bottom: maxY,
            centerX: minX + (maxX - minX) / 2,
            centerY: minY + (maxY - minY) / 2
        };
    },
    
    // ═══════════════════════════════════════════════════════════
    // ВЫЧИСЛИТЬ границы одной детали
    // ═══════════════════════════════════════════════════════════
    getNestedBounds(nested) {
        return {
            x: nested.x,
            y: nested.y,
            width: nested.width || nested.baseWidth,
            height: nested.height || nested.baseHeight,
            right: nested.x + (nested.width || nested.baseWidth),
            bottom: nested.y + (nested.height || nested.baseHeight),
            centerX: nested.x + (nested.width || nested.baseWidth) / 2,
            centerY: nested.y + (nested.height || nested.baseHeight) / 2
        };
    },
    
    // ═══════════════════════════════════════════════════════════
    // НАЙТИ ближайшую грань блока к новой детали
    // ═══════════════════════════════════════════════════════════
    findNearestEdge(blockBounds, newBounds) {
        const tolerance = 100;  // Допуск для соединения (мм)
        
        // Вычисляем расстояния до каждой грани
        const distances = {
            // Справа от блока (новая деталь справа)
            right: {
                edge: 'right',
                distance: Math.abs(newBounds.x - blockBounds.right),
                align: 'horizontal',
                blockEdge: { x: blockBounds.right, y1: blockBounds.y, y2: blockBounds.y + blockBounds.height },
                newEdge: { x: newBounds.x, y1: newBounds.y, y2: newBounds.y + newBounds.height }
            },
            // Слева от блока (новая деталь слева)
            left: {
                edge: 'left',
                distance: Math.abs(blockBounds.x - newBounds.right),
                align: 'horizontal',
                blockEdge: { x: blockBounds.x, y1: blockBounds.y, y2: blockBounds.y + blockBounds.height },
                newEdge: { x: newBounds.right, y1: newBounds.y, y2: newBounds.y + newBounds.height }
            },
            // Снизу от блока (новая деталь снизу)
            bottom: {
                edge: 'bottom',
                distance: Math.abs(newBounds.y - blockBounds.bottom),
                align: 'vertical',
                blockEdge: { y: blockBounds.bottom, x1: blockBounds.x, x2: blockBounds.x + blockBounds.width },
                newEdge: { y: newBounds.y, x1: newBounds.x, x2: newBounds.x + newBounds.width }
            },
            // Сверху от блока (новая деталь сверху)
            top: {
                edge: 'top',
                distance: Math.abs(blockBounds.y - newBounds.bottom),
                align: 'vertical',
                blockEdge: { y: blockBounds.y, x1: blockBounds.x, x2: blockBounds.x + blockBounds.width },
                newEdge: { y: newBounds.bottom, x1: newBounds.x, x2: newBounds.x + newBounds.width }
            }
        };
        
        // Находим минимальное расстояние
        let minDistance = Infinity;
        let bestEdge = null;
        
        for (const [edgeName, edgeData] of Object.entries(distances)) {
            // Проверяем что расстояние в допуске
            if (edgeData.distance <= tolerance && edgeData.distance < minDistance) {
                // Проверяем что грани перекрываются (хотя бы частично)
                if (this.edgesOverlap2D(edgeData.blockEdge, edgeData.newEdge, edgeData.align)) {
                    minDistance = edgeData.distance;
                    bestEdge = edgeData;
                }
            }
        }
        
        return bestEdge;
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ: грани перекрываются в 2D
    // ═══════════════════════════════════════════════════════════
    edgesOverlap2D(edge1, edge2, align) {
        const overlapTolerance = 0.5;  // Требуемое перекрытие (50%)
        
        if (align === 'horizontal') {
            // Проверяем перекрытие по Y
            const min1 = Math.min(edge1.y1, edge1.y2);
            const max1 = Math.max(edge1.y1, edge1.y2);
            const min2 = Math.min(edge2.y1, edge2.y2);
            const max2 = Math.max(edge2.y1, edge2.y2);
            
            const overlap = Math.max(0, Math.min(max1, max2) - Math.max(min1, min2));
            const minEdgeLength = Math.min(max1 - min1, max2 - min2);
            
            return overlap >= minEdgeLength * overlapTolerance;
        } else {
            // Проверяем перекрытие по X
            const min1 = Math.min(edge1.x1, edge1.x2);
            const max1 = Math.max(edge1.x1, edge1.x2);
            const min2 = Math.min(edge2.x1, edge2.x2);
            const max2 = Math.max(edge2.x1, edge2.x2);
            
            const overlap = Math.max(0, Math.min(max1, max2) - Math.max(min1, min2));
            const minEdgeLength = Math.min(max1 - min1, max2 - min2);
            
            return overlap >= minEdgeLength * overlapTolerance;
        }
    },
    
    // ═══════════════════════════════════════════════════════════
    // ВЫЧИСЛИТЬ целевую позицию для новой детали
    // ═══════════════════════════════════════════════════════════
    calculateTargetPosition(blockBounds, newBounds, nearestEdge) {
        const target = { x: newBounds.x, y: newBounds.y };
        
        if (nearestEdge.align === 'horizontal') {
            // Горизонтальное соединение (слева-направо)
            if (nearestEdge.edge === 'right') {
                // Новая деталь справа от блока
                target.x = blockBounds.right;
            } else {
                // Новая деталь слева от блока
                target.x = blockBounds.x - newBounds.width;
            }
            
            // ═══════════════════════════════════════════════════
            // ВЫРАВНИВАНИЕ ПО Y
            // ═══════════════════════════════════════════════════
            const heightDiff = Math.abs(blockBounds.height - newBounds.height);
            
            if (heightDiff < 20) {
                // Одинаковая высота → выравниваем по верху блока
                target.y = blockBounds.y;
            } else {
                // Разная высота → центрируем по середине грани
                target.y = blockBounds.y + (blockBounds.height - newBounds.height) / 2;
            }
        } else {
            // Вертикальное соединение (сверху-вниз)
            if (nearestEdge.edge === 'bottom') {
                // Новая деталь снизу от блока
                target.y = blockBounds.bottom;
            } else {
                // Новая деталь сверху от блока
                target.y = blockBounds.y - newBounds.height;
            }
            
            // ═══════════════════════════════════════════════════
            // ВЫРАВНИВАНИЕ ПО X
            // ═══════════════════════════════════════════════════
            const widthDiff = Math.abs(blockBounds.width - newBounds.width);
            
            if (widthDiff < 20) {
                // Одинаковая ширина → выравниваем по левому краю
                target.x = blockBounds.x;
            } else {
                // Разная ширина → центрируем
                target.x = blockBounds.x + (blockBounds.width - newBounds.width) / 2;
            }
        }
        
        return target;
    },
    
    // ═══════════════════════════════════════════════════════════
    // СОЕДИНИТЬ несколько деталей (автоматическая компоновка)
    // ═══════════════════════════════════════════════════════════
    joinMultiple(nestedParts, indices) {
        if (!Array.isArray(indices) || indices.length < 2) {
            return { success: false, reason: 'Нужно минимум 2 детали' };
        }
        
        // Получить детали по индексам
        const partsToJoin = indices.map(i => nestedParts[i]).filter(p => p);
        
        if (partsToJoin.length < 2) {
            return { success: false, reason: 'Недостаточно деталей' };
        }
        
        // Сортировать по позиции (слева-направо, сверху-вниз)
        partsToJoin.sort((a, b) => {
            if (Math.abs(a.y - b.y) > 50) {
                return a.y - b.y;  // Сортировка по Y
            }
            return a.x - b.x;  // Сортировка по X
        });
        
        // Соединить последовательно
        const results = [];
        for (let i = 1; i < partsToJoin.length; i++) {
            const result = this.joinTwoParts(partsToJoin[i - 1], partsToJoin[i]);
            results.push(result);
            
            if (!result.success) {
                return {
                    success: false,
                    reason: `Не удалось соединить деталь #${i + 1}: ${result.reason}`,
                    partial: results
                };
            }
        }
        
        return {
            success: true,
            joinedCount: partsToJoin.length,
            results: results
        };
    }
};

// ═══════════════════════════════════════════════════════════════
// ЭКСПОРТ ФУНКЦИЙ
// ═══════════════════════════════════════════════════════════════

function canJoinParts(nested1, nested2) {
    return JoinParts.canJoin(nested1, nested2);
}

function joinParts(nested1, nested2) {
    return JoinParts.joinTwoParts(nested1, nested2);
}

function addPartToBlock(block, newPart) {
    return JoinParts.addToBlock(block, newPart);
}

function joinMultipleParts(nestedParts, indices) {
    return JoinParts.joinMultiple(nestedParts, indices);
}

// Делаем доступным глобально
if (typeof window !== 'undefined') {
    window.JoinParts = JoinParts;
    window.canJoinParts = canJoinParts;
    window.joinParts = joinParts;
    window.addPartToBlock = addPartToBlock;
    window.joinMultipleParts = joinMultipleParts;
}

console.log('✅ JoinParts загружен');
