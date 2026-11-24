/**
 * Studio photorealistic human demo photo presets (front, side, back)
 * Replaces schematic mannequins with real-looking studio posture photos.
 */

const demoUrl = (file) => new URL(`../assets/demos/${file}`, import.meta.url).href;

export const DEMO_PRESETS = [
  {
    id: 'male_recomp',
    name: 'Мужчина • Рельеф и осанка (Гантели)',
    subtitle: 'Студийные фото с 3 ракурсов, цель — рельеф и выравнивание осанки',
    profile: {
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 81,
      goal: 'recomp',
      equipment: 'home_dumbbells',
      level: 'intermediate',
      daysPerWeek: 4,
    },
    photoUrls: {
      front: demoUrl('male_front.jpg'),
      side: demoUrl('male_side.jpg'),
      back: demoUrl('male_back.jpg'),
    },
  },
  {
    id: 'male_gym',
    name: 'Мужчина • Набор массы (Зал)',
    subtitle: 'Студийные фото с 3 ракурсов, силовая программа в зале',
    profile: {
      sex: 'male',
      age: 26,
      heightCm: 182,
      weightKg: 76,
      goal: 'muscle',
      equipment: 'gym',
      level: 'intermediate',
      daysPerWeek: 4,
    },
    photoUrls: {
      front: demoUrl('male_front.jpg'),
      side: demoUrl('male_side.jpg'),
      back: demoUrl('male_back.jpg'),
    },
  },
  {
    id: 'female_tone',
    name: 'Женщина • Тонус и осанка (Дома)',
    subtitle: 'Студийные фото с 3 ракурсов, домашняя программа с весом тела',
    profile: {
      sex: 'female',
      age: 27,
      heightCm: 168,
      weightKg: 59,
      goal: 'posture',
      equipment: 'home_bodyweight',
      level: 'beginner',
      daysPerWeek: 3,
    },
    photoUrls: {
      front: demoUrl('female_front.jpg'),
      side: demoUrl('female_side.jpg'),
      back: demoUrl('female_back.jpg'),
    },
  },
];

async function urlToDataUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Не удалось загрузить демо-фото: ${url}`);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Ошибка чтения демо-фото'));
    reader.readAsDataURL(blob);
  });
}

export async function generateDemoPhotoSet(presetId) {
  const preset = DEMO_PRESETS.find((p) => p.id === presetId) || DEMO_PRESETS[0];
  const [front, side, back] = await Promise.all([
    urlToDataUrl(preset.photoUrls.front),
    urlToDataUrl(preset.photoUrls.side),
    urlToDataUrl(preset.photoUrls.back),
  ]);
  return {
    preset,
    photos: { front, side, back },
  };
}
