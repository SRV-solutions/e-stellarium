export type RoleKey = "student" | "teacher" | "admin" | "super_admin";

// Los mismos que PERMISSIONS en la API (api/src/lib/permissions.ts)
export type Permission =
  | "content:edit"
  | "content:approve"
  | "students:view"
  | "challenges:manage"
  | "economy:edit"
  | "users:manage"
  | "coupons:manage"
  | "audit:view"
  | "audit:revert"
  | "integrity:view"
  | "roles:manage";

export type User = {
  id: string;
  email: string;
  name: string;
  alias: string; // se puede repetir con el de otra persona: lo que identifica es el email
  avatar: string | null; // el dibujo elegido (components/Avatar/drawings.tsx); vacío = las iniciales
  aliasChangedAt: string | null;
  notifyEmail: boolean; // los mails que se pueden desactivar (desafío nuevo, banco bajo)
  notifyApp: boolean; // los avisos de la campanita
  role: RoleKey;
  permissions: Permission[]; // los del rol, leídos de la base (el super admin, todos)
  totalXp: number;
  glints: number; // el saldo de destellos, para la tienda
  // Los cosméticos puestos (ids de la tienda). wornColor vacío = el azul de siempre
  wornFrame: string | null;
  wornColor: string | null;
  wornColorHex: string | null; // el color de ese trazo, como lo guarda la tienda
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
  // La versión de la pregunta que se muestra (estrellas y práctica): se devuelve al responder, y la API
  // corrige con esa aunque mientras tanto se haya aprobado otra
  version?: number;
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
  newBadges: NewBadge[]; // las insignias de racha que ganó con esta respuesta
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
  voided: boolean; // anulado desde el panel
  createdAt: string;
  course: { key: string; name: string } | null; // null: canjeado en la tienda o de regalo
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
export type PracticeAnswer = Pick<AnswerResult, "correct" | "solution" | "output" | "explanation"> & { streak: number; newBadges: NewBadge[] };

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
  glintsGained: number; // los destellos del desafío (sin las insignias)
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
  // frame: el marco que lleva puesto; title: su título, ya con la forma que eligió
  top: { position: number; alias: string; xp: number; me: boolean; frame: string | null; avatar: string | null; title: string | null }[];
  me: { position: number | null; xp: number } | null;
};

// ---------- La tienda ----------

// Por qué no se puede comprar algo: no alcanzan los destellos, ya compró el cupón de la semana,
// ya compró los protectores del mes o ya tiene ese cosmético. null: se puede
export type Blocked = "glints" | "weekly_limit" | "monthly_limit" | "owned" | null;

export type CosmeticKind = "frame" | "color" | "title";

// Lo que lleva puesto (PUT /me/cosmetics lo devuelve igual)
export type Worn = {
  frame: string | null;
  color: string; // "blue" si no eligió otro
  colorHex: string | null;
  title: string | null;
  titleVariant: number;
  titleText: string | null;
};

// GET /shop
export type Shop = {
  glints: number;
  coupons: { item: string; percent: number; price: number; missing: number; blockedBy: Blocked }[];
  couponValidDays: number;
  couponBoughtThisWeek: boolean;
  couponAvailableAt: string | null;
  freeze: {
    item: string;
    price: number;
    missing: number;
    blockedBy: Blocked;
    boughtThisMonth: number;
    monthlyLimit: number;
    owned: number; // los comprados que todavía no usó
    availableAt: string | null;
  };
  cosmetics: {
    item: string;
    kind: CosmeticKind;
    name: string;
    note: string;
    hex: string | null;
    variants: [string, string] | null;
    price: number;
    missing: number;
    owned: boolean;
    blockedBy: Blocked;
  }[];
  worn: Worn;
};

// POST /shop/purchases: el cupón, si fue un cupón, y la tienda con el saldo nuevo
export type Purchase = {
  item: string;
  coupon: { code: string; percent: number; expiresAt: string } | null;
  shop: Shop;
};

// ---------- Panel de staff ----------

