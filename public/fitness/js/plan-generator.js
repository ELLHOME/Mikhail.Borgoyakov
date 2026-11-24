/**
 * Personalized Workout Plan Generator
 * Converts body & posture CV findings (+ optional Vision AI output) + user profile
 * into a structured multi-day workout program with explicit per-exercise rationale.
 */

import { EXERCISES, EXERCISE_MAP } from './exercises-db.js?v=20261124-6';

export const GOAL_LABELS = {
  recomp: 'Рельеф и жиросжигание',
  muscle: 'Набор мышечной массы',
  posture: 'Исправление осанки и тонус',
  strength: 'Сила и атлетизм',
};

export const EQUIPMENT_LABELS = {
  home_bodyweight: 'Дома без инвентаря',
  home_dumbbells: 'Дома с гантелями',
  gym: 'Тренажёрный зал',
};

export const LEVEL_LABELS = {
  beginner: 'Новичок',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
};

function tunePrescription(ex, goal, level) {
  let sets = ex.defaultSets;
  let reps = ex.defaultReps;
  let restSec = ex.defaultRestSec;
  let holdSeconds = ex.holdSeconds || 40;

  // Level tuning
  if (level === 'beginner') {
    sets = Math.max(2, sets - (sets >= 4 ? 1 : 0));
    restSec = Math.min(110, restSec + 10);
    if (ex.isTimed) holdSeconds = Math.max(25, holdSeconds - 10);
  } else if (level === 'advanced') {
    sets = Math.min(5, sets + (ex.block === 'main' ? 1 : 0));
    if (ex.isTimed) holdSeconds = Math.min(75, holdSeconds + 15);
  }

  // Goal tuning (only for non-timed main strength moves)
  if (!ex.isTimed && ex.block === 'main') {
    if (goal === 'strength') {
      reps = ex.equipment.includes('gym') && !ex.equipment.includes('home_bodyweight') ? '6–8 повт.' : '8–10 повт.';
      restSec = Math.max(restSec, 90);
    } else if (goal === 'muscle') {
      reps = '8–12 повт.';
      restSec = Math.max(60, Math.min(90, restSec));
    } else if (goal === 'recomp') {
      reps = '12–15 повт.';
      restSec = Math.max(40, restSec - 15);
    } else if (goal === 'posture') {
      reps = '12–15 повт. (подконтрольно)';
      restSec = Math.max(40, Math.min(60, restSec));
    }
  } else if (ex.isTimed) {
    reps = ex.defaultReps.includes('сторона') ? `${holdSeconds} сек / сторона` : `${holdSeconds} сек`;
  }

  return { sets, reps, restSec, holdSeconds };
}

function buildReasonText(ex, metrics, aiRecSet) {
  const tags = metrics.focusTags || [];
  if (aiRecSet.has(ex.id)) {
    return `AI-приоритет • ${ex.whyTemplate}`;
  }
  if (ex.postureTags.includes('forward_head') && tags.includes('forward_head')) {
    return `По фото: выдвинутая голова (${metrics.forwardHeadDeg ?? ''}°) • ${ex.whyTemplate}`;
  }
  if (ex.postureTags.includes('rounded_shoulders') && tags.includes('rounded_shoulders')) {
    return `По фото: коррекция сутулости • ${ex.whyTemplate}`;
  }
  if (ex.postureTags.includes('asymmetry') && tags.includes('asymmetry')) {
    return `По фото: выравнивание симметрии • ${ex.whyTemplate}`;
  }
  if (ex.postureTags.includes('anterior_pelvic_tilt') && tags.includes('anterior_pelvic_tilt')) {
    return `По фото: контроль наклона таза • ${ex.whyTemplate}`;
  }
  if (ex.postureTags.includes('v_taper_boost') && tags.includes('v_taper_boost')) {
    return `По фото: акцент на V-силуэт • ${ex.whyTemplate}`;
  }
  return ex.whyTemplate;
}

