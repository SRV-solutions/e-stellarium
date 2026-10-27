import { useState } from "react";
import form from "../AuthLayout/authForm.module.css";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  error?: string;
  hint?: string;
};

export function PasswordField({ id, label, value, onChange, autoComplete, error, hint }: Props) {
  const [visible, setVisible] = useState(false);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={form.field}>
      <label htmlFor={id} className={form.label}>{label}</label>
      <div className={form.passwordRow}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className={`${form.input} ${error ? form.inputError : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className={form.toggle}
          onClick={() => setVisible((v) => !v)}
          aria-controls={id}
        >
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {error ? (
        <span id={`${id}-error`} className={form.fieldError}>{error}</span>
      ) : (
        hint && <span id={`${id}-hint`} className={form.hint}>{hint}</span>
      )}
    </div>
  );
}