// Un registro de la bitácora, como lo manda GET /admin/audit
export type AuditEntry = {
  id: number;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null; // vacío: un script o la verificación diaria
  ip: string | null;
  action: string; // auth.login, user.role_update, role.update, user.delete, user.restore, audit.revert, integrity.fail
  target: { type: string; id: string; name: string | null } | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reversible: boolean;
  revertsId: number | null;
  revertedBy: number | null;
  canRevert: boolean;
};

export type AuditPage = { entries: AuditEntry[]; nextBefore: number | null };

export type IntegrityProblem =
  | { kind: "row"; table: string; rowId: string }
  | { kind: "table"; table: string }
  | { kind: "chain"; table: "audit_logs"; rowId: string };

export type IntegrityCheck = {
  id: number;
  checkedAt: string;
  source: "manual" | "daily";
  ok: boolean;
  problemCount: number;
  problems: IntegrityProblem[];
};

// Una persona en la lista del panel (GET /admin/users)
export type Person = {
  id: string;
  name: string;
  email: string;
  alias: string;
  role: RoleKey;
  createdAt: string;
  deletedAt: string | null;
  lastActiveOn: string | null; // "2026-11-10", día de Argentina
  streak: number; // 0 si se cortó
};

export type PeopleKind = "all" | "students" | "staff" | "deleted";

export type PeoplePage = { people: Person[]; counts: Record<PeopleKind, number>; nextOffset: number | null };

// La ficha (GET /admin/users/:id)
export type PersonDetail = Person & {
  courses: { key: string; name: string }[];
  teaching: string[]; // los cursos que da (si es docente), por clave
  courseOptions: { key: string; name: string }[]; // los que se le pueden asignar (solo si es docente)
  auditCount: number;
};

// Un rol con sus permisos (GET /admin/roles). El super admin no es editable
export type RoleInfo = { key: RoleKey; name: string; editable: boolean; permissions: Permission[] };

// GET /economy: cuánta XP y cuántos destellos da cada cosa. Los números viven en la API (settings) y se
// editan desde el panel: el cliente no los repite, los recibe con la sesión
export type Economy = {
  xp: {
    questionCorrect: number;
    starCompleted: number;
    examPassed: number;
    reviewCorrect: number;
    reviewCompleted: number;
    challengeCorrect: number;
    challengeCompleted: number;
  };
  glints: { reviewCompleted: number; challengeCorrect: number; challengeCompleted: number };
  badges: { days: number; glints: number }[];
  freezes: { freePerMonth: number; boughtPerMonth: number };
};

// ---------- Panel: economía ----------

// GET /admin/settings
export type SettingInfo = { key: string; value: number; min: number; max: number; updatedAt: string };

export type ShopItemKind = "coupon" | "streak_freeze" | "frame" | "color" | "title";

// GET /admin/shop: todo lo de la tienda, también lo retirado
export type AdminShopItem = {
  id: string;
  kind: ShopItemKind;
  name: string;
  note: string;
  price: number;
  percent: number | null;
  hex: string | null;
  altName: string | null;
  active: boolean;
  position: number;
  count: number; // vendidos (cupones y protector) o cuántos lo tienen (cosméticos)
  fixed: boolean; // el azul: gratis y siempre a la venta
  retirable: boolean;
};

// ---------- Contenido (panel) ----------

export type QuestionType = StudentQuestion["type"];
export type Difficulty = "easy" | "medium" | "hard";
export type VersionStatus = "draft" | "in_review" | "rejected" | "published" | "replaced";

// GET /admin/content/courses
export type ContentCourse = {
  key: string;
  name: string;
  modules: { number: number; title: string }[];
  stars: { id: string; letter: string; title: string; module: number | null }[];
};

// Una fila de GET /admin/questions
export type ContentRow = {
  id: string;
  starId: string | null;
  pool: "exam" | "challenge" | null;
  visible: boolean;
  answers: number;
  published: { number: number; type: QuestionType; prompt: string; snippet: string | null; topic: string; difficulty: Difficulty } | null;
  open: {
    number: number;
    status: "draft" | "in_review" | "rejected";
    type: QuestionType;
    prompt: string;
    snippet: string | null; // un pedacito del código, para distinguir las que se preguntan igual
    authorName: string | null;
    updatedAt: string;
    submittedAt: string | null;
    rejection: { comment: string; by: string | null } | null;
  } | null;
};

