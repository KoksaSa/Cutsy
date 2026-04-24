// k: SilikinK Project
// ═══════════════════════════════════════════════════════════════
// TRANSLATIONS - Мультиязычность Cutsy
// ═══════════════════════════════════════════════════════════════

const TRANSLATIONS = {
    // ═══════════════════════════════════════════════════════════
    // ENGLISH
    // ═══════════════════════════════════════════════════════════
    en: {
        // Tools
        tool_select: 'Select',
        tool_line: 'Line',
        tool_circle: 'Circle',
        tool_rect: 'Rectangle',
        tool_polygon: 'Polygon',
        tool_dimension: 'Dimension',
        tool_angle: 'Angle',
        tool_eraser: 'Eraser',
        tool_text: 'Text',
        
        // Toolbar
        toolbar_title: 'Tools',
        parts_title: '📋 Parts',
        sheet_title: '📐 Sheet',
        gaps_title: '📐 Gaps',
        actions_title: '⚙️ Actions',
        
        // Labels
        gap_between_label: '🔗 Gap between parts (mm):',
        edge_gap_label: '📐 Edge gap (mm):',
        part_name_label: '📝 Part name:',
        part_name_placeholder: 'e.g. Part 1',
        part_quantity_label: '📋 Quantity (pcs):',
        part_thickness_label: '📏 Metal thickness (mm):',
        
        // Main buttons
        btn_auto_dimensions: '📏 Auto Dimensions',
        btn_clear_dimensions: '🗑️ Clear Dimensions',
        btn_show_sheet: '👁️ Show Sheet',
        btn_hide_sheet: '👁️ Hide Sheet',
        btn_add_sheet: '📄 Add Sheet',
        btn_clear_nesting: '🗑️ Clear Nesting',
        btn_nesting_all: '📑 Nesting (All Sheets)',
        btn_nesting_current: '📑 Nesting (Current)',
        btn_import_dxf: '📥 Import DXF',
        btn_export_dxf: '📁 Export DXF',
        btn_export_dxf_context: '📄 Export DXF',
        btn_export_svg: '📄 Export SVG',
        btn_export_pdf_drawing: '🖼️ Drawing PDF',
        btn_export_pdf_report: '📊 Report PDF',
        btn_create_remnant: '📸 Create Remnant',
        btn_clear_all: '🗑️ Clear All',
        btn_rotate_cw: '↻ Rotate CW',
        btn_rotate_ccw: '↺ Rotate CCW',
        btn_flip_x: '↔️ Flip X',
        btn_flip_y: '↕️ Flip Y',
        btn_prev_sheet: '⏮️',
        btn_next_sheet: '⏭️',
        btn_resize_sheet: '📐',
        btn_delete_sheet: '🗑️',
        btn_nesting_overlap_off: '🚫 Overlap: OFF',
        btn_nesting_overlap_on: '✅ Overlap: ON',
        btn_markup_rect: '⬜ Markup Remnant',
        btn_clear_markup: '🗑️ Clear Markup',
        btn_view_part: '👁️',
        btn_delete_part: '×',
        btn_fast_rotation: '🚀',
        btn_full_rotation: '🐢',
        btn_auto_rotation: '🤖',
        btn_one_cut: '🔗 One Cut',

        // Section titles
        properties_title: 'Properties',
        objects_title: 'Objects',
        select_object_to_edit: 'Select an object to edit',
        
        // Right panel sections
        danger_zone_label: '⚠️ Danger zone:',
        rotation_label: '🔄 Rotation:',
        btn_rotate_ccw_nested: '↺ Rotate CCW',
        btn_rotate_cw_nested: '↻ Rotate CW',
        reflection_label: '🪞 Reflection:',
        btn_flip_x_nested: '↔ Flip X',
        btn_flip_y_nested: '↕ Flip Y',
        join_label: '🔗 Join:',
        btn_join_selected: '🔗 Join selected',
        markup_remnant_label: '📐 Remnant markup:',
        btn_markup_remnant: '⬜ Markup remnant',
        btn_clear_markup: '🗑️ Clear markup',
        
        // Properties panel
        object_type_label: 'Object type',
        rect_type: 'Rectangle',
        width_label: '📐 Width (Enter to apply)',
        height_label: '📐 Height (Enter to apply)',
        
        // Context menu info
        part_size_label: '📐 Size:',
        part_area_label: '📊 Area:',
        part_thickness_label_info: '📏 Thickness:',
        part_weight_label: '⚖️ Weight:',
        part_cost_label: '💰 Cost:',
        
        // Sheet info
        sheet_nav_info: 'Sheet {current} of {total} ({thickness}mm)',
        sheet_info_top: 'Sheet: {width} × {height} mm (×{zoom})',
        sheet_info_top_remnant: '📸 Remnant: {width} × {height} mm (×{zoom})',
        
        // Status bar
        status_coords: '📍',
        status_tool: '🔧 Tool:',
        status_zoom: '🔍 Zoom:',
        status_selected: 'Selected:',
        status_nested: 'Nested:',
        status_sheet: 'Sheet:',
        
        // Tools names in status
        tool_name_select: 'Select',
        tool_name_line: 'Line',
        tool_name_circle: 'Circle',
        tool_name_rect: 'Rectangle',
        tool_name_polygon: 'Polygon',
        tool_name_dimension: 'Dimension',
        tool_name_angle: 'Angle',
        
        // Parts list
        part_no_parts: '📭 No parts<br><small style="color:#555">Select objects<br>and right-click → "Create Part"</small>',
        part_placed: '✅ Placed:',
        part_not_placed: '⚠️ Not placed',
        part_quantity: 'Qty:',
        part_one_cut: '🔗 One Cut',
        
        // Nesting
        nesting_progress: '⏳ Nesting in progress...',
        nesting_complete: '✅ Nesting complete!',
        nesting_cancelled: '⚠️ Nesting cancelled!',
        nesting_no_parts: '❌ No parts to nest',
        nesting_error: '❌ Nesting error',
        nesting_success: '✅ Nesting complete!',
        nesting_sheets: 'Sheets:',
        nesting_parts: 'Parts placed:',
        nesting_remaining: 'Remaining parts:',
        
        // Alerts
        alert_select_objects: 'Select objects first',
        alert_select_parts: 'Create parts first (right-click → "Create Part")',
        alert_confirm_clear: 'Are you sure you want to delete all objects, dimensions and parts?',
        alert_confirm_clear_nesting: 'Clear nesting from all sheets?\n\nAll placed parts and markup will be deleted.',
        alert_no_markup: 'No markup rectangles',
        alert_part_not_found: 'Part not found',
        alert_invalid_quantity: 'Quantity must be from 1 to 9999',
        alert_invalid_thickness: 'Invalid thickness\n\nThickness must be from 0.1 to 100 mm',
        alert_nesting_cancelled: '⚠️ Nesting interrupted!\n\nSheets placed: {sheets}\nParts remaining: {parts}',
        alert_nesting_failed: '❌ Could not place parts',
        alert_create_parts_first: 'First create parts (button "📦 Create Part")',
        alert_create_parts_context: 'First create parts (select objects → right-click → "Create Part")',
        
        // Context menu
        ctx_create_part: '📦 Create Part',
        ctx_select_all_parts: 'Select all this type',
        ctx_delete: '🗑️ Delete',
        ctx_fill_rect: '📦 Fill Rectangle',
        
        // Nested part info menu
        nested_info_title: '📊 Part Info',
        close: 'Close',
        
        // Add parts menu
        add_parts_title: '📦 Add Parts to Sheet',
        add: 'Add',
        
        // Fill remnant menu
        fill_remnant_title: '📦 Fill Remnant',
        btn_place: '🚀 Place',
        
        // Sheet info
        sheet_info: 'Sheet {current} of {total}',
        sheet_remnant: '📸 Remnant: {w} × {h} mm (×{zoom})',
        sheet_standard: 'Sheet: {w} × {h} mm (×{zoom})',
        
        // Donation banner
        donate_title: 'Like the project?',
        donate_text: 'Support development — donate from <strong>100 ₽</strong>',
        donate_card: '🏦 T-Bank: <strong>2200 7010 8281 9795</strong>',
        donate_hint: 'Transfer any amount and message me:<br><a href="https://t.me/SilikinK" target="_blank" style="color:#4fc3f7;text-decoration:none;font-weight:bold;">📩 @SilikinK</a>',
        
        // Export
        export_drawing: 'Drawing',
        export_report: 'Nesting Report',
        export_date: 'Date',
        export_sheet: 'Sheet',
        export_sheets: 'Sheets',
        export_sheet_size: 'Sheet size',
        export_price_per_kg: 'Price per kg',
        export_sheet_plural: 'sheets',
        export_part: 'Part',
        export_quantity: 'Qty',
        export_placed: 'Placed',
        export_total: 'Total',
        export_thickness: 'Thickness',
        export_dimensions: 'Dimensions',
        export_area: 'Area',
        export_perimeter: 'Perimeter',
        export_weight: 'Weight',
        export_cutting: 'Cutting',
        export_cost: 'Cost',
        export_total_thickness: 'Total for thickness',
        export_not_placed: 'NOT PLACED',
        export_grand_total: 'GRAND TOTAL',
        export_total_placed: 'Total parts placed',
        export_total_not_placed: 'Total parts not placed',
        export_cutting_length: 'Cutting length',
        export_parts_cost: 'Parts cost',
        export_remnant: 'REMNANT (all sheets)',
        export_remnant_area: 'Remnant area',
        export_remnant_cost: 'Remnant cost',
        export_all: 'ALL',
        export_total_weight: 'Total weight',
        report_title: 'Nesting Report',
        alert_nesting_required: 'First perform nesting (button "📑 Nesting (All Sheets)")',
        
        // Properties panel
        prop_x: 'X:',
        prop_y: 'Y:',
        prop_width: 'W:',
        prop_height: 'H:',
        prop_radius: 'R:',
        prop_length: 'Length:',
        prop_angle: 'Angle:',
        prop_sides: 'Sides:',
        prop_font_size: 'Font:',
        prop_text: 'Text:',
        
        // Misc
        lang_en: 'EN',
        lang_ru: 'RU',
        mm: 'mm',
        deg: '°',
        degrees: 'degrees',
        objects: 'objects',
        part: 'Part',
        sheet: 'Sheet',
        loading: 'Loading...',
        processing: 'Processing...',
        cancel: 'Cancel',
        ok: 'OK',
        yes: 'Yes',
        no: 'No',
        
        // DXF Import
        dxf_import_title: '📥 Import DXF Files',
        dxf_import_files: 'Files',
        dxf_import_quantity: 'Qty',
        dxf_import_thickness: 'Thickness',
        dxf_import_name: 'Name',
        dxf_import_one_cut: 'One Cut',
        dxf_import_select_files: 'Select DXF files',
        dxf_import_add: 'Add Files',
        dxf_import_start: 'Start Import',
        dxf_import_cancel: 'Cancel',
        dxf_import_summary: '📊 Summary:',
        dxf_import_files_selected: 'files selected,',
        dxf_import_parts_will: 'parts will be imported',
        dxf_import_select_all: '✅ Select All',
        dxf_import_deselect_all: '❌ Deselect All',
        dxf_import_selected: '📥 Import Selected',
        dxf_import_limit_warning: '⚠️ Maximum 20 files.',
        dxf_import_summary: 'Summary',
        dxf_import_total_parts: 'Total parts:',
        dxf_import_importing: 'Importing...',
        
        // Sheet remnant
        remnant_title: '📸 Sheet Remnant',
        remnant_upload: 'Upload Photo',
        remnant_calibrate: 'Calibrate',
        remnant_create: 'Create Remnant',
        remnant_point1: 'Point 1',
        remnant_point2: 'Point 2',
        remnant_distance: 'Distance',
        remnant_width: 'Width',
        remnant_height: 'Height',
    },
    
    // ═══════════════════════════════════════════════════════════
    // РУССКИЙ
    // ═══════════════════════════════════════════════════════════
    ru: {
        // Инструменты
        tool_select: 'Выбор',
        tool_line: 'Линия',
        tool_circle: 'Круг',
        tool_rect: 'Прямоуг',
        tool_polygon: 'Многоуг',
        tool_dimension: 'Размер',
        tool_angle: 'Угол',
        tool_eraser: 'Ластик',
        tool_text: 'Текст',
        
        // Панель инструментов
        toolbar_title: 'Инструменты',
        parts_title: '📋 Детали',
        sheet_title: '📐 Лист',
        gaps_title: '📐 Зазоры',
        actions_title: '⚙️ Действия',
        
        // Метки
        gap_between_label: '🔗 Зазор между деталями (мм):',
        edge_gap_label: '📐 Отступ от края листа (мм):',
        part_name_label: '📝 Имя детали:',
        part_name_placeholder: 'Например: Деталь 1',
        part_quantity_label: '📋 Количество деталей (шт):',
        part_thickness_label: '📏 Толщина металла (мм):',
        
        // Основные кнопки
        btn_auto_dimensions: '📏 Авто-размеры',
        btn_clear_dimensions: '🗑️ Скрыть размеры',
        btn_show_sheet: '👁️ Показать лист',
        btn_hide_sheet: '👁️ Скрыть лист',
        btn_nesting_all: '📑 Раскладка (все листы)',
        btn_nesting_current: '📑 Раскладка (текущий)',
        btn_import_dxf: '📥 Импорт DXF',
        btn_export_dxf: '📁 Экспорт раскладки (DXF)',
        btn_add_sheet: "📄 Добавить лист",
        btn_clear_nesting: "🗑️ Очистить раскладку" ,
        //btn_export_dxf_context: '📄 Экспорт в DXF',
        //btn_export_svg: '📄 Экспорт SVG',//
        btn_export_pdf_drawing: '🖼️ Чертеж PDF',
        btn_export_pdf_report: '📊 Отчёт PDF',
        btn_create_remnant: '📸 Создать остаток',
        btn_clear_all: '🗑️ Удалить всё',
        btn_rotate_cw: '↻ Повернуть →',
        btn_rotate_ccw: '↺ Повернуть ←',
        btn_flip_x: '↔️ Отразить X',
        btn_flip_y: '↕️ Отразить Y',
        btn_prev_sheet: '⏮️',
        btn_next_sheet: '⏭️',
        btn_resize_sheet: '📐',
        btn_delete_sheet: '🗑️',
        btn_nesting_overlap_off: '🚫 Наложение: ВЫКЛ',
        btn_nesting_overlap_on: '✅ Наложение: ВКЛ',
        btn_markup_rect: '⬜ Разметка остатка',
        btn_clear_markup: '🗑️ Очистить разметку',
        btn_view_part: '👁️',
        btn_delete_part: '×',
        btn_fast_rotation: '🚀',
        btn_full_rotation: '🐢',
        btn_auto_rotation: '🤖',
        btn_one_cut: '🔗 В один рез',
        
        // Заголовки секций
        properties_title: 'Свойства',
        objects_title: 'Объекты',
        select_object_to_edit: 'Выберите объект для редактирования',
        
        // Правая панель
        danger_zone_label: '⚠️ Зона опасности:',
        rotation_label: '🔄 Поворот:',
        btn_rotate_ccw_nested: '↺ Повернуть против часовой',
        btn_rotate_cw_nested: '↻ Повернуть по часовой',
        reflection_label: '🪞 Отражение:',
        btn_flip_x_nested: '↔️ Отразить по X',
        btn_flip_y_nested: '↕️ Отразить по Y',
        join_label: '🔗 Соединение:',
        btn_join_selected: '🔗 Соединить выбранные',
        diagonal_layout_label: '📐 Диагональная раскладка:',
        btn_diagonal_layout: '📐 Диагональная раскладка',
        markup_remnant_label: '📐 Разметка остатка:',
        btn_markup_remnant: '⬜ Разметка остатка',
        btn_clear_markup: '🗑️ Очистить разметку',
        
        // Панель свойств
        object_type_label: 'Тип объекта',
        rect_type: 'Прямоугольник',
        width_label: '📐 Ширина (Enter для применения)',
        height_label: '📐 Высота (Enter для применения)',
        
        // Контекстное меню
        part_size_label: '📐 Размер:',
        part_area_label: '📊 Площадь:',
        part_thickness_label_info: '📏 Толщина:',
        part_weight_label: '⚖️ Вес:',
        part_cost_label: '💰 Себестоимость:',
        
        // Информация о листе
        sheet_nav_info: 'Лист {current} из {total} ({thickness}мм)',
        sheet_info_top: 'Лист: {width} × {height} мм (×{zoom})',
        sheet_info_top_remnant: '📸 Остаток: {width} × {height} мм (×{zoom})',
        
        // Статус-бар
        status_coords: '📍',
        status_tool: '🔧 Инструмент:',
        status_zoom: '🔍 Масштаб:',
        status_selected: 'Выделено:',
        status_nested: 'Размещено:',
        status_sheet: 'Лист:',
        
        // Названия инструментов в статусе
        tool_name_select: 'Выбрать',
        tool_name_line: 'Линия',
        tool_name_circle: 'Круг',
        tool_name_rect: 'Прямоугольник',
        tool_name_polygon: 'Многоугольник',
        tool_name_dimension: 'Размер',
        tool_name_angle: 'Угол',
        
        // Список деталей
        part_no_parts: '📭 Нет деталей<br><small style="color:#555">Выделите объекты<br>и кликните ПКМ → "Создать деталь"</small>',
        part_placed: '✅ Размещено:',
        part_not_placed: '⚠️ Не размещено',
        part_quantity: 'Кол-во:',
        part_one_cut: '🔗 В один рез',
        
        // Раскладка
        nesting_progress: '⏳ Идёт раскладка...',
        nesting_complete: '✅ Раскладка завершена!',
        nesting_cancelled: '⚠️ Раскладка отменена!',
        nesting_no_parts: '❌ Нет деталей для раскладки',
        nesting_error: '❌ Ошибка раскладки',
        nesting_success: '✅ Раскладка завершена!',
        nesting_sheets: 'Листов:',
        nesting_parts: 'Деталей размещено:',
        nesting_remaining: 'Осталось деталей:',
        
        // Предупреждения
        alert_select_objects: 'Сначала выделите объекты',
        alert_select_parts: 'Сначала создайте детали (кнопка "📦 Создать деталь")',
        alert_confirm_clear: 'Вы уверены, что хотите удалить все объекты, размеры и детали?',
        alert_confirm_clear_nesting: '🗑️ Очистить раскладку со всех листов?\n\nВсе размещённые детали и прямоугольники разметки будут удалены.',
        alert_no_markup: 'ℹ️ Нет прямоугольников разметки',
        alert_part_not_found: 'Деталь не найдена',
        alert_invalid_quantity: '⚠️ Количество должно быть от 1 до 9999',
        alert_invalid_thickness: '⚠️ Некорректная толщина\n\nТолщина должна быть от 0.1 до 100 мм',
        alert_nesting_cancelled: '⚠️ Раскладка прервана!\n\nРазмещено листов: {sheets}\nОсталось деталей: {parts}',
        alert_nesting_failed: '❌ Не удалось разместить детали',
        alert_create_parts_first: '📦 Сначала создайте детали (кнопка "📦 Создать деталь")',
        alert_create_parts_context: 'Сначала создайте детали (выделите объекты → ПКМ → "Создать деталь")',
        
        // Контекстное меню
        ctx_create_part: '📦 Создать деталь',
        ctx_select_all_parts: 'Выделить все этого типа',
        ctx_delete: '🗑️ Удалить',
        ctx_fill_rect: '📦 Заполнить прямоугольник',
        
        // Меню информации о детали
        nested_info_title: '📊 Информация о детали',
        close: 'Закрыть',
        
        // Меню добавления деталей
        add_parts_title: '📦 Добавить детали на лист',
        add: 'Добавить',
        
        // Меню заполнения остатка
        fill_remnant_title: '📦 Заполнить остаток',
        btn_place: '🚀 Разместить',
        
        // Информация о листе
        sheet_info: 'Лист {current} из {total}',
        sheet_remnant: '📸 Остаток: {w} × {h} мм (×{zoom})',
        sheet_standard: 'Лист: {w} × {h} мм (×{zoom})',
        
        // Баннер доната
        donate_title: 'Поддержите развитие донатом',
        donate_text: 'Поддержите развитие — донат от <strong>100 ₽</strong>',
        donate_card: '🏦 Т-Банк: <strong>2200 7010 8281 9795</strong>',
        donate_hint: 'Переведите любую сумму и напишите мне:<br><a href="https://t.me/SilikinK" target="_blank" style="color:#4fc3f7;text-decoration:none;font-weight:bold;">📩 @SilikinK</a>',
        
        // Экспорт
        export_drawing: 'Чертеж',
        export_report: 'Отчёт о раскладке',
        export_date: 'Дата',
        export_sheet: 'Лист',
        export_sheets: 'Листов',
        export_sheet_size: 'Размер листа',
        export_price_per_kg: 'Цена за кг',
        export_sheet_plural: 'лист(а)',
        export_part: 'Деталь',
        export_quantity: 'Кол-во',
        export_placed: 'Размещено',
        export_total: 'Итого',
        export_thickness: 'Толщина',
        export_dimensions: 'Размеры',
        export_area: 'Площадь',
        export_perimeter: 'Периметр',
        export_weight: 'Вес',
        export_cutting: 'Рез',
        export_cost: 'Себестоимость',
        export_total_thickness: 'Итого по толщине',
        export_not_placed: 'НЕ РАЗМЕСТИЛИСЬ',
        export_grand_total: 'ОБЩИЙ ИТОГ',
        export_total_placed: 'Всего деталей размещено',
        export_total_not_placed: 'Всего деталей не разместилось',
        export_cutting_length: 'Длина реза',
        export_parts_cost: 'Себестоимость деталей',
        export_remnant: 'ОСТАТОК (на всех листах)',
        export_remnant_area: 'Площадь остатка',
        export_remnant_cost: 'Цена остатка',
        export_all: 'ВСЕГО',
        export_total_weight: 'Общий вес',
        report_title: 'Отчёт по раскладке',
        alert_nesting_required: 'Сначала выполните раскладку (кнопка "📑 Раскладка (все листы)")',
        
        // Панель свойств
        prop_x: 'X:',
        prop_y: 'Y:',
        prop_width: 'Ш:',
        prop_height: 'В:',
        prop_radius: 'R:',
        prop_length: 'Длина:',
        prop_angle: 'Угол:',
        prop_sides: 'Сторон:',
        prop_font_size: 'Шрифт:',
        prop_text: 'Текст:',
        
        // Разное
        lang_en: 'EN',
        lang_ru: 'RU',
        mm: 'мм',
        deg: '°',
        degrees: 'градусов',
        objects: 'объектов',
        part: 'Деталь',
        sheet: 'Лист',
        loading: 'Загрузка...',
        processing: 'Обработка...',
        cancel: 'Отмена',
        ok: 'OK',
        yes: 'Да',
        no: 'Нет',
        
        // Импорт DXF
        dxf_import_title: '📥 Импорт DXF файлов',
        dxf_import_files: 'Файлы',
        dxf_import_quantity: 'Кол-во',
        dxf_import_thickness: 'Толщина',
        dxf_import_name: 'Имя',
        dxf_import_one_cut: 'В один рез',
        dxf_import_select_files: 'Выберите DXF файлы',
        dxf_import_add: 'Добавить файлы',
        dxf_import_start: 'Начать импорт',
        dxf_import_cancel: 'Отмена',
        dxf_import_summary: '📊 Итого:',
        dxf_import_files_selected: 'файлов выбрано,',
        dxf_import_parts_will: 'деталей будет импортировано',
        dxf_import_select_all: '✅ Выбрать все',
        dxf_import_deselect_all: '❌ Снять все',
        dxf_import_selected: '📥 Импортировать выбранные',
        dxf_import_limit_warning: '⚠️ Максимум 20 файлов.',
        dxf_import_summary: 'Итого',
        dxf_import_total_parts: 'Всего деталей:',
        dxf_import_importing: 'Импорт...',
        
        // Остаток листа
        remnant_title: '📸 Остаток листа',
        remnant_upload: 'Загрузить фото',
        remnant_calibrate: 'Калибровка',
        remnant_create: 'Создать остаток',
        remnant_point1: 'Точка 1',
        remnant_point2: 'Точка 2',
        remnant_distance: 'Расстояние',
        remnant_width: 'Ширина',
        remnant_height: 'Высота',
    }
};

