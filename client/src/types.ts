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