function matchesSlot(ex, slot) {
  if (slot === 'biceps') return ex.category === 'arms' && ex.muscles.includes('biceps');
  if (slot === 'triceps') return ex.category === 'arms' && ex.muscles.includes('triceps');
  if (slot === 'posture_upper') {
    return ex.category === 'posture' && (ex.postureTags.includes('rounded_shoulders') || ex.postureTags.includes('forward_head'));
  }
  if (slot === 'posture_lower') {
    return ex.category === 'posture' && (ex.postureTags.includes('anterior_pelvic_tilt') || ex.postureTags.includes('asymmetry'));
  }
  return ex.category === slot;
}

function scoreExerciseForSlot(ex, slotSpec, focusTags, goal, equipment, aiRecSet, weekUseCount, prevDayIds) {
  let score = 0;
  const primary = typeof slotSpec === 'string' ? slotSpec : slotSpec.primary;
  const fallbacks = typeof slotSpec === 'string' ? [] : slotSpec.fallbacks || [];

  if (matchesSlot(ex, primary)) {
    score += 130;
  } else {
    const fbIdx = fallbacks.findIndex((fb) => matchesSlot(ex, fb));
    if (fbIdx >= 0) {
      score += Math.max(45, 78 - fbIdx * 16);
    } else if (primary === 'biceps' && ex.muscles.includes('biceps')) {
      score += 36;
    } else if (primary === 'triceps' && ex.muscles.includes('triceps')) {
      score += 36;
    }
  }

  // Posture tags guide WHICH exercise wins inside its slot without overriding arms/muscle slots
  let postureBonus = 0;
  for (const tag of focusTags) {
    if (ex.postureTags.includes(tag)) postureBonus += 10;
  }
  score += Math.min(22, postureBonus);

  if (ex.goalTags.includes(goal)) score += 10;
  if (aiRecSet.has(ex.id)) score += 20;

  // Prefer signature gym machines/barbells in gym mode, and dumbbell moves over bodyweight in dumbbell mode
  if (equipment === 'gym' && ex.equipment.length === 1 && ex.equipment[0] === 'gym') {
    score += 24;
  } else if (equipment !== 'home_bodyweight' && !ex.equipment.includes('home_bodyweight')) {
    score += 16;
  }

  // Strong frequency-based anti-duplication so no two workout days repeat the same lineup
  const uses = weekUseCount.get(ex.id) || 0;
  if (uses > 0) {
    const stepPenalty = ex.block === 'corrective' ? 85 : ex.block === 'core' || ex.block === 'warmup' ? 95 : 120;
    score -= uses * stepPenalty;
  }
  if (prevDayIds.has(ex.id)) {
    score -= ex.block === 'corrective' ? 32 : 48;
  }
  return score;
}

function pickExercisesBySlots(pool, slotSpecs, focusTags, goal, equipment, aiRecSet, dayUsedIds, weekUseCount, prevDayIds) {
  const picked = [];
  for (const slotSpec of slotSpecs) {
    const candidates = pool
      .filter((ex) => !dayUsedIds.has(ex.id))
      .map((ex) => ({
        ex,
        score: scoreExerciseForSlot(ex, slotSpec, focusTags, goal, equipment, aiRecSet, weekUseCount, prevDayIds),
      }))
      .sort((a, b) => b.score - a.score);

    if (!candidates.length) break;
    const chosen = candidates[0].ex;
    picked.push(chosen);
    dayUsedIds.add(chosen.id);
    weekUseCount.set(chosen.id, (weekUseCount.get(chosen.id) || 0) + 1);
  }
  return picked;
}

