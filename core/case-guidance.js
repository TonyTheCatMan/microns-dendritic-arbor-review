/** Short, bilingual instructions for the existing canonical review questions. */
import {taskReviewContent} from './review-task-content.js';
import {activeReviewScope} from './review-scope.js';

const text=(ru,en)=>({ru,en});
const guidance=(instruction,...steps)=>structuredClone({instruction,steps});
const reuseRoute=text('Используйте сохранённую трассу; прослеживайте заново только недостающие или неясные участки.','Reuse the saved trace; trace only missing or ambiguous intervals again.');
const coverage=text('Отметьте разрывы, смену профиля и выходы за доступный объём. Если данных недостаточно, сохраните неопределённость и пояснение.','Mark gaps, profile switches and exits from the available volume. If evidence is insufficient, record uncertainty and an explanation.');

const localGuidance={
  'MC298937.damage_cut4475_z872320':guidance(
    text('Проверьте повреждение изображения возле места прикрепления ветви и запишите, какая граница видна, а какая скрыта. Проверяемое место: узел 4475, z = 872320 нм.','Inspect the image damage near the branch attachment and record which boundary is visible and which is obscured. Inspection location: node 4475, z = 872320 nm.'),
    text('Отметьте границы повреждения и первую и последнюю видимую мембрану кандидата по обе стороны.','Mark the damaged interval and the first and last visible candidate membrane on either side.'),
    text('Не соединяйте разрыв и не считайте его биологическим разделением; сохраните альтернативные продолжения и пробел в данных.','Do not bridge the gap or treat it as a biological split; retain alternative continuations and the evidence gap.')
  ),
  'MC264649.boundary_origin3944':guidance(
    text('Отличите внешнюю мембрану широкого светлого отростка от внутреннего овального ободка у начала 3944. Запишите, какая граница прослеживается и есть ли данные за прилегающую соседнюю клетку.','Distinguish the outer membrane of the broad pale process from the internal oval rim at origin 3944. Record which boundary can be followed and whether evidence supports an apposed neighboring cell.'),
    text('Проверьте верхнее сужение по последовательным срезам; отметьте замыкание внешней мембраны.','Inspect the upper narrowing through serial sections; mark enclosure by the outer membrane.'),
    text('Сопоставьте с сохранённым маршрутом к соме и добавьте только недостающие участки. Если границы неразличимы, сохраните неопределённость.','Compare with the saved route to the soma and add only missing intervals. Retain uncertainty if the boundaries cannot be distinguished.')
  ),
  'MC264649.boundary_excluded3639':guidance(
    text('Отличите внешнюю мембрану косого продольного отростка от тёмной внутренней структуры у начала 3639. Запишите классификацию границы и данные за соседний профиль.','Distinguish the outer membrane of the oblique longitudinal process from its dark internal structure at origin 3639. Record the boundary classification and evidence for a neighboring profile.'),
    text('Отметьте обе внешние стороны отростка и отдельно проверьте прилегающий профиль справа вверху.','Mark both outer sides of the process and separately inspect the apposed upper-right profile.'),
    text('Исходное исключение 3639 сохраняется; эта проверка сама по себе не включает его контакты в выборку.','The original exclusion of 3639 remains; this check alone does not include its contacts in the analysis pool.')
  ),
  'MC264920.boundary_origin5149':guidance(
    text('Проверьте, является ли маленький замкнутый профиль внутренней органеллой или отдельным отростком у начала 5149. Запишите классификацию границы, сохраняя неопределённость, если данных недостаточно.','Check whether the small enclosed profile is an internal organelle or a separate process at origin 5149. Record the boundary classification, retaining uncertainty if the evidence is insufficient.'),
    text('Проследите внешнюю плазматическую мембрану отдельно от внутреннего ободка по последовательным срезам.','Follow the outer plasma membrane separately from the internal rim through serial sections.'),
    text('Сохраните обе альтернативы, пока не установлено, какая мембрана окружает тот же самый отросток; используйте уже сохранённый маршрут.','Retain both alternatives until the enclosing membrane of the same process is established; reuse the saved route.')
  ),
  'MC264920.boundary_origin5794':guidance(
    text('Отличите внутреннюю продольную тёмную структуру от плазматической мембраны, разделяющей отростки, у начала 5794. Запишите классификацию границы и ограничения доступных данных.','Distinguish the internal longitudinal dark structure from a plasma membrane separating processes at origin 5794. Record the boundary classification and limits of the available evidence.'),
    text('Проверьте границу по последовательным срезам до интерпретации кажущегося сужения или расширения отростка.','Inspect the boundary through serial sections before interpreting apparent narrowing or widening of the process.'),
    text('Отметьте выходы за верхнюю и боковую границы объёма и альтернативные продолжения; не достраивайте скрытый путь.','Mark upper and lateral crop exits and alternative continuations; do not fill in an unseen path.')
  ),
  'MC264824.damage_origin2711_z818640':guidance(
    text('Проверьте, какой участок мембраны скрыт диагональным артефактом и слабым контрастом возле начала 2711, z = 818640 нм. Запишите границы скрытого интервала и классификацию повреждения.','Check which membrane interval is obscured by the diagonal artifact and low contrast near origin 2711, z = 818640 nm. Record the obscured interval and the damage classification.'),
    text('Сравните видимые мембраны по обе стороны повреждения и отметьте альтернативные продолжения.','Compare the visible membranes on either side of the damage and mark alternative continuations.'),
    text('Не соединяйте разрыв интерполяцией и не устанавливайте соединение ветвей по скрытому участку.','Do not bridge the gap by interpolation or establish a branch connection across the obscured interval.')
  ),
  'MC264824.excluded2826_vs2428':guidance(
    text('Различите мембраны двух кандидатных профилей и внутренние овальные органеллы у начал 2826 и 2428. Запишите классификацию границ и данные о родительской ветви со стороны сомы.','Distinguish the membranes of the two candidate profiles from internal oval organelles at origins 2826 and 2428. Record the boundary classification and evidence about soma-facing parentage.'),
    text('Прослеживайте кандидаты отдельно, сохраняя идентичность каждого; используйте непрерывные сохранённые маршруты к соме.','Follow the candidates separately, preserving each identity; reuse continuous saved routes to the soma.'),
    text('Начало 2826 и 18 исходных предсказанных аксональных контактов остаются исключёнными. Если непрерывность не видна, сохраните неопределённость.','Origin 2826 and 18 raw predicted-axon contacts remain excluded. Retain uncertainty if continuity cannot be seen.')
  )
};

