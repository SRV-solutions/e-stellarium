export type User = {
  id: string;
  email: string;
  name: string;
  alias: string;
  role: "student" | "admin";
  totalXp: number;
  glints: number; // el saldo de destellos, para la tienda
  // Los cosméticos puestos (ids de la tienda). wornColor vacío = el azul de siempre
  wornFrame: string | null;
  wornColor: string | null;
  wornTitle: string | null;
  titleVariant: number; // 0 o 1: "Cazadora" o "Cazador"
  createdAt: string;
  updatedAt: string;
};

export type Course = {
  key: string;
  name: string;
  driveUrl: string | null;
  purchasedAt: string;
};

export type StarKind = "lesson" | "exam";

export type StarSummary = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  letter: string; // su nombre en la constelación: una letra por módulo (β¹, β²) y Ω el examen
  module: number | null; // el módulo de la guía
  kind: StarKind;
  questionCount: number;
  completed: boolean;
  unlocked: boolean;
  exam?: ExamSummary; // solo en la estrella de examen
};

// En qué situación está el examen de una constelación (lo calcula la API)
export type ExamState =
  | { status: "locked" } // le faltan lecciones
  | { status: "waiting"; opensAt: string } // faltan los 3 días
  | { status: "open"; attempts: number }
  | { status: "in_progress"; attemptId: string }
  | { status: "retry_wait"; opensAt: string; lastCorrect: number; attemptId: string } // no aprobó, faltan los 2 días
  | { status: "passed"; correctCount: number; attemptId: string };

// couponPercent: el descuento que ganaría si aprueba ahora; practiceCount: cuántas preguntas hay para practicar
export type ExamSummary = ExamState & { couponPercent: number; practiceCount: number };

export type Constellation = {
  id: string;
  name: string;
  description: string | null;
  course: { key: string; name: string };
  modules: { number: number; title: string }[]; // los módulos de la guía
  completedStars: number;
  totalStars: number;
  stars: StarSummary[];
};

// attempt: cuántas veces la respondió el alumno. Se devuelve al responder, para corregir con la misma mezcla.
// solved: si ya la acertó alguna vez (para la estrella, ya cuenta)
type QuestionBase = {
  id: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  attempt: number;
  solved: boolean;
};

export type StudentQuestion =
  | (QuestionBase & { type: "output"; content: { code: string; options: string[] } })
  | (QuestionBase & { type: "multiple_choice"; content: { options: string[] } })
  | (QuestionBase & { type: "fill_blank"; content: { code: string; blanks: string[][] } })
  | (QuestionBase & { type: "order_lines"; content: { lines: string[] } });

export type StarPlay = {
  star: {
    id: string;
    title: string;
    description: string | null;
    kind: StarKind;
    position: number;
    letter: string;
    completed: boolean;
  };
  course: { key: string; name: string };
  nextStar: { id: string; title: string; kind: StarKind; position: number; letter: string } | null;
  questions: StudentQuestion[];
};

export type AnswerResponse = { choice: number } | { choices: number[] } | { order: number[] };

export type AnswerResult = {
  correct: boolean;
  solution: AnswerResponse;
  output: string | null;
  explanation: string;
  xpGained: number;
  starXp: number; // la parte de xpGained que se dio por encender la estrella
  starCompleted: boolean;
};


// GET /exams/:starId
export type ExamInfo = {
  star: { id: string; title: string; position: number; letter: string };
  course: { key: string; name: string };
  constellationId: string;
  state: ExamState;
  rules: {
    questions: number;
    passMark: number;
    secondsPerType: Record<StudentQuestion["type"], number>;
    couponPercent: number;
  };
  coupon: Coupon | null;
};

export type Coupon = { code: string; percent: number; expiresAt: string; usedAt?: string | null };

// Las preguntas del examen no traen attempt ni solved
export type ExamQuestion = StudentQuestion extends infer Q
  ? Q extends StudentQuestion
    ? Omit<Q, "attempt" | "solved">
    : never
  : never;