function buildSplitTemplates(daysPerWeek, goal) {
  const finishSlot = goal === 'recomp' ? { primary: 'cardio', fallbacks: ['core'] } : { primary: 'core', fallbacks: ['cardio'] };

  if (daysPerWeek <= 3) {
    return [
      {
        dayIndex: 1,
        title: 'День 1 • Спина, бицепс и осанка',
        focus: 'Тяги для широкой спины, рельеф бицепса и раскрытие плеч',
        correctiveSlots: [
          { primary: 'posture_upper', fallbacks: ['posture'] },
          { primary: 'posture', fallbacks: ['posture_upper'] },
        ],
        mainSlots: [
          { primary: 'back', fallbacks: ['shoulders', 'core'] },
          { primary: 'back', fallbacks: ['shoulders', 'core'] },
          { primary: 'biceps', fallbacks: ['arms', 'back'] },
          { primary: 'shoulders', fallbacks: ['biceps', 'back'] },
        ],
        coreSlots: [{ primary: 'core', fallbacks: ['cardio'] }, finishSlot],
      },
      {
        dayIndex: 2,
        title: 'День 2 • Ноги, ягодицы и контроль таза',
        focus: 'Сильные ноги, ягодичные, задняя цепь и стабильный кор',
        correctiveSlots: [
          { primary: 'posture_lower', fallbacks: ['posture'] },
          { primary: 'posture', fallbacks: ['posture_lower'] },
        ],
        mainSlots: [
          { primary: 'legs', fallbacks: ['core'] },
          { primary: 'legs', fallbacks: ['core'] },
          { primary: 'legs', fallbacks: ['core'] },
          { primary: 'legs', fallbacks: ['core'] },
        ],
        coreSlots: [{ primary: 'core', fallbacks: ['cardio'] }, finishSlot],
      },
      {
        dayIndex: 3,
        title: 'День 3 • Грудь, плечи и трицепс',
        focus: 'Атлетичный верх тела, трицепс и симметричный рельеф рук',
        correctiveSlots: [
          { primary: 'posture_upper', fallbacks: ['posture'] },
          { primary: 'posture_lower', fallbacks: ['posture'] },
        ],
        mainSlots: [
          { primary: 'chest', fallbacks: ['shoulders', 'triceps'] },
          { primary: 'shoulders', fallbacks: ['triceps', 'chest'] },
          { primary: 'triceps', fallbacks: ['arms', 'chest'] },
          { primary: 'biceps', fallbacks: ['triceps', 'shoulders'] },
        ],
        coreSlots: [finishSlot, { primary: 'core', fallbacks: ['cardio'] }],
      },
    ];
  }

  if (daysPerWeek === 4) {
    return [
      {
        dayIndex: 1,
        title: 'День 1 • Спина и бицепс (Тяги + Осанка)',
        focus: 'Укрепление верха и ширины спины, прицельная работа на бицепс',
        correctiveSlots: [
          { primary: 'posture_upper', fallbacks: ['posture'] },
          { primary: 'posture', fallbacks: ['posture_upper'] },
        ],
        mainSlots: [
          { primary: 'back', fallbacks: ['biceps', 'shoulders'] },
          { primary: 'back', fallbacks: ['shoulders', 'biceps'] },
          { primary: 'biceps', fallbacks: ['arms', 'back'] },
          { primary: 'biceps', fallbacks: ['shoulders', 'back'] },
        ],
        coreSlots: [{ primary: 'core', fallbacks: ['cardio'] }],
      },
      {
        dayIndex: 2,
        title: 'День 2 • Ноги, ягодицы и стабилизация таза',
        focus: 'Квадрицепсы, задняя поверхность бедра, ягодицы и глубокий кор',
        correctiveSlots: [
          { primary: 'posture_lower', fallbacks: ['posture'] },
          { primary: 'posture', fallbacks: ['posture_lower'] },
        ],
        mainSlots: [
          { primary: 'legs', fallbacks: ['core'] },
          { primary: 'legs', fallbacks: ['core'] },
          { primary: 'legs', fallbacks: ['core'] },
          { primary: 'legs', fallbacks: ['core'] },
        ],
        coreSlots: [{ primary: 'core', fallbacks: ['cardio'] }, finishSlot],
      },
      {
        dayIndex: 3,
        title: 'День 3 • Грудь, плечи и трицепс (Жимы)',
        focus: 'Сильный верх корпуса, V-силуэт и прицельная нагрузка на трицепс',
        correctiveSlots: [
          { primary: 'posture_upper', fallbacks: ['posture'] },
          { primary: 'posture', fallbacks: ['posture_upper'] },
        ],
        mainSlots: [
          { primary: 'chest', fallbacks: ['shoulders', 'triceps'] },
          { primary: 'shoulders', fallbacks: ['chest', 'triceps'] },
          { primary: 'triceps', fallbacks: ['arms', 'chest'] },
          { primary: 'triceps', fallbacks: ['shoulders', 'chest'] },
        ],
        coreSlots: [{ primary: 'core', fallbacks: ['cardio'] }],
      },
      {
        dayIndex: 4,
        title: 'День 4 • Руки (бицепс + трицепс), плечи и рельеф',
        focus: 'Изолированный акцент на бицепс, трицепс, дельты и жиросжигающий финиш',
        correctiveSlots: [
          { primary: 'posture_lower', fallbacks: ['posture'] },
          { primary: 'posture_upper', fallbacks: ['posture'] },
        ],
        mainSlots: [
          { primary: 'shoulders', fallbacks: ['chest', 'back'] },
          { primary: 'biceps', fallbacks: ['arms', 'back'] },
          { primary: 'triceps', fallbacks: ['arms', 'chest'] },
          { primary: 'chest', fallbacks: ['back', 'shoulders'] },
        ],
        coreSlots: [
          { primary: 'cardio', fallbacks: ['core'] },
          { primary: 'core', fallbacks: ['cardio'] },
        ],
      },
    ];
  }

  return [
    {
      dayIndex: 1,
      title: 'День 1 • Спина и здоровая осанка',
      focus: 'Тяги, широчайшие, ромбовидные и раскрытие плеч',
      correctiveSlots: [
        { primary: 'posture_upper', fallbacks: ['posture'] },
        { primary: 'posture', fallbacks: ['posture_upper'] },
      ],
      mainSlots: [
        { primary: 'back', fallbacks: ['shoulders'] },
        { primary: 'back', fallbacks: ['biceps'] },
        { primary: 'back', fallbacks: ['shoulders', 'biceps'] },
        { primary: 'biceps', fallbacks: ['arms', 'back'] },
      ],
      coreSlots: [{ primary: 'core', fallbacks: ['cardio'] }],
    },
    {
      dayIndex: 2,
      title: 'День 2 • Ноги и ягодицы',
      focus: 'Квадрицепсы, ягодичные и задняя поверхность бедра',
      correctiveSlots: [
        { primary: 'posture_lower', fallbacks: ['posture'] },
        { primary: 'posture', fallbacks: ['posture_lower'] },
      ],
      mainSlots: [
        { primary: 'legs', fallbacks: ['core'] },
        { primary: 'legs', fallbacks: ['core'] },
        { primary: 'legs', fallbacks: ['core'] },
        { primary: 'legs', fallbacks: ['core'] },
      ],
      coreSlots: [{ primary: 'core', fallbacks: ['cardio'] }],
    },
    {
      dayIndex: 3,
      title: 'День 3 • Грудь и трицепс',
      focus: 'Жимы, грудные мышцы и объём трицепса',
      correctiveSlots: [
        { primary: 'posture_upper', fallbacks: ['posture'] },
        { primary: 'posture', fallbacks: ['posture_upper'] },
      ],
      mainSlots: [
        { primary: 'chest', fallbacks: ['shoulders'] },
        { primary: 'chest', fallbacks: ['triceps'] },
        { primary: 'triceps', fallbacks: ['arms', 'chest'] },
        { primary: 'triceps', fallbacks: ['shoulders', 'chest'] },
      ],
      coreSlots: [{ primary: 'core', fallbacks: ['cardio'] }],
    },
    {
      dayIndex: 4,
      title: 'День 4 • Плечи, кор и кардио-тонус',
      focus: 'Ширина плеч, глубокий кор, симметрия и выносливость',
      correctiveSlots: [
        { primary: 'posture_lower', fallbacks: ['posture'] },
        { primary: 'posture_upper', fallbacks: ['posture'] },
      ],
      mainSlots: [
        { primary: 'shoulders', fallbacks: ['back', 'chest'] },
        { primary: 'shoulders', fallbacks: ['back', 'triceps'] },
        { primary: 'back', fallbacks: ['chest', 'biceps'] },
      ],
      coreSlots: [
        { primary: 'cardio', fallbacks: ['core'] },
        { primary: 'core', fallbacks: ['cardio'] },
      ],
    },
    {
      dayIndex: 5,
      title: 'День 5 • Руки (бицепс + трицепс) и рельеф',
      focus: 'Специализация на бицепс и трицепс плюс тонус нижней цепи',
      correctiveSlots: [
        { primary: 'posture_upper', fallbacks: ['posture'] },
        { primary: 'posture_lower', fallbacks: ['posture'] },
      ],
      mainSlots: [
        { primary: 'biceps', fallbacks: ['arms', 'back'] },
        { primary: 'triceps', fallbacks: ['arms', 'chest'] },
        { primary: 'biceps', fallbacks: ['shoulders', 'back'] },
        { primary: 'legs', fallbacks: ['triceps', 'chest'] },
      ],
      coreSlots: [finishSlot, { primary: 'core', fallbacks: ['cardio'] }],
    },
  ];
}