export type ContentFilter = "all" | "review" | "draft" | "rejected" | "published" | "unpublished" | "mine";
export type ContentList = { questions: ContentRow[]; counts: Record<ContentFilter, number>; nextOffset: number | null };

// Una versión entera (el staff ve la respuesta)
export type QuestionVersionData = {
  number: number;
  status: VersionStatus;
  type: QuestionType;
  difficulty: Difficulty;
  topic: string;
  module: number | null;
  prompt: string;
  content: Record<string, unknown>;
  answer: Record<string, unknown>;
  explanation: string;
  author: { id: string; name: string } | null;
  submittedAt: string | null;
  updatedAt: string;
};

// GET /admin/questions/:id
export type QuestionDetail = {
  id: string;
  course: string;
  starId: string | null;
  pool: "exam" | "challenge" | null;
  visible: boolean;
  answers: number;
  published: QuestionVersionData | null;
  open: QuestionVersionData | null;
  history: { number: number; status: VersionStatus; author: string | null; createdAt: string; submittedAt: string | null; answers: number }[];
  reviews: { version: number; decision: "approved" | "rejected"; comment: string | null; reviewer: string | null; createdAt: string }[];
};

// ---------- Alumnos del panel (GET /admin/students) ----------

export type StudentRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastActiveOn: string | null;
  streak: number;
  courses: { key: string; name: string; lit: number; total: number; passed: boolean }[];
};

export type StudentsPage = {
  students: StudentRow[];
  total: number;
  courses: { key: string; name: string; count: number }[]; // los cursos para filtrar (el docente, los suyos)
  nextOffset: number | null;
};

// El examen de un curso, con el estado que ve el alumno (ExamState) más lo que suma la ficha
export type StudentExam =
  | ({ status: "locked" } | { status: "waiting"; opensAt: string } | { status: "open" } | { status: "in_progress" }
      | { status: "retry_wait"; opensAt: string; lastCorrect: number } | { status: "passed"; correctCount: number }) & {
      attempts: number;
      passedAt: string | null;
      couponPercent: number | null;
    };

export type StudentCourse = {
  key: string;
  name: string;
  status: "active" | "revoked";
  manual: boolean; // dado desde el panel (no comprado)
  revokedAt: string | null;
  lit: number;
  total: number;
  // Dónde va: la primera lección que no encendió (null si las encendió todas)
  current: { module: number | null; moduleTitle: string | null; lesson: string; index: number; of: number } | null;
  modules: { number: number | null; title: string | null; lessons: { title: string; lit: boolean }[] }[];
  exam: StudentExam | null;
};

export type StudentDetail = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  deletedAt: string | null;
  totalXp: number;
  lastActiveOn: string | null;
  streak: number;
  courses: StudentCourse[];
  challenges: { publishedAt: string; correct: number | null; total: number | null; finished: boolean; played: boolean }[];
  // Solo con users:manage
  access?: { hasPassword: boolean; linkUntil: string | null };
  auditCount?: number;
  courseOptions?: { key: string; name: string }[];
};

// ---------- Cupones del panel (GET /admin/coupons) ----------

export type AdminCouponStatus = "live" | "used" | "expired" | "void";

export type AdminCoupon = {
  id: string;
  code: string;
  percent: number;
  source: "constellation" | "shop" | "manual";
  course: string | null; // el curso, si es del examen
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  status: AdminCouponStatus;
  user: { id: string; name: string; email: string };
  reason: string | null; // el motivo, si es de regalo
  void: { at: string; reason: string; by: string | null } | null;
};

export type AdminCouponsPage = {
  coupons: AdminCoupon[];
  counts: Record<AdminCouponStatus | "all", number>;
  nextOffset: number | null;
};

// ---------- Desafíos del panel (GET /admin/challenges) ----------

export type ChallengeNumbers = { started: number; finished: number; average: number | null };

export type ChallengesOverview = {
  settings: SettingInfo[];
  current: { publishedAt: string; closesAt: string } & ChallengeNumbers;
  upcoming: string[];
  past: ({ publishedAt: string } & ChallengeNumbers)[];
  bank: { key: string; name: string; easy: number; medium: number; hard: number }[];
};
