// panel-resize.js — Изменение ширины панелей перетаскиванием
console.log('🔧 panel-resize.js загружен');

(function() {
    const STORAGE_KEY_TOOLBAR = 'cadToolbarWidth';
    const STORAGE_KEY_PROPERTIES = 'cadPropertiesWidth';
    
    const DEFAULT_TOOLBAR_WIDTH = 280;
    const DEFAULT_PROPERTIES_WIDTH = 220;
    
    const MIN_TOOLBAR_WIDTH = 200;
    const MAX_TOOLBAR_WIDTH = 500;
    
    const MIN_PROPERTIES_WIDTH = 180;
    const MAX_PROPERTIES_WIDTH = 450;

    let activeHandle = null;
    let startX = 0;
    let startWidth = 0;
    let targetPanel = null;

    // Восстанавливаем ширину из localStorage
    function restoreWidths() {
        const toolbar = document.getElementById('toolbar');
        const propertiesPanel = document.getElementById('propertiesPanel');
        
        if (toolbar) {
            const savedWidth = localStorage.getItem(STORAGE_KEY_TOOLBAR);
            if (savedWidth) {
                toolbar.style.width = savedWidth + 'px';
            }
        }
        
        if (propertiesPanel) {
            const savedWidth = localStorage.getItem(STORAGE_KEY_PROPERTIES);
            if (savedWidth) {
                propertiesPanel.style.width = savedWidth + 'px';
            }
        }
    }

    // Сохраняем ширину в localStorage
    function saveWidth(panel, width) {
        if (panel.id === 'toolbar') {
            localStorage.setItem(STORAGE_KEY_TOOLBAR, Math.round(width));
        } else if (panel.id === 'propertiesPanel') {
            localStorage.setItem(STORAGE_KEY_PROPERTIES, Math.round(width));
        }
    }

    // Обработчик начала перетаскивания
    function handleMouseDown(e, handle, panel, minWidth, maxWidth) {
        e.preventDefault();
        activeHandle = handle;
        targetPanel = panel;
        startX = e.clientX;
        startWidth = panel.offsetWidth;
        handle.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }

    // Обработчик перемещения
    function handleMouseMove(e) {
        if (!activeHandle || !targetPanel) return;
        
        const isLeftPanel = targetPanel.id === 'toolbar';
        const minWidth = isLeftPanel ? MIN_TOOLBAR_WIDTH : MIN_PROPERTIES_WIDTH;
        const maxWidth = isLeftPanel ? MAX_TOOLBAR_WIDTH : MAX_PROPERTIES_WIDTH;
        
        const delta = e.clientX - startX;
        let newWidth = startWidth + (isLeftPanel ? delta : -delta);
        
        // Ограничиваем мин/макс
        newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        
        targetPanel.style.width = newWidth + 'px';
    }

    // Обработчик окончания перетаскивания
    function handleMouseUp() {
        if (activeHandle && targetPanel) {
            saveWidth(targetPanel, targetPanel.offsetWidth);
            // Триггерим перерисовку canvas если нужно
            if (typeof render === 'function') {
                render();
            }
        }
        if (activeHandle) {
            activeHandle.classList.remove('resizing');
        }
        activeHandle = null;
        targetPanel = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    // Инициализация
    function init() {
        restoreWidths();
        
        const toolbarHandle = document.getElementById('toolbarResizeHandle');
        const toolbar = document.getElementById('toolbar');
        
        const propertiesHandle = document.getElementById('propertiesPanelResizeHandle');
        const propertiesPanel = document.getElementById('propertiesPanel');
        
        if (toolbarHandle && toolbar) {
            toolbarHandle.addEventListener('mousedown', (e) => {
                handleMouseDown(e, toolbarHandle, toolbar, MIN_TOOLBAR_WIDTH, MAX_TOOLBAR_WIDTH);
            });
        }
        
        if (propertiesHandle && propertiesPanel) {
            propertiesHandle.addEventListener('mousedown', (e) => {
                handleMouseDown(e, propertiesHandle, propertiesPanel, MIN_PROPERTIES_WIDTH, MAX_PROPERTIES_WIDTH);
            });
        }
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // Предотвращаем контекстное меню на resize handle
        [toolbarHandle, propertiesHandle].forEach(handle => {
            if (handle) {
                handle.addEventListener('contextmenu', (e) => e.preventDefault());
            }
        });
    }

    // Запускаем после загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