export function buildNutritionGuidance(profile = {}, metrics = {}, aiAnalysis = null) {
  const safeMetrics = metrics || {};
  const w = Number(profile.weightKg) || 75;
  const h = Number(profile.heightCm) || 175;
  const age = Number(profile.age) || 28;
  const isFemale = profile.sex === 'female';
  // Mifflin-St Jeor estimate
  const bmr = Math.round(10 * w + 6.25 * h - 5 * age + (isFemale ? -161 : 5));
  const activity = profile.daysPerWeek >= 5 ? 1.55 : profile.daysPerWeek === 4 ? 1.48 : 1.4;
  const tdee = Math.round(bmr * activity);

  let targetKcal = tdee;
  let kcalNote = 'Поддержание веса и рекомпозиция';
  let proteinPerKg = 1.8;
  let fatPerKg = 0.9;

  if (profile.goal === 'recomp') {
    targetKcal = Math.round(tdee * (safeMetrics.bmi && safeMetrics.bmi >= 25.5 ? 0.84 : 0.90));
    kcalNote = 'Мягкий дефицит 10–15% для рельефа без потери мышц';
    proteinPerKg = 1.9;
    fatPerKg = 0.85;
  } else if (profile.goal === 'muscle') {
    targetKcal = Math.round(tdee * 1.11);
    kcalNote = 'Лёгкий профицит +10% для качественного роста мышц';
    proteinPerKg = 2.0;
    fatPerKg = 0.95;
  } else if (profile.goal === 'strength') {
    targetKcal = Math.round(tdee * 1.05);
    kcalNote = 'Небольшой профицит для восстановления ЦНС и силы';
    proteinPerKg = 1.9;
    fatPerKg = 0.95;
  } else {
    targetKcal = tdee;
    kcalNote = 'Сбалансированный рацион для энергии и тонуса';
    proteinPerKg = 1.6;
    fatPerKg = 0.9;
  }

  const proteinGrams = Math.round(w * proteinPerKg);
  const fatGrams = Math.max(42, Math.round(w * fatPerKg));
  const remainingKcal = Math.max(240, targetKcal - proteinGrams * 4 - fatGrams * 9);
  const carbsGrams = Math.round(remainingKcal / 4);
  const fiberGrams = Math.max(24, Math.round((targetKcal / 1000) * 14));
  const waterMl = Math.round((w * 33) / 50) * 50;

  return {
    targetKcal,
    kcalNote,
    proteinGrams,
    fatGrams,
    carbsGrams,
    fiberGrams,
    waterMl,
    waterLiters: Number((waterMl / 1000).toFixed(1)),
    stepsTarget: profile.goal === 'recomp' ? '9 000–11 000 шагов/день' : '7 500–9 000 шагов/день',
    aiHint: aiAnalysis?.nutritionHint || null,
  };
}

