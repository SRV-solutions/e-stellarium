import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../../auth/useAuth";
import { api } from "../../lib/api";
import { AuthLayout } from "../../components/AuthLayout/AuthLayout";
import { PasswordField } from "../../components/PasswordField/PasswordField";
import form from "../../components/AuthLayout/authForm.module.css";

type TokenType = "set_password" | "reset_password";
type Status = "checking" | "invalid" | "ready";
type FieldErrors = { password?: string; confirm?: string };

const MIN = 8;
const MAX_BYTES = 72;

const TEXTS: Record<TokenType, { title: string; intro: string }> = {
  set_password: {
    title: "Elegí tu contraseña",
    intro: "Es la que vas a usar para entrar a E-Stellarium, junto con tu email.",
  },
  reset_password: {
    title: "Cambiá tu contraseña",
    intro: "Elegí una contraseña nueva para tu cuenta.",
  },
};

export function SetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { setPassword } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status>("checking");
  const [type, setType] = useState<TokenType>("set_password");
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Al cargar, verificamos el link antes de mostrar el formulario
  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    api<{ type: TokenType }>(`/auth/password/check?token=${encodeURIComponent(token)}`)
      .then((data) => {
        setType(data.type);
        setStatus("ready");
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {};
    if (password.length < MIN) {
      errors.password = `Tiene que tener al menos ${MIN} caracteres.`;
    } else if (new TextEncoder().encode(password).length > MAX_BYTES) {
      errors.password = "Es demasiado larga.";
    }
    if (confirm !== password) errors.confirm = "Las contraseñas no coinciden.";
    setFieldErrors(errors);
    if (errors.password || errors.confirm) return;

    setSubmitting(true);
    try {
      await setPassword(token, password);
      navigate("/", { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Algo salió mal. Probá de nuevo.");
      setSubmitting(false);
    }
  }

  if (status === "checking") {
    return (
      <AuthLayout>
        <p className={form.intro} role="status">Verificando el link...</p>
      </AuthLayout>
    );
  }

  if (status === "invalid") {
    return (
      <AuthLayout>
        <h1 className={form.title}>Este link ya no sirve</h1>
        <p className={form.intro}>
          Puede que haya vencido o que ya lo hayas usado. Pedí uno nuevo y te llega al mail en un momento.
        </p>
        <Link to="/forgot-password" className={form.submit}>Pedir un link nuevo</Link>
        <Link to="/login" className={form.link}>Volver a entrar</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className={form.title}>{TEXTS[type].title}</h1>
      <p className={form.intro}>{TEXTS[type].intro}</p>

      <form onSubmit={handleSubmit} noValidate>
        {formError && <p className={form.formError} role="alert">{formError}</p>}

        <PasswordField
          id="password"
          label="Contraseña nueva"
          value={password}
          onChange={setPasswordValue}
          autoComplete="new-password"
          error={fieldErrors.password}
          hint={`Al menos ${MIN} caracteres.`}
        />

        <PasswordField
          id="confirm"
          label="Repetí la contraseña"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          error={fieldErrors.confirm}
        />

        <button type="submit" className={form.submit} disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar y entrar"}
        </button>
      </form>
    </AuthLayout>
  );
}