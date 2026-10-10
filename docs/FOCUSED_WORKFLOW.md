# Анатомическая проверка / Anatomy review

Русский выбран по умолчанию; English можно включить в переключателе языка. Задача — установить идентичность клетки, выходы дендритов из сомы и отношения ветвей по исходной ЭМ. Рисовать контур каждой мембраны или проверять все синапсы не требуется. Метки и заметки служат свидетельствами к конкретному вопросу.

## Три связанных вида

| Вид | Что проверять | Как работать |
|---|---|---|
| Сома и дендритные стволы | Эта ли клетка, где каждый дендрит входит в сому, какие исходные исключения ещё требуют объяснения | Выберите клетку и вопрос, перейдите к подготовленной закладке. Проследите нужный маршрут по последовательным срезам и сопоставьте его с 3D. |
| Неясные отношения ветвей | Общий родитель, отдельные входы, границы компартментов, неоднозначное продолжение | Двигайтесь между нерешёнными вопросами группы. Откройте связанный вопрос о маршруте, если его идентичность ещё не установлена. |
| Выбранные контакты | Идентичность, прикрепление, компартмент и качество свидетельств конкретного контакта | Откройте контакт из очереди проблем или найдите точный ID. Сравните исходные pre/post/center, целевую клетку, входящий корень и вычисленное назначение ветви; при необходимости откройте весь набор контактов источника. |

15 групп помогают навигации; все 50 исходных вопросов сохраняют отдельные решения. Четыре группы сомы содержат 30 вопросов; 11 групп ветвей — 20. Одна проверка того же маршрута сохраняется у исходного вопроса и используется в зависимостях. Разные парные и тройные отношения не сливаются. Ответ на вопрос о маршруте не означает, что все связанные контакты или входящие аксоны проверены.

Очередь содержит 891 контакт с исходными флагами компартмента или назначения. Это список документированных проблем, а не обязательная норма и не случайная выборка. Поиск сохраняет доступ ко всем 27 099 контактам. Аналитические знаменатели 1 170 / 1 182 не являются количеством обязательных ручных проверок. Обоснованный протокол выборочного аудита пока не задан.

## Решение и свидетельства

Для каждого вопроса выберите подходящую интерпретацию и результат: подтверждается, опровергается, неопределённо или недостаточно покрытия. Если готовые варианты не подходят, укажите собственный. Кратко опишите наблюдаемое свидетельство и оставшуюся неопределённость; добавьте нужные метки, трассы или сохранённые виды. Исходное состояние — не проверено.

Сохранённый ответ с неопределённостью остаётся научно нерешённым. Показатель записанных ответов не является числом подтверждённых биологических объектов. Унаследованная курация release661, вычисленное назначение, проверка ветви и отдельного контакта показаны раздельно. Статусы входящих аксонов из сохранённой таблицы не удостоверяют их непрерывность или прикрепления. При отсутствии строки качество неизвестно; отдельный аудит остаётся необходимым.

Если изображения или непрерывного маршрута недостаточно, сохраните проблему покрытия с текущим положением и описанием нужного участка. Можно продолжить другой вопрос. Границы подготовленного объёма не доказывают сохранность сигнала; загруженный текущий срез не доказывает полноту всего маршрута. Не соединяйте трассой невидимый промежуток как установленную связь.

## Разметка, положение и перенос

Стрелки, точки, трассы и области сохраняются без автоматического открытия окна. Заметки доступны в свойствах выбранной метки и через «Изменить». Трассу можно закончить открытой или явно замкнуть по первой точке. Каждая метка сохраняет исходные координаты и плоскость. 3D помогает навигации; выбранные сегменты остаются кандидатами, пока идентичность не проверена.