// ═══════════════════════════════════════════════════════════════
// ТЕКУЩИЙ ЯЗЫК
// ═══════════════════════════════════════════════════════════════

let currentLanguage = localStorage.getItem('cutsy_language') || 'ru';

// ═══════════════════════════════════════════════════════════════
// ФУНКЦИЯ ПОЛУЧЕНИЯ ПЕРЕВОДА
// ═══════════════════════════════════════════════════════════════

function t(key, params = {}) {
    const lang = TRANSLATIONS[currentLanguage] || TRANSLATIONS.en;
    let text = lang[key] || TRANSLATIONS.en[key] || key;
    
    // Замена плейсхолдеров {key} на значения
    for (const [paramKey, paramValue] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), paramValue);
    }
    
    return text;
}

// ═══════════════════════════════════════════════════════════════
// ФУНКЦИЯ СМЕНЫ ЯЗЫКА
// ═══════════════════════════════════════════════════════════════

function setLanguage(lang) {
    if (!TRANSLATIONS[lang]) return;
    
    currentLanguage = lang;
    localStorage.setItem('cutsy_language', lang);
    
    // Обновляем все элементы с data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.innerHTML = t(key);
    });
    
    // Обновляем placeholder'ы
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
    
    // Обновляем title'ы
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = t(key);
    });
    
    // Обновляем статус-бар
    updateStatusBar();
    
    // Обновляем список деталей
    if (typeof updatePartsList === 'function') {
        updatePartsList();
    }
    
    // Обновляем кнопку языка
    const langBtn = document.getElementById('langToggle');
    if (langBtn) {
        langBtn.textContent = lang === 'en' ? 'RU' : 'EN';
        langBtn.setAttribute('data-i18n', lang === 'en' ? 'lang_ru' : 'lang_en');
        langBtn.title = lang === 'en' ? 'Switch to Russian' : 'Переключить на английский';
    }
    
    console.log(`🌐 Language set to: ${lang}`);
}

