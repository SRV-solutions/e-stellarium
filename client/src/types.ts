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
};

export type Constellation = {
  id: string;
  name: string;
  description: string | null;
  course: { key: string; name: string };
  completedStars: number;
  totalStars: number;
  stars: StarSummary[];
};

// attempt: cuántas veces la respondió el alumno. Se devuelve al responder, para corregir con la misma mezcla
type QuestionBase = {
  id: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  attempt: number;
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

