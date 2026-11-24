/**
 * Personalized Workout Plan Generator
 * Converts body & posture CV findings (+ optional Vision AI output) + user profile
 * into a structured multi-day workout program with explicit per-exercise rationale.
 */

import { EXERCISES, EXERCISE_MAP } from './exercises-db.js?v=20261124-13';

export const GOAL_LABELS = {
  recomp: 'Рельеф и жиросжигание',
  muscle: 'Набор мышечной массы',
  posture: 'Исправление осанки и тонус',
  strength: 'Сила и атлетизм',
};

export const EQUIPMENT_LABELS = {
  home_bodyweight: 'Дома без инвентаря',
  home_dumbbells: 'Дома с гантелями',
  home_trx: 'Дома с петлями TRX',
  gym: 'Тренажёрный зал',
};

/**
 * An AI-built plan is only valid for the equipment and week length it was requested for.
 */
export function aiPlanMatchesProfile(aiAnalysis, profile = {}) {
  const params = aiAnalysis?.planParams;
  if (!params) return false;
  return (
    params.equipment === (profile.equipment || 'home_bodyweight') &&
    Number(params.daysPerWeek) === (Number(profile.daysPerWeek) || 3)
  );
}

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

const WEAK_SPOT_TAGS = ['forward_head', 'rounded_shoulders', 'anterior_pelvic_tilt', 'asymmetry', 'v_taper_boost'];
const MAX_CYCLE_WEEKS = 4;
export const PLAN_VERSION = 2;

// Bodyweight leg patterns that are normally loaded with dumbbells or a barbell.
const LOADABLE_BODYWEIGHT = {
  home_dumbbells: ['reverse_lunges', 'glute_bridge'],
  gym: ['reverse_lunges', 'glute_bridge'],
};

const GROUP_LABELS = {
  back: 'Спина',
  chest: 'Грудь',
  shoulders: 'Плечи',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  legs: 'Ноги и ягодицы',
  core: 'Кор',
  cardio: 'Кардио',
};

const GROUP_FOCUS = {
  back: 'тяги для ширины и толщины спины',
  chest: 'жимы для грудных мышц',
  shoulders: 'дельты и ширина плеч',
  biceps: 'бицепс',
  triceps: 'трицепс',
  legs: 'квадрицепсы, ягодицы и задняя поверхность бедра',
  core: 'пресс и глубокий кор',
  cardio: 'жиросжигающие интервалы',
};

// Used only when a day already holds every exercise of the slot's own group.
const GROUP_FALLBACKS = {
  back: ['shoulders', 'biceps'],
  biceps: ['back', 'triceps'],
  shoulders: ['back', 'chest'],
  chest: ['shoulders', 'triceps'],
  triceps: ['chest', 'shoulders'],
  legs: [],
  core: ['cardio'],
  cardio: ['core'],
};

export function exerciseRole(ex) {
  if (ex.block === 'main') return 'main';
  if (ex.block === 'corrective' || ex.category === 'posture') return 'corrective';
  return 'core';
}

export function exerciseGroup(ex) {
  if (ex.category === 'arms') return ex.muscles[0] === 'biceps' ? 'biceps' : 'triceps';
  return ex.category;
}

/**
 * Main work (and core work with TRX) must use the selected equipment; posture drills
 * and generic core work may be bodyweight in any mode.
 */
export function isExerciseAllowedInMode(ex, equipment) {
  if (!ex || !ex.equipment.includes(equipment)) return false;
  if (equipment === 'home_bodyweight') return true;
  const role = exerciseRole(ex);
  if (role === 'corrective') return true;
  const needsEquipment = !ex.equipment.includes('home_bodyweight');
  if (role === 'core') return equipment !== 'home_trx' || needsEquipment;
  return needsEquipment || (LOADABLE_BODYWEIGHT[equipment] || []).includes(ex.id);
}

export function getModeExercises(equipment) {
  return EXERCISES.filter((ex) => isExerciseAllowedInMode(ex, equipment));
}

function matchesCorrectiveSlot(ex, slot) {
  if (slot === 'posture_upper') {
    return ex.postureTags.includes('rounded_shoulders') || ex.postureTags.includes('forward_head');
  }
  if (slot === 'posture_lower') {
    return ex.postureTags.includes('anterior_pelvic_tilt') || ex.postureTags.includes('asymmetry');
  }
  return true;
}

function weakSpotHits(ex, focusTags) {
  return ex.postureTags.filter((t) => WEAK_SPOT_TAGS.includes(t) && focusTags.includes(t)).length;
}