// ═══════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════════

function initLanguage() {
    // Устанавливаем язык при загрузке
    setLanguage(currentLanguage);
    
    // Добавляем обработчик переключения
    const langToggle = document.getElementById('langToggle');
    if (langToggle) {
        langToggle.addEventListener('click', () => {
            const newLang = currentLanguage === 'en' ? 'ru' : 'en';
            setLanguage(newLang);
        });
    }

    // ═══════════════════════════════════════════════════════════
    // СЕКУНДОМЕР
    // ═══════════════════════════════════════════════════════════
    const swDisplay = document.getElementById('stopwatchDisplay');
    const swToggle = document.getElementById('stopwatchToggle');
    const swReset = document.getElementById('stopwatchReset');
    let swRunning = false;
    let swSeconds = 0;
    let swInterval = null;

    function formatTime(totalSec) {
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    if (swToggle) {
        swToggle.addEventListener('click', () => {
            swRunning = !swRunning;
            if (swRunning) {
                swToggle.textContent = '⏸';
                swToggle.style.background = '#c7a22e';
                swInterval = setInterval(() => {
                    swSeconds++;
                    if (swDisplay) swDisplay.textContent = formatTime(swSeconds);
                }, 1000);
            } else {
                swToggle.textContent = '▶';
                swToggle.style.background = '#2d7d2d';
                clearInterval(swInterval);
            }
        });
    }

    if (swReset) {
        swReset.addEventListener('click', () => {
            swRunning = false;
            swSeconds = 0;
            clearInterval(swInterval);
            if (swToggle) { swToggle.textContent = '▶'; swToggle.style.background = '#2d7d2d'; }
            if (swDisplay) swDisplay.textContent = '00:00';
        });
    }

    // Глобальная функция для получения времени секундомера (в секундах)
    window.getStopwatchTime = function() {
        return swSeconds;
    };
}

// Запускаем при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanguage);
} else {
    initLanguage();
}

// Делаем функции глобальными
window.t = t;
window.setLanguage = setLanguage;
window.currentLanguage = currentLanguage;
