// Ukrainian localization dictionary
export const uk = {
  // Tabs
  tabs: {
    home: 'Головна',
    runs: 'Програми / Тренування',
    session: 'План сесії',
    log: 'Завершити / Логування',
    history: 'Історія',
    data: 'Дані',
  },

  // Run status
  status: {
    active: 'Активне',
    paused: 'На паузі',
    completed: 'Завершено',
    archived: 'Архівовано',
  },

  // General UI
  ui: {
    paused: 'На паузі',
    mixed: 'Змішана',
    select: 'Вибрати',
    start: 'Розпочати',
    pause: 'Пауза',
    resume: 'Продовжити',
    switch: 'Перейти',
    restart: 'Перезапустити',
    complete: 'Завершити',
    archive: 'Архівувати',
    delete: 'Видалити',
    edit: 'Редагувати',
    save: 'Зберегти',
    cancel: 'Скасувати',
    export: 'Експортувати',
    import: 'Імпортувати',
    load: 'Завантажити',
    reset: 'Скидання',
    close: 'Закрити',
    next: 'Далі',
    previous: 'Попередня',
    yes: 'Так',
    no: 'Ні',
  },

  // Exercise terminology
  exercise: {
    sets: 'підходи',
    set: 'підхід',
    reps: 'повторення',
    rep: 'повторення',
    weight: 'вага',
    exercise: 'вправа',
    exercises: 'вправи',
    progression: 'прогресія',
    maxValue: 'макс. значення',
    rest: 'відпочинок',
    baseConfig: 'базова конфігурація',
    plannedWeight: 'планова вага',
    reference: 'посилання',
  },

  // Program management
  program: {
    name: 'Назва програми',
    mode: 'Режим',
    track: 'Напрямок',
    focusTarget: 'Цільова група',
    sessions: 'Сесії',
    template: 'Шаблон',
    templates: 'Шаблони',
    startRun: 'Розпочати тренування',
    createRun: 'Створити тренування',
    deleteProgram: 'Видалити програму',
    deleteConfirm: (name: string) => `Видалити програму "${name}"? Це не можна буде скасувати.`,
    importedFrom: 'Імпортовано з',
  },

  // Session and logging
  session: {
    sessionPlan: 'План сесії',
    completedSession: 'Завершено',
    successful: 'Успішно',
    unsuccessfully: 'Невдало',
    sessionNote: 'Примітка сесії',
    exerciseLog: 'Логування вправи',
    actualWeight: 'Фактична вага',
    difficulty: 'Складність',
    skipped: 'Пропущено',
    note: 'Примітка',
    nextSession: 'Наступна сесія',
    finishSession: 'Завершити сесію',
    logingSession: 'Логування сесії',
  },

  // Progression
  progression: {
    rule: 'Правило прогресії',
    progressionRule: 'Правило прогресії',
    noProgression: 'Немає прогресії',
    nextIncrease: (frequency: number) => `Наступне збільшення через ${frequency} сесію(й)`,
    successfulSessions: 'успішних сесій',
    completedSessions: 'завершених сесій',
    every: 'кожні',
    sessions: 'сесії',
  },

  // Data management
  data: {
    dataManagement: 'Управління даними',
    exportState: 'Експортувати стан',
    importState: 'Імпортувати стан',
    resetAllData: 'Скидання всіх даних',
    resetConfirm: 'Це видалить всі тренування та логи та завантажить шаблони з насіння. Продовжити?',
    csvImport: 'Імпорт CSV програми',
    loadFile: 'Завантажити файл',
    selectFile: 'Виберіть CSV файл',
    chooseFile: 'Вибрати файл...',
    importCsvTemplate: 'Імпортувати CSV як шаблон',
    loadedFile: (name: string) => `Завантажений файл: ${name}`,
    exportGenerated: 'Експорт згенерований нижче.',
    importFailed: 'Імпорт не вдався: недійсний JSON.',
    importSuccess: 'Стан успішно імпортований.',
    importedWith: (name: string, count: number) => `Імпортовано "${name}" з ${count} вправами.`,
    replaceSeed: 'Замінити шаблони з насіння',
    resetData: 'Скидання всіх даних',
    selectCSV: 'Спочатку виберіть файл CSV.',
    stateReset: 'Стан скидано до шаблонів насіння.',
    deletedProgram: (name: string) => `Видалена програма "${name}".`,
  },

  // KPIs
  kpi: {
    currentMode: 'Поточний режим',
    activeRuns: 'Активні тренування',
    lastCompleted: 'Останнім часом завершено',
    totalRuns: 'Всього тренувань',
    completedSessions: 'Завершених сесій',
    successfulSessions: 'Успішних сесій',
  },

  // Messages and hints
  messages: {
    noActiveRun: 'Немає активного тренування. Розпочніть з Програм / Тренувань.',
    noSession: 'Немає сесії для планування.',
    noExercises: 'Немає вправ в цій сесії.',
    noRuns: 'Немає тренувань в цьому статусі.',
    noTemplates: 'Немає шаблонів у цьому режимі.',
    readFailure: 'Помилка при читанні файлу CSV.',
    pauseReason: 'Причина паузи',
  },

  // History
  history: {
    workoutHistory: 'Історія тренувань',
    allLogs: 'Всі логи',
    noLogs: 'Без логів.',
  },

  // Modes
  modes: {
    main: 'Основна',
    travel: 'Подорожі',
    maintenance: 'Обслуговування',
    backup: 'Резервна',
  },

  // Tracks
  tracks: {
    upper: 'Верхня частина',
    lower: 'Нижня частина',
    custom: 'Користувацька',
  },

  // Difficulty levels
  difficulty: {
    easy: 'Легко',
    moderate: 'Помірно',
    hard: 'Важко',
  },
}

type DictValue = string | ((param: unknown) => string)

function getValue(obj: unknown, keys: string[]): DictValue | undefined {
  let current = obj
  for (const key of keys) {
    if (typeof current === 'object' && current !== null) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return current as DictValue
}

export function t(keyPath: string, param?: unknown): string {
  const keys = keyPath.split('.')
  const value = getValue(uk, keys)

  if (typeof value === 'function') {
    return value(param)
  }

  if (typeof value === 'string') {
    return value
  }

  return keyPath
}

export default uk
