import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage/LoginPage";
import { HomePage } from "./pages/HomePage/HomePage";
import { SetPasswordPage } from "./pages/SetPasswordPage/SetPasswordPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage/ForgotPasswordPage";
import { ConstellationsIndex } from "./pages/ConstellationsIndex/ConstellationsIndex";
import { ConstellationPage } from "./pages/ConstellationPage/ConstellationPage";
import { GamePage } from "./pages/GamePage/GamePage";
import { ExamPage } from "./pages/ExamPage/ExamPage";
import { ReviewPage } from "./pages/ReviewPage/ReviewPage";
import { PracticePage } from "./pages/PracticePage/PracticePage";
import { ChallengesPage } from "./pages/ChallengesPage/ChallengesPage";
import { ShopPage } from "./pages/ShopPage/ShopPage";
import { AdminLayout } from "./pages/AdminPage/AdminLayout";
import { AuditPage } from "./pages/AdminPage/AuditPage";
import { PeoplePage } from "./pages/AdminPage/PeoplePage";
import { RolesPage } from "./pages/AdminPage/RolesPage";
import { EconomyPage } from "./pages/AdminPage/EconomyPage";
import { StudentsPage } from "./pages/AdminPage/StudentsPage";
import { ContentPage } from "./pages/AdminPage/ContentPage";
import { QuestionPage } from "./pages/AdminPage/QuestionPage";
import { ADMIN_SECTIONS } from "./lib/permissions";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/create-password" element={<SetPasswordPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route
            path="/constellations"
            element={
              <ProtectedRoute>
                <ConstellationsIndex />
              </ProtectedRoute>
            }
          />
          <Route
            path="/constellations/:courseKey"
            element={
              <ProtectedRoute>
                <ConstellationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stars/:starId"
            element={
              <ProtectedRoute>
                <GamePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/exams/:starId"
            element={
              <ProtectedRoute>
                <ExamPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/exams/:starId/practice"
            element={
              <ProtectedRoute>
                <PracticePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/review"
            element={
              <ProtectedRoute>
                <ReviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/challenges"
            element={
              <ProtectedRoute>
                <ChallengesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shop"
            element={
              <ProtectedRoute>
                <ShopPage />
              </ProtectedRoute>
            }
          />
          {/* El panel de staff: entra quien tenga el permiso de alguna sección, y cada sección pide el suyo */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute anyOf={ADMIN_SECTIONS.flatMap((section) => section.permissions)}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route
              path="audit"
              element={
                <ProtectedRoute anyOf={["audit:view", "integrity:view"]}>
                  <AuditPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="people"
              element={
                <ProtectedRoute anyOf={["roles:manage"]}>
                  <PeoplePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="roles"
              element={
                <ProtectedRoute anyOf={["roles:manage"]}>
                  <RolesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="students"
              element={
                <ProtectedRoute anyOf={["students:view"]}>
                  <StudentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="content"
              element={
                <ProtectedRoute anyOf={["content:edit", "content:approve"]}>
                  <ContentPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="content/:id"
              element={
                <ProtectedRoute anyOf={["content:edit", "content:approve"]}>
                  <QuestionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="economy"
              element={
                <ProtectedRoute anyOf={["economy:edit"]}>
                  <EconomyPage />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}