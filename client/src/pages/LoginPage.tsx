import { useState, type SubmitEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useAuth } from "../auth/useAuth";
import { BrandGauge } from "../components/BrandGauge";
import logo from "../assets/logo-srv.png";
import styles from "./LoginPage.module.css";
import { SUPPORT_HREF } from "../config";

type FieldErrors = { email?: string; password?: string };

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <main className={styles.screen}>
      <section className={styles.sky}>
        <svg className={styles.stars} aria-hidden="true">
          <circle cx="12%" cy="18%" r="1.2" opacity=".7" />
          <circle cx="28%" cy="9%" r="1" opacity=".5" />
          <circle cx="47%" cy="22%" r="1.4" opacity=".6" />
          <circle cx="71%" cy="12%" r="1" opacity=".4" />
          <circle cx="86%" cy="27%" r="1.3" opacity=".6" />
          <circle cx="9%" cy="54%" r="1" opacity=".4" />
          <circle cx="91%" cy="58%" r="1.1" opacity=".5" />
          <circle cx="18%" cy="78%" r="1.3" opacity=".5" />
          <circle cx="62%" cy="84%" r="1" opacity=".4" />
          <circle cx="80%" cy="92%" r="1.2" opacity=".6" />
          <circle cx="38%" cy="66%" r=".9" opacity=".35" />
          <circle cx="55%" cy="45%" r=".9" opacity=".3" />
        </svg>

        <div className={styles.brand}>
          <img src={logo} alt="" className={styles.brandLogo} />
          E-Stellarium
        </div>

        <div className={styles.gaugeWrap}>
          <BrandGauge />
        </div>

        <div className={styles.tagline}>
          <p>Practicá lo que aprendiste en tus cursos de SRV.</p>
          <small>
            Cada desafío que resolvés suma experiencia. Al subir de nivel ganás descuentos para tu próximo
            curso.
          </small>
        </div>
      </section>

      <section className={styles.access}>
        <div className={styles.formBox}>
          <h1 className={styles.title}>Entrá a E-Stellarium</h1>
          <p className={styles.intro}>Usá el email con el que compraste tu curso.</p>

          <form onSubmit={handleSubmit} noValidate>
            {formError && (
              <p className={styles.formError} role="alert">
                {formError}
              </p>
            )}

            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="tunombre@gmail.com"
                className={`${styles.input} ${fieldErrors.email ? styles.inputError : ""}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email && (
                <span id="email-error" className={styles.fieldError}>{fieldErrors.email}</span>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="password" className={styles.label}>Contraseña</label>
              <div className={styles.passwordRow}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className={`${styles.input} ${fieldErrors.password ? styles.inputError : ""}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  className={styles.toggle}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-controls="password"
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              {fieldErrors.password && (
                <span id="password-error" className={styles.fieldError}>{fieldErrors.password}</span>
              )}
            </div>

            <button type="submit" className={styles.submit} disabled={submitting}>
              {submitting ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <Link to="/olvide-mi-contrasena" className={styles.forgot}>
            Olvidé mi contraseña
          </Link>

          <div className={styles.noAccount}>
            <strong>¿No tenés cuenta?</strong> Se crea sola cuando comprás un curso en{" "}
            <a href="https://wearesrv.com">wearesrv.com</a>, y te llega un mail para elegir tu contraseña.
            Si compraste y no te llegó, <a href={SUPPORT_HREF}>escribinos a soporte</a>.
          </div>
        </div>
      </section>
    </main>
  );
}