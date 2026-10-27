import { useState, type SubmitEvent } from "react";
import { Link } from "react-router";
import { api } from "../../lib/api";
import { AuthLayout } from "../../components/AuthLayout/AuthLayout";
import form from "../../components/AuthLayout/authForm.module.css";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    if (!email.trim()) {
      setEmailError("Escribí tu email.");
      return;
    }
    setEmailError(null);

    setSubmitting(true);
    try {
      const data = await api<{ message: string }>("/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSentMessage(data.message);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Algo salió mal. Probá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className={form.title}>¿Olvidaste tu contraseña?</h1>
      <p className={form.intro}>Escribí el email con el que compraste tu curso y te mandamos un link para cambiarla.</p>

      {sentMessage ? (
        <p className={form.success} role="status">{sentMessage}</p>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          {formError && <p className={form.formError} role="alert">{formError}</p>}

          <div className={form.field}>
            <label htmlFor="email" className={form.label}>Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="tunombre@gmail.com"
              className={`${form.input} ${emailError ? form.inputError : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError && <span id="email-error" className={form.fieldError}>{emailError}</span>}
          </div>

          <button type="submit" className={form.submit} disabled={submitting}>
            {submitting ? "Enviando..." : "Enviar link"}
          </button>
        </form>
      )}

      <Link to="/login" className={form.link}>Volver a entrar</Link>
    </AuthLayout>
  );
}