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