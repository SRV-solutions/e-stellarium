import { useState, type SubmitEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useAuth } from "../../auth/useAuth";
import { SUPPORT_HREF } from "../../config";
import { AuthLayout } from "../../components/AuthLayout/AuthLayout";
import { PasswordField } from "../../components/PasswordField/PasswordField";
import form from "../../components/AuthLayout/authForm.module.css";

type FieldErrors = { email?: string; password?: string };

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = "Escribí tu email.";
    if (!password) errors.password = "Escribí tu contraseña.";
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Algo salió mal. Probá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className={form.title}>Entrá a E-Stellarium</h1>
      <p className={form.intro}>Usá el email con el que compraste tu curso.</p>

      <form onSubmit={handleSubmit} noValidate>
        {formError && <p className={form.formError} role="alert">{formError}</p>}

        <div className={form.field}>
          <label htmlFor="email" className={form.label}>Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="tunombre@gmail.com"
            className={`${form.input} ${fieldErrors.email ? form.inputError : ""}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
          />
          {fieldErrors.email && (
            <span id="email-error" className={form.fieldError}>{fieldErrors.email}</span>
          )}
        </div>

        <PasswordField
          id="password"
          label="Contraseña"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={fieldErrors.password}
        />

        <button type="submit" className={form.submit} disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <Link to="/forgot-password" className={form.link}>Olvidé mi contraseña</Link>

      <div className={form.footnote}>
        <strong>¿No tenés cuenta?</strong> Se crea sola cuando comprás un curso en{" "}
        <a href="https://wearesrv.com">wearesrv.com</a>, y te llega un mail para elegir tu contraseña. Si
        compraste y no te llegó, <a href={SUPPORT_HREF}>escribinos a soporte</a>.
      </div>
    </AuthLayout>
  );
}