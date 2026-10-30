// Starting programme, loaded the first time the app opens. After that, edit workouts in the app's Plan tab.
// days: 0 = Sunday, 1 = Monday ... 6 = Saturday. inc: kg to add once every set hits the top of the rep range.
// rest: [min, max] seconds, shown as the target on the rest timer (it beeps at min).
const BIG = [120, 180], SMALL = [60, 90];
const MUSCLES = ['chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'traps', 'lats', 'upperback', 'lowerback', 'glutes', 'quads', 'hamstrings', 'calves'];

const DEFAULT_WORKOUTS = [
  { id: 'upper-a', name: 'Upper A', days: [1], inc: 2.5, exercises: [
    { id: 'bench', name: 'Barbell bench press', sets: 3, reps: [6, 8], rest: BIG, muscles: ['chest', 'shoulders', 'triceps'] },
    { id: 'row', name: 'Barbell or chest-supported row', sets: 3, reps: [6, 8], rest: BIG, muscles: ['lats', 'upperback', 'traps', 'biceps'] },
    { id: 'db-press', name: 'Seated dumbbell shoulder press', sets: 3, reps: [8, 10], rest: BIG, muscles: ['shoulders', 'triceps'] },
    { id: 'pulldown', name: 'Lat pulldown', sets: 3, reps: [8, 12], rest: BIG, muscles: ['lats', 'biceps'] },
    { id: 'incline-curl', name: 'Incline dumbbell curl', sets: 3, reps: [10, 12], rest: SMALL, muscles: ['biceps'] },
    { id: 'pushdown', name: 'Triceps pushdown', sets: 3, reps: [10, 12], rest: SMALL, muscles: ['triceps'] },
  ] },
  { id: 'lower-a', name: 'Lower A', days: [2], inc: 5, exercises: [
    { id: 'squat', name: 'Back squat', sets: 3, reps: [6, 8], rest: BIG, muscles: ['quads', 'glutes'] },
    { id: 'rdl', name: 'Romanian deadlift', sets: 3, reps: [8, 10], rest: BIG, muscles: ['hamstrings', 'glutes', 'lowerback'] },
    { id: 'leg-press', name: 'Leg press', sets: 3, reps: [10, 12], rest: BIG, muscles: ['quads', 'glutes'] },
    { id: 'seated-curl', name: 'Seated leg curl', sets: 3, reps: [10, 12], rest: SMALL, muscles: ['hamstrings'] },
    { id: 'standing-calf', name: 'Standing calf raise', sets: 4, reps: [10, 15], rest: SMALL, muscles: ['calves'] },
    { id: 'abs', name: 'Hanging leg raise or cable crunch', sets: 3, reps: [10, 15], rest: SMALL, muscles: ['abs'] },
  ] },
  { id: 'upper-b', name: 'Upper B', days: [4], inc: 2.5, exercises: [
    { id: 'incline-db', name: 'Incline dumbbell press', sets: 3, reps: [8, 10], rest: BIG, muscles: ['chest', 'shoulders', 'triceps'] },
    { id: 'pullup', name: 'Pull-ups (or assisted)', sets: 3, reps: [6, 10], rest: BIG, muscles: ['lats', 'biceps'] },
    { id: 'lateral', name: 'Dumbbell lateral raise', sets: 4, reps: [12, 15], rest: SMALL, muscles: ['shoulders'] },
    { id: 'cable-row', name: 'Cable row', sets: 3, reps: [10, 12], rest: BIG, muscles: ['lats', 'upperback', 'traps'] },
    { id: 'fly', name: 'Cable fly or pec deck', sets: 3, reps: [12, 15], rest: SMALL, muscles: ['chest'] },
    { id: 'hammer', name: 'Hammer curl', sets: 3, reps: [10, 12], rest: SMALL, muscles: ['biceps', 'forearms'] },
    { id: 'oh-ext', name: 'Overhead triceps extension', sets: 3, reps: [10, 12], rest: SMALL, muscles: ['triceps'] },
  ] },
  { id: 'lower-b', name: 'Lower B', days: [5], inc: 5, exercises: [
    { id: 'deadlift', name: 'Deadlift', sets: 3, reps: [5, 5], rest: BIG, muscles: ['hamstrings', 'glutes', 'lowerback', 'traps'] },
    { id: 'bulgarian', name: 'Bulgarian split squat (each leg)', sets: 3, reps: [8, 10], rest: BIG, muscles: ['quads', 'glutes'] },
    { id: 'hip-thrust', name: 'Hip thrust', sets: 3, reps: [8, 12], rest: BIG, muscles: ['glutes'] },
    { id: 'leg-ext', name: 'Leg extension', sets: 3, reps: [12, 15], rest: SMALL, muscles: ['quads'] },
    { id: 'lying-curl', name: 'Lying leg curl', sets: 3, reps: [10, 12], rest: SMALL, muscles: ['hamstrings'] },
    { id: 'seated-calf', name: 'Seated calf raise', sets: 4, reps: [12, 15], rest: SMALL, muscles: ['calves'] },
  ] },
];

// Which picker category each muscle belongs to; your custom exercises show under every category their muscles match.
const CATEGORY = { biceps: 'Arms', triceps: 'Arms', forearms: 'Arms', chest: 'Chest', shoulders: 'Shoulders', traps: 'Shoulders',
  lats: 'Back', upperback: 'Back', lowerback: 'Back', glutes: 'Legs', quads: 'Legs', hamstrings: 'Legs', calves: 'Legs', abs: 'Core' };

// Preset exercises shown when you tap + Add exercise: [name, type, muscles, reps (optional)].
// type c = compound (3 × 6–10, rest 2–3 min), i = isolation (3 × 10–15, rest 60–90 s). Everything can be changed after adding.
const PRESETS = {
  Arms: [
    ['Barbell curl', 'i', 'biceps forearms'], ['EZ-bar curl', 'i', 'biceps forearms'], ['Dumbbell curl', 'i', 'biceps'],
    ['Hammer curl', 'i', 'biceps forearms'], ['Incline dumbbell curl', 'i', 'biceps'], ['Preacher curl', 'i', 'biceps'],
    ['Cable curl', 'i', 'biceps'], ['Concentration curl', 'i', 'biceps'], ['Reverse curl', 'i', 'forearms biceps'],
    ['Triceps pushdown', 'i', 'triceps'], ['Overhead triceps extension', 'i', 'triceps'], ['Skull crushers', 'i', 'triceps'],
    ['Close-grip bench press', 'c', 'triceps chest shoulders'], ['Triceps dips', 'c', 'triceps chest shoulders'], ['Wrist curl', 'i', 'forearms'],
  ],
  Chest: [
    ['Barbell bench press', 'c', 'chest shoulders triceps'], ['Incline barbell bench press', 'c', 'chest shoulders triceps'],
    ['Dumbbell bench press', 'c', 'chest shoulders triceps'], ['Incline dumbbell press', 'c', 'chest shoulders triceps'],
    ['Decline bench press', 'c', 'chest triceps'], ['Machine chest press', 'c', 'chest shoulders triceps'],
    ['Push-ups', 'c', 'chest shoulders triceps'], ['Chest dips', 'c', 'chest triceps shoulders'],
    ['Cable fly', 'i', 'chest'], ['Low-to-high cable fly', 'i', 'chest shoulders'], ['Pec deck', 'i', 'chest'], ['Dumbbell fly', 'i', 'chest'],
  ],
  Shoulders: [
    ['Overhead press', 'c', 'shoulders triceps'], ['Seated dumbbell shoulder press', 'c', 'shoulders triceps'],
    ['Arnold press', 'c', 'shoulders triceps'], ['Machine shoulder press', 'c', 'shoulders triceps'],
    ['Dumbbell lateral raise', 'i', 'shoulders'], ['Cable lateral raise', 'i', 'shoulders'], ['Front raise', 'i', 'shoulders'],
    ['Rear delt fly', 'i', 'shoulders upperback'], ['Reverse pec deck', 'i', 'shoulders upperback'], ['Face pull', 'i', 'shoulders traps upperback'],
    ['Upright row', 'i', 'shoulders traps'], ['Barbell shrug', 'i', 'traps'], ['Dumbbell shrug', 'i', 'traps'],
  ],
  Back: [
    ['Deadlift', 'c', 'hamstrings glutes lowerback traps', [3, 5]], ['Pull-ups', 'c', 'lats biceps'], ['Chin-ups', 'c', 'lats biceps'],
    ['Lat pulldown', 'c', 'lats biceps'], ['Close-grip lat pulldown', 'c', 'lats biceps'], ['Barbell row', 'c', 'lats upperback traps biceps'],
    ['Dumbbell row', 'c', 'lats upperback traps biceps'], ['Chest-supported row', 'c', 'lats upperback traps biceps'], ['Seated cable row', 'c', 'lats upperback traps biceps'],
    ['T-bar row', 'c', 'lats upperback traps biceps'], ['Straight-arm pulldown', 'i', 'lats'], ['Rack pull', 'c', 'traps lowerback glutes'],
    ['Back extension', 'i', 'lowerback glutes hamstrings'],
  ],
  Legs: [
    ['Back squat', 'c', 'quads glutes'], ['Front squat', 'c', 'quads glutes abs'], ['Hack squat', 'c', 'quads glutes'],
    ['Leg press', 'c', 'quads glutes'], ['Goblet squat', 'c', 'quads glutes'], ['Bulgarian split squat', 'c', 'quads glutes'],
    ['Walking lunges', 'c', 'quads glutes'], ['Step-ups', 'c', 'quads glutes'], ['Romanian deadlift', 'c', 'hamstrings glutes lowerback'],
    ['Hip thrust', 'c', 'glutes hamstrings'], ['Leg extension', 'i', 'quads'], ['Lying leg curl', 'i', 'hamstrings'],
    ['Seated leg curl', 'i', 'hamstrings'], ['Hip abduction machine', 'i', 'glutes'], ['Cable glute kickback', 'i', 'glutes'],
    ['Standing calf raise', 'i', 'calves'], ['Seated calf raise', 'i', 'calves'],
  ],
  Core: [
    ['Hanging leg raise', 'i', 'abs'], ["Captain's chair knee raise", 'i', 'abs'], ['Cable crunch', 'i', 'abs'],
    ['Ab wheel rollout', 'i', 'abs'], ['Crunches', 'i', 'abs'], ['Decline sit-up', 'i', 'abs'], ['Russian twist', 'i', 'abs'],
    ['Dumbbell side bend', 'i', 'abs'], ['Pallof press', 'i', 'abs'], ['Dead bug', 'i', 'abs'],
  ],
};
