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
  position: number;
  kind: StarKind;
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