function getPoolForSlot(basePool, extraCorePool, slotSpec) {
  const wanted = typeof slotSpec === 'string'
    ? [slotSpec]
    : [slotSpec.primary, ...(slotSpec.fallbacks || [])];
  if (wanted.includes('core') || wanted.includes('cardio')) {
    return [...basePool, ...extraCorePool];
  }
  return basePool;
}

/**
 * Generate full weekly workout plan object.
 */
export function generateWorkoutPlan(metrics, profile, aiAnalysis = null) {
  const equipment = profile.equipment || 'home_bodyweight';
  const goal = profile.goal || 'recomp';
  const level = profile.level || 'beginner';
  const daysPerWeek = Number(profile.daysPerWeek) || 3;
  const focusTags = metrics?.focusTags || [];
  const aiRecSet = new Set(Array.isArray(aiAnalysis?.recommendedExerciseIds) ? aiAnalysis.recommendedExerciseIds : []);

  const compatible = EXERCISES.filter((ex) => ex.equipment.includes(equipment));
  const correctivePool = compatible.filter((ex) => ex.block === 'corrective' || ex.category === 'posture');
  const mainPool = compatible.filter((ex) => ex.block === 'main');
  const corePool = compatible.filter((ex) => ex.block === 'core' || ex.block === 'warmup' || ex.category === 'cardio');

  const templates = buildSplitTemplates(daysPerWeek, goal);
  const weekUseCount = new Map();
  let prevDayIds = new Set();

  const days = templates.map((tpl) => {
    const dayUsedIds = new Set();
    const isBodyweight = equipment === 'home_bodyweight';
    const hasPostureFocus = focusTags.some((t) =>
      ['forward_head', 'rounded_shoulders', 'anterior_pelvic_tilt', 'asymmetry'].includes(t)
    );
    const correctiveCount = hasPostureFocus && !(isBodyweight && daysPerWeek >= 4) ? 2 : 1;
    const mainCount = level === 'beginner' || isBodyweight
      ? Math.min(3, tpl.mainSlots.length)
      : tpl.mainSlots.length;
    const coreCount = goal === 'recomp' || (isBodyweight && daysPerWeek >= 4)
      ? Math.min(2, tpl.coreSlots.length)
      : 1;

    const pickedCorrective = pickExercisesBySlots(
      correctivePool,
      tpl.correctiveSlots.slice(0, correctiveCount),
      focusTags,
      goal,
      equipment,
      aiRecSet,
      dayUsedIds,
      weekUseCount,
      prevDayIds
    );

    const pickedMain = [];
    for (const slotSpec of tpl.mainSlots.slice(0, mainCount)) {
      const slotPool = getPoolForSlot(mainPool, corePool, slotSpec);
      const chosenList = pickExercisesBySlots(
        slotPool,
        [slotSpec],
        focusTags,
        goal,
        equipment,
        aiRecSet,
        dayUsedIds,
        weekUseCount,
        prevDayIds
      );
      if (chosenList.length) pickedMain.push(chosenList[0]);
    }

    const pickedCore = pickExercisesBySlots(
      corePool,
      tpl.coreSlots.slice(0, coreCount),
      focusTags,
      goal,
      equipment,
      aiRecSet,
      dayUsedIds,
      weekUseCount,
      prevDayIds
    );

    prevDayIds = new Set(dayUsedIds);

    const ordered = [
      ...pickedCorrective.map((ex) => ({ ex, section: 'Разминка и осанка' })),
      ...pickedMain.map((ex) => ({ ex, section: 'Основной блок' })),
      ...pickedCore.map((ex) => ({ ex, section: 'Кор и финиш' })),
    ];

    const items = ordered.map(({ ex, section }) => {
      const rx = tunePrescription(ex, goal, level);
      return {
        exerciseId: ex.id,
        section,
        sets: rx.sets,
        reps: rx.reps,
        restSec: rx.restSec,
        holdSeconds: rx.holdSeconds,
        reason: buildReasonText(ex, metrics || {}, aiRecSet),
      };
    });

    const totalSets = items.reduce((acc, it) => acc + it.sets, 0);
    const estMinutes = Math.round(6 + totalSets * 1.9);
    const estKcal = Math.round(estMinutes * (goal === 'recomp' ? 7.6 : 6.4));

    return {
      dayIndex: tpl.dayIndex,
      title: tpl.title,
      focus: tpl.focus,
      estMinutes,
      estKcal,
      totalSets,
      items,
    };
  });

  const focusSummary = [];
  if (focusTags.includes('forward_head')) focusSummary.push('Выравнивание шеи и головы');
  if (focusTags.includes('rounded_shoulders')) focusSummary.push('Раскрытие грудного отдела и верх спины');
  if (focusTags.includes('asymmetry')) focusSummary.push('Унилатеральный баланс сторон');
  if (focusTags.includes('anterior_pelvic_tilt')) focusSummary.push('Стабилизация таза и глубокий кор');
  if (focusTags.includes('v_taper_boost')) focusSummary.push('Акцент на плечи и V-силуэт');
  if (!focusSummary.length) focusSummary.push('Гармоничное развитие всех мышечных групп');

  // If Vision AI returned a valid structured multi-day custom plan using our catalog IDs, prioritize it!
  let finalDays = days;
  let generatedByAi = false;
  if (Array.isArray(aiAnalysis?.customPlanDays) && aiAnalysis.customPlanDays.length >= 2) {
    const validatedDays = aiAnalysis.customPlanDays
      .map((d, idx) => {
        const validItems = (Array.isArray(d.items) ? d.items : [])
          .filter((it) => EXERCISE_MAP[it.exerciseId])
          .map((it) => {
            const ex = EXERCISE_MAP[it.exerciseId];
            return {
              exerciseId: ex.id,
              section: it.section || (ex.block === 'corrective' ? 'Разминка и осанка' : ex.block === 'core' ? 'Кор и финиш' : 'Основной блок'),
              sets: Math.max(2, Math.min(5, Number(it.sets) || ex.defaultSets)),
              reps: String(it.reps || ex.defaultReps),
              restSec: Math.max(20, Math.min(150, Number(it.restSec) || ex.defaultRestSec)),
              holdSeconds: ex.holdSeconds || 40,
              reason: it.reason ? `AI Vision • ${it.reason}` : `AI Vision • ${ex.whyTemplate}`,
            };
          });
        if (validItems.length < 3) return null;
        const totalSets = validItems.reduce((acc, it) => acc + it.sets, 0);
        const estMinutes = Math.round(6 + totalSets * 1.9);
        const estKcal = Math.round(estMinutes * (goal === 'recomp' ? 7.6 : 6.4));
        return {
          dayIndex: Number(d.dayIndex) || idx + 1,
          title: d.title || `День ${idx + 1} • Персональная тренировка AI`,
          focus: d.focus || 'Составлено нейросетью по результатам разбора фото',
          estMinutes,
          estKcal,
          totalSets,
          items: validItems,
        };
      })
      .filter(Boolean);

    if (validatedDays.length >= 2) {
      finalDays = validatedDays;
      generatedByAi = true;
    }
  }

  return {
    id: `plan_${Date.now()}`,
    createdAt: new Date().toISOString(),
    generatedByAi,
    aiProviderLabel: generatedByAi ? `${(aiAnalysis?.provider || 'AI').toUpperCase()} ${aiAnalysis?.model || ''}`.trim() : null,
    goal,
    goalLabel: GOAL_LABELS[goal] || goal,
    equipment,
    equipmentLabel: EQUIPMENT_LABELS[equipment] || equipment,
    level,
    levelLabel: LEVEL_LABELS[level] || level,
    daysPerWeek: finalDays.length,
    focusSummary,
    nutrition: buildNutritionGuidance(profile, metrics || {}, aiAnalysis),
    days: finalDays,
  };
}

/**
 * Return compatible replacement exercises for swapping in the UI.
 */
export function getAlternativeExercises(currentExerciseId, equipment) {
  const current = EXERCISE_MAP[currentExerciseId];
  if (!current) return [];
  const candidates = EXERCISES.filter(
    (ex) =>
      ex.id !== currentExerciseId &&
      ex.equipment.includes(equipment) &&
      (ex.category === current.category || ex.block === current.block)
  );
  const currentPrimaryMuscle = current.muscles?.[0];
  return candidates
    .sort((a, b) => {
      const aScore =
        (a.category === current.category ? 10 : 0) +
        (currentPrimaryMuscle && a.muscles.includes(currentPrimaryMuscle) ? 20 : 0);
      const bScore =
        (b.category === current.category ? 10 : 0) +
        (currentPrimaryMuscle && b.muscles.includes(currentPrimaryMuscle) ? 20 : 0);
      return bScore - aScore;
    })
    .slice(0, 6);
}
