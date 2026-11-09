export type User = {
  id: string;
  email: string;
  name: string;
  alias: string;
  role: "student" | "admin";
  totalXp: number;
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
  | { status: "retry_wait"; opensAt: string; lastCorrect: number } // no aprobó, faltan los 2 días
  | { status: "passed"; correctCount: number };

// couponPercent: el descuento que ganaría si aprueba ahora
export type ExamSummary = ExamState & { couponPercent: number };

export type Constellation = {
  id: string;
  name: string;
  description: string | null;
  course: { key: string; name: string };
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
    completed: boolean;
  };
  course: { key: string; name: string };
  nextStar: { id: string; title: string; kind: StarKind; position: number } | null;
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