// Lo que devuelven empezar, pedir y responder: la pregunta que toca, o el resultado
export type ExamProgress =
  | {
      status: "question";
      attemptId: string;
      position: number;
      total: number;
      timeLimitSeconds: number;
      remainingMs: number;
      question: ExamQuestion;
    }
  | {
      status: "finished";
      attemptId: string;
      total: number;
      correctCount: number;
      passed: boolean;
      results: boolean[];
      xpGained: number;
      coupon: Coupon | null;
      retryOpensAt: string | null;
    };

// GET /coupons: los cupones del alumno, del más nuevo al más viejo
export type CouponSummary = {
  code: string;
  percent: number;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
  course: { key: string; name: string };
};

// GET /me/stats: la racha, los protectores del mes y cómo va el repaso de hoy
export type ReviewSummary =
  | { status: "unavailable" } // todavía no jugó ninguna lección
  | { status: "pending" | "in_progress" | "finished"; answered: number; total: number };

export type Stats = {
  streak: number;
  streakFreezes: number; // los gratis que le quedan este mes
  boughtFreezes: number; // los comprados en la tienda, que se usan después de los gratis
  activeToday: boolean;
  review: ReviewSummary;
  glints: number;
  badges: { days: number; earnedAt: string }[]; // las insignias de racha que ya ganó
};

// Una insignia que se ganó con esta respuesta, con los destellos que dio
export type NewBadge = { days: number; earnedAt: string; glints: number };

// GET /review/today
export type Review = {
  id: string;
  day: string;
  finished: boolean;
  total: number;
  correctCount: number;
  questions: { position: number; answered: boolean; correct: boolean | null; question: ExamQuestion }[];
};

// POST /exams/:starId/practice: la práctica del examen aprobado
export type Practice = { practiceId: string; questions: ExamQuestion[] };

// POST /exams/:starId/practice/answer: sin XP; la racha, por si era lo primero del día
export type PracticeAnswer = Pick<AnswerResult, "correct" | "solution" | "output" | "explanation"> & { streak: number };

// POST /reviews/:id/answer
export type ReviewAnswer = Omit<AnswerResult, "starXp" | "starCompleted"> & {
  reviewXp: number; // la parte de xpGained que se dio por terminar el repaso
  finished: boolean;
  correctCount: number;
  total: number;
  streak: number;
  glintsGained: number;
  glints: number; // el saldo después de responder
  newBadges: NewBadge[];
};

// ---------- Desafíos y ranking ----------

// own: de sus cursos; explore y discover: de cursos que no tiene
export type ChallengePart = "own" | "explore" | "discover";

export type ChallengeStep = {
  position: number;
  total: number;
  part: ChallengePart;
  timeLimitSeconds: number;
  remainingMs: number;
  question: ExamQuestion;
};

export type ChallengeResult = {
  correctCount: number;
  total: number;
  xpGained: number;
  results: { part: ChallengePart; correct: boolean }[];
  recommendation: { key: string; name: string } | null;
};

// GET /challenges/current y POST /challenges/:id/start
export type ChallengeView = {
  challenge: { id: string; publishedAt: string; closesAt: string };
  status: "unavailable" | "ready" | "in_progress" | "finished";
  total: number;
  parts: Record<ChallengePart, number>;
  questions: { part: ChallengePart; correct: boolean | null }[];
  explore: { key: string; name: string } | null;
  discover: { key: string; name: string } | null; // puede ser el mismo de Explorá
  current: ChallengeStep | null;
  result: ChallengeResult | null;
};

// POST /challenges/:id/answer
export type ChallengeVerdict = {
  correct: boolean;
  timedOut: boolean;
  solution: AnswerResponse | null;
  output: string | null;
  explanation: string;
  // Dónde se aprende lo que preguntó: el curso (y si ya es suyo), el módulo y sus clases
  learnAt: {
    course: { key: string; name: string };
    owned: boolean;
    module: number;
    title: string;
    classes: string;
  } | null;
  xpGained: number;
  glintsGained: number;
  glints: number; // el saldo después de responder
  newBadges: NewBadge[];
  finished: boolean;
  result: ChallengeResult | null;
};

// GET /ranking
export type Ranking = {
  period: "week" | "all";
  startsAt: string | null;
  endsAt: string | null;
  top: { position: number; alias: string; xp: number; me: boolean }[];
  me: { position: number | null; xp: number } | null;
};