function buildDayTemplates(daysPerWeek, equipment) {
  const days = Math.min(5, Math.max(3, daysPerWeek));
  if (equipment === 'home_bodyweight') {
    // No pulling or curling equipment at home, so the split is built around what the body alone can load.
    const upper = { region: 'upper', main: ['chest', 'back', 'triceps', 'triceps'] };
    const legs = { region: 'lower', main: ['legs', 'legs', 'legs', 'legs'] };
    const coreDay = {
      region: 'full',
      main: ['core', 'cardio', 'core', 'core'],
      title: 'Кор и кардио',
      focus: 'Пресс, глубокий кор и жиросжигающие интервалы',
    };
    const full = {
      region: 'full',
      main: ['legs', 'chest', 'back', 'triceps'],
      title: 'Всё тело',
      focus: 'Базовые движения на все крупные группы мышц за одну тренировку',
    };
    if (days === 3) return [upper, legs, full];
    if (days === 4) return [upper, legs, coreDay, full];
    return [upper, legs, coreDay, full, { ...upper }];
  }

  if (days === 3) {
    return [
      { region: 'upper', main: ['back', 'back', 'biceps', 'shoulders'] },
      { region: 'lower', main: ['legs', 'legs', 'legs', 'legs'] },
      { region: 'upper', main: ['chest', 'shoulders', 'triceps', 'chest'] },
    ];
  }
  if (days === 4) {
    return [
      { region: 'upper', main: ['back', 'back', 'biceps', 'biceps'] },
      { region: 'lower', main: ['legs', 'legs', 'legs', 'legs'] },
      { region: 'upper', main: ['chest', 'chest', 'shoulders', 'triceps'] },
      { region: 'upper', main: ['shoulders', 'biceps', 'triceps', 'shoulders'] },
    ];
  }
  return [
    { region: 'upper', main: ['back', 'back', 'back', 'biceps'] },
    { region: 'lower', main: ['legs', 'legs', 'legs', 'legs'] },
    { region: 'upper', main: ['chest', 'chest', 'triceps', 'triceps'] },
    { region: 'upper', main: ['shoulders', 'shoulders', 'back'] },
    { region: 'upper', main: ['biceps', 'triceps', 'biceps', 'triceps'] },
  ];
}