/** Read-only presentation: does not infer answers, alter eligibility or change source fields. */
export function caseGuidance(catalog,questionId){
  catalog=catalog.taskMap instanceof Map?catalog.catalog:catalog;
  const content=taskReviewContent(catalog,questionId);
  const question=catalog.focusedWorkflow.questions.find(row=>row.id===questionId);
  if(localGuidance[questionId])return structuredClone(localGuidance[questionId]);

  if(question.kind==='identity')return guidance(
    text('Установите, принадлежит ли видимая сома выбранной клетке release661. Запишите совпадение идентичности, другую клетку, несовпадение регистрации или неопределённость по наблюдаемым данным.','Establish whether the visible soma belongs to the selected release661 cell. Record matching identity, a different cell, a registration mismatch or uncertainty according to the evidence.'),
    text('Сопоставьте исходный корень и супервоксель сомы с конкретной внешней плазматической мембраной в ЭМ. Одной близости к исходной точке недостаточно.','Link the source root and soma supervoxel to a specific outer plasma membrane in EM. Proximity to the source point alone is insufficient.'),
    text('Зафиксируйте участки мембраны сомы и признаки, по которым установлена идентичность. Метки и контуры добавляйте там, где они помогают показать эту связь и проверяемый маршрут.','Document the soma membrane regions and features used to establish identity. Add marks and outlines where they help show this identity bridge and its auditable route.')
  );

  if(question.kind==='origin_route'){
    const origins=question.originIds.join(' / ');
    const scoped=activeReviewScope(catalog)?.pool.questions.find(row=>row.id===questionId);
    return guidance(
      text(`Проследите ветвь до проверенной сомы и запишите, входит ли она отдельно или через общий ствол. Начало проверяемого маршрута: ${origins}.`,`Follow the branch to the verified soma and record whether it enters separately or through a shared stem. Route origin: ${origins}.`),
      text('Следите за одной и той же внешней плазматической мембраной по последовательным срезам; отличайте её от внутренних органелл и соседних клеток.','Follow the same outer plasma membrane through serial sections; distinguish it from internal organelles and neighboring cells.'),
      reuseRoute,
      scoped?.priority==='excluded'?text('Сохраните исходное исключение начала. Отметьте смену профиля и недостающие данные; эта проверка не меняет состав выборки.','Preserve the original exclusion of the origin. Mark profile switches and missing evidence; this check does not change pool membership.'):coverage
    );
  }

  if(question.kind==='branch_relation'){
    const origins=question.originIds.join(' / ');
    return guidance(
      text(`Установите, имеют ли указанные ветви общий родительский ствол до сомы или входят в неё отдельно, и запишите наблюдаемое отношение. Сравниваемые начала: ${origins}.`,`Determine whether the nominated branches share a parent stem before the soma or enter it separately, and record the observed relationship. Origins to compare: ${origins}.`),
      text('Сначала сопоставьте сохранённые маршруты каждой ветви до одной проверенной сомы; проследите только недостающие или неясные участки.','First compare the saved routes of each branch to the same verified soma; trace only missing or ambiguous intervals.'),
      text('Отметьте общую точку ветвления, окружённую внешней мембраной, или отдельные входы; сохраните дополнительные связи, противоречия и пробелы.','Mark a shared branchpoint enclosed by the outer membrane or separate soma entries; retain additional relationships, contradictions and gaps.'),
      text('Запишите отдельный ответ для этого набора ветвей. Ответ о паре не устанавливает отношение тройки; общая ветвь может быть только у части отростков.','Record an independent answer for this set of branches. A pair answer does not establish the triple relationship; only a subset may share a parent.')
    );
  }

  if(question.kind==='compartment_cut'){
    const cutId=content.primaryBookmarks.find(bookmark=>bookmark.role==='cut')?.branchId??questionId.match(/\.cut(.+)$/)?.[1];
    const children=content.retainedChildIds.join(' / ');
    const parent=content.primaryBookmarks.find(bookmark=>bookmark.role==='parent')?.branchId;
    const optional=content.optionalFieldIds.map(key=>/^child_(.+)_(?:compartment|attachment)$/.exec(key)?.[1]).filter(Boolean);
    const siblings=[...new Set(optional)].join(' / ');
    if(children)return guidance(
      text(`Проверьте фактическое соединение дочерней ветви ${children} с родительским участком у узла ${cutId}. Отдельно запишите прикрепление этой ветви и её компартмент.`,`Inspect the actual connection of child branch ${children} to the parent interval at node ${cutId}. Record this child's attachment and compartment separately.`),
      text(`Проследите внешние мембраны родительского участка${parent?` ${parent}`:''}, узла ${cutId} и ветви ${children} по последовательным ЭМ-срезам; также запишите локальный компартмент узла.`,`Follow the outer membranes of the parent interval${parent?` ${parent}`:''}, node ${cutId} and child ${children} through serial EM sections; also record the node's local compartment.`),
      text(`Другие дочерние ветви${siblings?` (${siblings})`:''} находятся в дополнительном контексте и имеют отдельные ответы; они не заменяют проверку ветви ${children}.`,`Other children${siblings?` (${siblings})`:''} are optional context with separate answers; they do not replace the inspection of child ${children}.`),
      coverage
    );
    return guidance(
      text(`Дополнительная проверка: определите локальный компартмент в месте разветвления у узла ${cutId} и запишите наблюдение. Для каждой дополнительно проверяемой дочерней ветви отдельно укажите прикрепление и компартмент.`,`Optional inspection: determine the local compartment at branchpoint node ${cutId} and record the observation. For each additionally inspected child, record attachment and compartment separately.`),
      text('Сопоставьте внешние мембраны родительского и дочерних профилей по последовательным срезам; не выводите прикрепление только из исходного графа.','Compare the outer membranes of the parent and child profiles through serial sections; do not infer attachment from the source graph alone.'),
      text('В текущей выборке нет сохранённых контактов в дочерних путях этого узла; проверка остаётся дополнительным контекстом и не меняет исходные исключения.','The current pool has no retained contacts in this node\'s child paths; the inspection remains optional context and does not change the original exclusions.'),
      coverage
    );
  }
  throw new Error('No guided instruction for canonical review question: '+questionId);
}