«По размеру окна» меняет масштаб и сохраняет текущий срез. Положение, плоскость, камера и выбранные структуры сохраняются вместе с работой; при возвращении используйте сохранённую позицию вопроса. Увеличение изображения не повышает исходное разрешение. Исходная доступная сетка ЭМ — 8 × 8 × 40 нм; старые подготовленные кропы имеют собственную указанную дискретизацию.

Работа автоматически сохраняется в этом браузере; Ctrl+S принудительно сохраняет текущие изменения. Для резервной копии или переноса используйте «Скачать разметку»: выбранные элементы, текущая задача или весь проект. Для полного переноса связанных вопросов выбирайте весь проект. JSON сохраняет редактируемую работу без изображений; ZIP может включать ЭМ и аннотированные панели. Исходные заметки не переводятся при смене языка экспорта.

«Загрузить разметку» показывает содержимое и конфликты перед применением. Проверьте различия версий и решений; существующая работа не должна заменяться молча. Неподходящая привязка к исходным данным отклоняется. После переноса проверьте вопрос, положение и заметку. Наличие экспортированного файла или техническая проверка импорта не подтверждает анатомию.

Каждый вопрос и контакт сохраняет своё положение и выбранные структуры. Переключение между ними очищает текущий выбор меток для привязки; сохранённые метки остаются в задаче. Для добавления доказательств выберите метки или виды и нажмите «Связать выбранные метки и виды с ответом». Выбранный и текущий экспорт включают связанные решения по зависимостям и их доказательства; полный экспорт удобен как резервная копия. При конфликте «Объединить» сохраняет локальный ответ с тем же ID, а «Заменить» явно принимает входящую запись.

## English quick guide

Use the language selector to switch the interface to English. The three views share the existing linked 2D/3D viewer:

1. **Soma and dendritic stems:** establish target identity and where each dendrite enters the soma, including relevant exclusions. Prepared bookmarks are navigation aids; an outline alone does not establish stem identity.
2. **Uncertain branch relationships:** follow source-nominated route groups and unresolved questions. Reuse the canonical route decision through dependency links. Pair, triple, compartment and damage questions keep their independent scopes.
3. **Selected contact checks:** open documented concerns or search any exact contact/source ID. Inspect original pre/post/center coordinates, source and target identity, computational branch assignment and the complete source footprint where relevant. Record a contact decision explicitly; route decisions never certify contacts automatically.

There are 15 navigation groups, 50 independent questions and 891 optional source-flagged contacts; all 27,099 contacts remain accessible. The 1,170 / 1,182 analysis denominators are not review quotas. A justified audit sampling protocol is still missing.

Record **supported, contradicted, uncertain or insufficient coverage**, with the relevant alternative, an optional custom interpretation and evidence notes/marks. Uncertainty and missing coverage remain scientifically unresolved even after an answer is saved. Save a coverage issue and continue elsewhere when necessary. Inherited release661 proofreading, computational assignment, native branch review and individual contact review are distinct; incoming-source native quality remains a pending dependency.

Drawings save without a popup. Edit notes in the selected-mark properties or explicit Edit dialog. Finish traces open or close them explicitly at their starting point. Fit to window preserves the current section. Zoom changes display size, not image resolution, and a spatial 3D candidate is not a verified identity.

Autosave and Ctrl+S retain your work locally. Export selected/current/all work as editable JSON or a ZIP with optional evidence panels; choose all work for a complete transfer of linked questions. Notes remain in their original language. Import previews conflicts and source/version binding before applying work. Restore and check the same question, coordinates and notes. Technical completion never certifies anatomy.

Source inventory, exact grouping and remaining limitations: [FOCUSED_SOURCES.md](FOCUSED_SOURCES.md).

Questions and contacts each retain their own position and selected structures. Switching context clears the pending evidence selection, while saved marks remain in the task. Select the relevant marks/views and use “Link selected marks and views to this answer.” Current and selected exports include dependent canonical decisions and their evidence. Merge keeps a conflicting local record with the same ID; Replace explicitly accepts the incoming record.