function joinRu(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}`;
}

function describeDay(tpl, mainExercises) {
  if (tpl.title) return { title: tpl.title, focus: tpl.focus };
  const groups = [...new Set(mainExercises.map(exerciseGroup))];
  if (!groups.length) return { title: 'Осанка и кор', focus: 'Коррекция осанки и стабилизация корпуса' };
  const title = joinRu(groups.map((g, i) => {
    const label = GROUP_LABELS[g] || g;
    return i === 0 ? label : label.toLowerCase();
  }));
  const focusText = joinRu(groups.map((g) => GROUP_FOCUS[g] || g));
  return { title, focus: focusText.charAt(0).toUpperCase() + focusText.slice(1) };
}

function buildCorrectiveSlots(region, focusTags, dayPos) {
  const upperFocus = focusTags.includes('forward_head') || focusTags.includes('rounded_shoulders');
  const lowerFocus = focusTags.includes('anterior_pelvic_tilt') || focusTags.includes('asymmetry');
  const regionSlot =
    region === 'upper' ? 'posture_upper' : region === 'lower' ? 'posture_lower' : dayPos % 2 ? 'posture_lower' : 'posture_upper';
  if (!upperFocus && !lowerFocus) return [regionSlot];
  if (upperFocus && lowerFocus) return [regionSlot, regionSlot === 'posture_upper' ? 'posture_lower' : 'posture_upper'];
  return [regionSlot, upperFocus ? 'posture_upper' : 'posture_lower'];
}

/**
 * Generate the training cycle: as many weeks as needed (max 4) for every exercise
 * of the chosen equipment mode to appear at least once, with weak spots found on
 * the photos placed first, given an extra set and kept in every week when possible.
 */
export function generateWorkoutPlan(metrics, profile, aiAnalysis = null) {
  const equipment = profile.equipment || 'home_bodyweight';
  const goal = profile.goal || 'recomp';
  const level = profile.level || 'beginner';
  const daysPerWeek = Number(profile.daysPerWeek) || 3;
  const focusTags = metrics?.focusTags || [];
  const aiRecSet = new Set(Array.isArray(aiAnalysis?.recommendedExerciseIds) ? aiAnalysis.recommendedExerciseIds : []);

  const modeExercises = getModeExercises(equipment);
  const pools = { main: [], corrective: [], core: [] };
  modeExercises.forEach((ex) => pools[exerciseRole(ex)].push(ex));

  const templates = buildDayTemplates(daysPerWeek, equipment);
  const mainCount = level === 'beginner' ? 3 : 4;
  const coreCount = goal === 'recomp' ? 2 : 1;
  const finishGroups = goal === 'recomp' ? ['cardio', 'core'] : ['core', 'cardio'];
  const finishPreferred = finishGroups[0];

  const isWeakSpot = (ex) => weakSpotHits(ex, focusTags) > 0 || aiRecSet.has(ex.id);

  // Main exercises that target a weak spot recur weekly, but only in groups with room to rotate the rest.
  const slotsPerGroup = {};
  templates.forEach((tpl) => tpl.main.slice(0, mainCount).forEach((g) => {
    slotsPerGroup[g] = (slotsPerGroup[g] || 0) + 1;
  }));
  const anchors = new Set();
  const anchorGroups = new Set();
  pools.main
    .filter(isWeakSpot)
    .map((ex) => ({ ex, w: weakSpotHits(ex, focusTags) * 2 + (aiRecSet.has(ex.id) ? 3 : 0) }))
    .sort((a, b) => b.w - a.w)
    .forEach(({ ex }) => {
      const g = exerciseGroup(ex);
      if (anchors.size >= 3 || anchorGroups.has(g) || (slotsPerGroup[g] || 0) < 2) return;
      anchors.add(ex.id);
      anchorGroups.add(g);
    });

  const reachableGroups = new Set();
  templates.forEach((tpl) => tpl.main.forEach((g) => {
    reachableGroups.add(g);
    (GROUP_FALLBACKS[g] || []).forEach((fb) => reachableGroups.add(fb));
  }));
  finishGroups.forEach((g) => reachableGroups.add(g));
  const coverageIds = new Set(
    modeExercises
      .filter((ex) => exerciseRole(ex) !== 'main' || reachableGroups.has(exerciseGroup(ex)))
      .map((ex) => ex.id)
  );

  const cycleUse = new Map();
  const bump = (map, id) => map.set(id, (map.get(id) || 0) + 1);

  const scoreOf = (ex, weekUse, prevDayIds, finishBias = null) => {
    let s = 0;
    if (!cycleUse.has(ex.id)) s += 60;
    if (anchors.has(ex.id) && !weekUse.has(ex.id)) s += 80;
    s += Math.min(24, weakSpotHits(ex, focusTags) * 12);
    if (aiRecSet.has(ex.id)) s += 20;
    if (ex.goalTags.includes(goal)) s += 4;
    if (!ex.level.includes(level)) s -= 15;
    if (finishBias && exerciseGroup(ex) === finishBias) s += 8;
    if (equipment !== 'home_bodyweight' && !ex.equipment.includes('home_bodyweight')) s += 5;
    s -= (weekUse.get(ex.id) || 0) * 70;
    if (prevDayIds.has(ex.id)) s -= 25;
    s -= (cycleUse.get(ex.id) || 0) * 6;
    return s;
  };

  const pickBest = (candidates, weekUse, prevDayIds, finishBias = null) => {
    let best = null;
    let bestScore = -Infinity;
    for (const ex of candidates) {
      const sc = scoreOf(ex, weekUse, prevDayIds, finishBias);
      if (sc > bestScore) {
        best = ex;
        bestScore = sc;
      }
    }
    return best;
  };

  const groupPool = (group) => (group === 'core' || group === 'cardio' ? pools.core : pools.main);

  const pickForGroup = (group, dayIds, weekUse, prevDayIds) => {
    for (const g of [group, ...(GROUP_FALLBACKS[group] || [])]) {
      const candidates = groupPool(g).filter((ex) => exerciseGroup(ex) === g && !dayIds.has(ex.id));
      const chosen = pickBest(candidates, weekUse, prevDayIds);
      if (chosen) return chosen;
    }
    return null;
  };

  const toItem = (ex, section) => {
    const rx = tunePrescription(ex, goal, level);
    const priority = isWeakSpot(ex) && exerciseRole(ex) !== 'core';
    return {
      exerciseId: ex.id,
      section,
      sets: priority && exerciseRole(ex) === 'main' ? Math.min(5, rx.sets + 1) : rx.sets,
      reps: rx.reps,
      restSec: rx.restSec,
      holdSeconds: rx.holdSeconds,
      priority,
      reason: buildReasonText(ex, metrics || {}, aiRecSet),
    };
  };

  const finalizeDay = (dayIndex, title, focus, items) => {
    const totalSets = items.reduce((acc, it) => acc + it.sets, 0);
    const estMinutes = Math.round(6 + totalSets * 1.9);
    const estKcal = Math.round(estMinutes * (goal === 'recomp' ? 7.6 : 6.4));
    return { dayIndex, title: `День ${dayIndex} • ${title}`, focus, estMinutes, estKcal, totalSets, items };
  };

  const buildWeek = () => {
    const weekUse = new Map();
    let prevDayIds = new Set();
    return templates.map((tpl, pos) => {
      const dayIds = new Set();
      const take = (ex) => {
        dayIds.add(ex.id);
        bump(weekUse, ex.id);
        bump(cycleUse, ex.id);
        return ex;
      };

      const corrective = [];
      for (const slot of buildCorrectiveSlots(tpl.region, focusTags, pos)) {
        let candidates = pools.corrective.filter((ex) => !dayIds.has(ex.id) && matchesCorrectiveSlot(ex, slot));
        if (!candidates.length) candidates = pools.corrective.filter((ex) => !dayIds.has(ex.id));
        const chosen = pickBest(candidates, weekUse, prevDayIds);
        if (chosen) corrective.push(take(chosen));
      }

      const main = [];
      for (const group of tpl.main.slice(0, mainCount)) {
        const chosen = pickForGroup(group, dayIds, weekUse, prevDayIds);
        if (chosen) main.push(take(chosen));
      }

      // Core and cardio share the finisher so every one of them rotates in; the goal only tilts the choice.
      const core = [];
      for (let i = 0; i < coreCount; i += 1) {
        const candidates = pools.core.filter((ex) => !dayIds.has(ex.id));
        const chosen = pickBest(candidates, weekUse, prevDayIds, i === 0 ? finishPreferred : finishGroups[1]);
        if (chosen) core.push(take(chosen));
      }

      prevDayIds = dayIds;
      const { title, focus } = describeDay(tpl, main);
      const items = [
        ...corrective.map((ex) => toItem(ex, 'Разминка и осанка')),
        ...main.map((ex) => toItem(ex, 'Основной блок')),
        ...core.map((ex) => toItem(ex, 'Кор и финиш')),
      ];
      return finalizeDay(pos + 1, title, focus, items);
    });
  };

  const focusSummary = [];
  if (focusTags.includes('forward_head')) focusSummary.push('Выравнивание шеи и головы');
  if (focusTags.includes('rounded_shoulders')) focusSummary.push('Раскрытие грудного отдела и верх спины');
  if (focusTags.includes('asymmetry')) focusSummary.push('Унилатеральный баланс сторон');
  if (focusTags.includes('anterior_pelvic_tilt')) focusSummary.push('Стабилизация таза и глубокий кор');
  if (focusTags.includes('v_taper_boost')) focusSummary.push('Акцент на плечи и V-силуэт');
  if (!focusSummary.length) focusSummary.push('Гармоничное развитие всех мышечных групп');

  const weeks = [];
  let generatedByAi = false;

  // A valid AI-built week (catalog IDs, same equipment and week length) becomes week 1; rotation covers the rest.
  if (
    Array.isArray(aiAnalysis?.customPlanDays) &&
    aiAnalysis.customPlanDays.length >= 2 &&
    aiPlanMatchesProfile(aiAnalysis, { equipment, daysPerWeek })
  ) {
    const validatedDays = aiAnalysis.customPlanDays
      .map((d) => {
        const seenIds = new Set();
        const validItems = (Array.isArray(d.items) ? d.items : [])
          .filter((it) => {
            const ex = EXERCISE_MAP[it.exerciseId];
            if (!isExerciseAllowedInMode(ex, equipment) || seenIds.has(ex.id)) return false;
            seenIds.add(ex.id);
            return true;
          })
          .map((it) => {
            const ex = EXERCISE_MAP[it.exerciseId];
            const role = exerciseRole(ex);
            return {
              exerciseId: ex.id,
              section: role === 'corrective' ? 'Разминка и осанка' : role === 'core' ? 'Кор и финиш' : 'Основной блок',
              sets: Math.max(2, Math.min(5, Number(it.sets) || ex.defaultSets)),
              reps: String(it.reps || ex.defaultReps),
              restSec: Math.max(20, Math.min(150, Number(it.restSec) || ex.defaultRestSec)),
              holdSeconds: ex.holdSeconds || 40,
              priority: isWeakSpot(ex) && role !== 'core',
              reason: it.reason ? `AI Ассистент • ${it.reason}` : `AI Ассистент • ${ex.whyTemplate}`,
            };
          });
        return validItems.length >= 3 ? { d, items: validItems } : null;
      })
      .filter(Boolean)
      .map(({ d, items }, idx) => {
        items.forEach((it) => bump(cycleUse, it.exerciseId));
        const rawTitle = String(d.title || 'Персональная тренировка AI').replace(/^\s*День\s*\d+\s*[•:.\-–—]?\s*/i, '');
        return finalizeDay(idx + 1, rawTitle, d.focus || 'Составлено AI Ассистентом по результатам анализа фото', items);
      });

    if (validatedDays.length >= 2) {
      weeks.push({ weekIndex: 1, source: 'ai', days: validatedDays });
      generatedByAi = true;
    }
  }

  const isCovered = () => [...coverageIds].every((id) => cycleUse.has(id));
  while (weeks.length < MAX_CYCLE_WEEKS && (!weeks.length || !isCovered())) {
    weeks.push({ weekIndex: weeks.length + 1, source: 'rotation', days: buildWeek() });
  }

  const coveredCount = [...coverageIds].filter((id) => cycleUse.has(id)).length;

  return {
    id: `plan_${Date.now()}`,
    version: PLAN_VERSION,
    createdAt: new Date().toISOString(),
    generatedByAi,
    aiProviderLabel: generatedByAi ? `${(aiAnalysis?.provider || 'AI').toUpperCase()} ${aiAnalysis?.model || ''}`.trim() : null,
    goal,
    goalLabel: GOAL_LABELS[goal] || goal,
    equipment,
    equipmentLabel: EQUIPMENT_LABELS[equipment] || equipment,
    level,
    levelLabel: LEVEL_LABELS[level] || level,
    daysPerWeek: weeks[0].days.length,
    focusTags: [...focusTags],
    focusSummary,
    priorityExerciseIds: modeExercises.filter((ex) => isWeakSpot(ex) && exerciseRole(ex) !== 'core').map((ex) => ex.id),
    coverage: { total: coverageIds.size, covered: coveredCount },
    nutrition: buildNutritionGuidance(profile, metrics || {}, aiAnalysis),
    weeks,
    currentWeek: 0,
    days: weeks[0].days,
  };
}

/**
 * Plans are stored as JSON, so `days` must be re-pointed at the selected week after loading.
 * Plans saved before the weekly cycle existed become a one-week cycle.
 */
export function normalizePlan(plan) {
  if (!plan || !Array.isArray(plan.days)) return plan;
  if (!Array.isArray(plan.weeks) || !plan.weeks.length) {
    plan.weeks = [{ weekIndex: 1, source: plan.generatedByAi ? 'ai' : 'rotation', days: plan.days }];
  }
  const w = Math.min(Math.max(0, Number(plan.currentWeek) || 0), plan.weeks.length - 1);
  plan.currentWeek = w;
  plan.days = plan.weeks[w].days;
  return plan;
}

export function selectPlanWeek(plan, weekIdx) {
  if (!plan?.weeks?.[weekIdx]) return plan;
  plan.currentWeek = weekIdx;
  plan.days = plan.weeks[weekIdx].days;
  return plan;
}

/**
 * Return compatible replacement exercises for swapping in the UI.
 */
export function getAlternativeExercises(currentExerciseId, equipment) {
  const current = EXERCISE_MAP[currentExerciseId];
  if (!current) return [];
  const role = exerciseRole(current);
  const group = exerciseGroup(current);
  const currentPrimaryMuscle = current.muscles?.[0];
  const rank = (ex) =>
    (exerciseGroup(ex) === group ? 30 : 0) +
    (currentPrimaryMuscle && ex.muscles.includes(currentPrimaryMuscle) ? 20 : 0);
  const nearGroups = new Set([group, ...(GROUP_FALLBACKS[group] || [])]);
  return getModeExercises(equipment)
    .filter(
      (ex) =>
        ex.id !== currentExerciseId &&
        exerciseRole(ex) === role &&
        (role !== 'main' || nearGroups.has(exerciseGroup(ex)))
    )
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, 6);
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
