// ═══════════════════════════════════════════════════════════════
// STATE MANAGEMENT - Единый центр хранения данных
// ═══════════════════════════════════════════════════════════════

const Store = {
    // ═══════════════════════════════════════════════════════════
    // СОСТОЯНИЕ (все данные приложения)
    // ═══════════════════════════════════════════════════════════
    state: {
        // Детали
        parts: [],
        
        // Размещённые детали на листе
        nestedParts: [],
        
        // Выделенные детали на листе
        selectedNestedParts: [],
        
        // Все листы с раскладкой
        allSheets: [],
        
        // Текущий отображаемый лист
        currentSheetIndex: 0,
        
        // Показать ли вид листа
        showSheetView: false,
        
        // Прямоугольники разметки (текущий лист)
        markupRects: [],
        
        // Выделенный прямоугольник разметки
        selectedRectIndex: -1,
        
        // Размер листа
        sheetSize: { width: 1250, height: 2500 },
        
        // Разрешение наложения деталей
        allowOverlap: false,
        
        // Объекты на холсте (для режима рисования)
        objects: [],
        
        // Выделенные объекты на холсте
        selectedObjects: [],
        
        // Размерные линии
        dimensionLines: [],
        
        // Текущий инструмент
        currentTool: 'select'
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПОДПИСЧИКИ (уведомления об изменениях)
    // ═══════════════════════════════════════════════════════════
    subscribers: new Map(),
    
    // ═══════════════════════════════════════════════════════════
    // ПОЛУЧИТЬ значение
    // ═══════════════════════════════════════════════════════════
    get(path) {
        if (!path) return this.state;
        
        const keys = path.split('.');
        let value = this.state;
        
        for (const key of keys) {
            if (value === undefined || value === null) {
                return undefined;
            }
            value = value[key];
        }
        
        return value;
    },
    
    // ═══════════════════════════════════════════════════════════
    // УСТАНОВИТЬ значение
    // ═══════════════════════════════════════════════════════════
    set(path, value, options = {}) {
        const { silent = false, skipRender = false } = options;
        
        if (!path) {
            console.error('Store.set: path is required');
            return false;
        }
        
        const keys = path.split('.');
        const lastKey = keys.pop();
        
        let obj = this.state;
        for (const key of keys) {
            if (obj[key] === undefined || obj[key] === null) {
                obj[key] = {};
            }
            obj = obj[key];
        }
        
        // Старое значение (для undo)
        const oldValue = obj[lastKey];
        
        // Устанавливаем новое значение
        obj[lastKey] = value;
        
        // Уведомляем подписчиков
        if (!silent) {
            this.notify(path, value, oldValue);
            
            // Авто-обновление UI
            if (!skipRender && typeof render === 'function') {
                render();
            }
            
            if (!skipRender && typeof updatePartsList === 'function') {
                updatePartsList();
            }
        }
        
        return true;
    },
    
    // ═══════════════════════════════════════════════════════════
    // УВЕДОМИТЬ подписчиков
    // ═══════════════════════════════════════════════════════════
    notify(path, newValue, oldValue) {
        // Уведомляем подписчиков этого пути
        const subscribers = this.subscribers.get(path) || [];
        subscribers.forEach(callback => {
            try {
                callback(newValue, oldValue, path);
            } catch (e) {
                console.error('Store subscriber error:', e);
            }
        });
        
        // Уведомляем подписчиков родительских путей
        const parts = path.split('.');
        for (let i = parts.length - 1; i > 0; i--) {
            const parentPath = parts.slice(0, i).join('.');
            const parentSubscribers = this.subscribers.get(parentPath) || [];
            parentSubscribers.forEach(callback => {
                try {
                    callback(this.get(parentPath), undefined, parentPath);
                } catch (e) {
                    console.error('Store subscriber error:', e);
                }
            });
        }
        
        // Логирование изменений (для отладки)
        console.log(`📝 Store: ${path} =`, newValue);
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПОДПИСАТЬСЯ на изменения
    // ═══════════════════════════════════════════════════════════
    subscribe(path, callback) {
        if (!this.subscribers.has(path)) {
            this.subscribers.set(path, []);
        }
        this.subscribers.get(path).push(callback);
        
        // Возвращаем функцию отписки
        return () => {
            const subscribers = this.subscribers.get(path) || [];
            const index = subscribers.indexOf(callback);
            if (index > -1) {
                subscribers.splice(index, 1);
            }
        };
    },
    
    // ═══════════════════════════════════════════════════════════
    // СБРОСИТЬ состояние
    // ═══════════════════════════════════════════════════════════
    reset(newState = {}) {
        const oldState = { ...this.state };
        this.state = { ...this.state, ...newState };
        this.notify('*', this.state, oldState);
    },
    
    // ═══════════════════════════════════════════════════════════
    // ЭКСПОРТ состояния (для сохранения)
    // ═══════════════════════════════════════════════════════════
    exportState() {
        return JSON.parse(JSON.stringify(this.state));
    },
    
    // ═══════════════════════════════════════════════════════════
    // ИМПОРТ состояния (для загрузки)
    // ═══════════════════════════════════════════════════════════
    importState(newState) {
        if (!newState || typeof newState !== 'object') {
            console.error('Store.importState: invalid state');
            return false;
        }
        
        this.state = { ...this.state, ...newState };
        this.notify('*', this.state, undefined);
        return true;
    },
    
    // ═══════════════════════════════════════════════════════════
    // ОТЛАДКА (вывод состояния в консоль)
    // ═══════════════════════════════════════════════════════════
    debug() {
        console.group('📦 Store State');
        console.table({
            parts: this.state.parts?.length || 0,
            nestedParts: this.state.nestedParts?.length || 0,
            allSheets: this.state.allSheets?.length || 0,
            currentSheetIndex: this.state.currentSheetIndex,
            showSheetView: this.state.showSheetView,
            markupRects: this.state.markupRects?.length || 0,
            objects: this.state.objects?.length || 0,
            selectedObjects: this.state.selectedObjects?.length || 0
        });
        console.groupEnd();
    }
};

// ═══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════

// Быстрый доступ к часто используемым данным
const StoreHelpers = {
    // Получить количество размещённых деталей определённого типа
    getPlacedCount(partId) {
        const nestedParts = Store.get('nestedParts') || [];
        return nestedParts.filter(n => n.partId === partId).length;
    },
    
    // Получить деталь по ID
    getPart(partId) {
        const parts = Store.get('parts') || [];
        return parts.find(p => p.id === partId);
    },
    
    // Получить общее количество деталей типа
    getTotalQuantity(partId) {
        const part = this.getPart(partId);
        return part ? part.quantity : 0;
    },
    
    // Получить оставшееся количество деталей типа
    getRemainingQuantity(partId) {
        const total = this.getTotalQuantity(partId);
        const placed = this.getPlacedCount(partId);
        return total - placed;
    },
    
    // Проверить, размещены ли все детали типа
    isFullyPlaced(partId) {
        return this.getRemainingQuantity(partId) <= 0;
    },
    
    // Очистить все размещённые детали
    clearAllNested() {
        Store.set('nestedParts', []);
        Store.set('selectedNestedParts', []);
        Store.set('allSheets', []);
        Store.set('currentSheetIndex', 0);
    },
    
    // Очистить прямоугольники разметки
    clearAllMarkup() {
        Store.set('markupRects', []);
        Store.set('selectedRectIndex', -1);
    }
};

// Делаем Store доступным глобально
window.Store = Store;
window.StoreHelpers = StoreHelpers;

console.log('✅ State Management (Store) загружен');
