import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router";
import { api, ApiError } from "../../lib/api";
import { burst, centerOf, travel } from "../../lib/effects";
import { MiniConstellation, type StepResult } from "../../components/MiniConstellation/MiniConstellation";
import { ChoiceGame } from "../GamePage/games/ChoiceGame";
import { FillBlankGame } from "../GamePage/games/FillBlankGame";
import { OrderLinesGame } from "../GamePage/games/OrderLinesGame";
import { Verdict } from "../GamePage/Verdict/Verdict";
import { KIND } from "../GamePage/kinds";
import type { AnswerResponse, AnswerResult, Demo, DemoAnswer, StudentQuestion } from "../../types";
import gameStyles from "../GamePage/GamePage.module.css";
import styles from "./DemoPage.module.css";

const SRV_WEB = "https://wearesrv.com";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; demo: Demo };

// La demo para invitados: una estrella de prueba de Python, sin cuenta. No se guarda nada;
// al final se puede dejar el email para recibir un cupón por mail
export function DemoPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  // Cada vez que sube, se pide una partida nueva ("Jugar de nuevo")
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<Demo>("/demo")
      .then((demo) => !cancelled && setState({ status: "ready", demo }))
      .catch((err) => {
        if (cancelled) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : "No pudimos abrir la demo." });
      });
    return () => {
      cancelled = true;
    };
  }, [round]);

  if (state.status === "loading") {
    return (
      <p className={gameStyles.message} role="status">
        Preparando la estrella...
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p className={gameStyles.message} role="alert">
        {state.message} <Link to="/login">Volver</Link>
      </p>
    );
  }
  return (
    <DemoFlow
      key={state.demo.demoId}
      demo={state.demo}
      onAgain={() => {
        setState({ status: "loading" });
        setRound((r) => r + 1);
      }}
    />
  );
}

type Phase = "intro" | "play" | "lead" | "sent";

function DemoFlow({ demo, onAgain }: { demo: Demo; onAgain: () => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [correctCount, setCorrectCount] = useState(0);
  const [sentTo, setSentTo] = useState("");

  if (phase === "intro") return <Intro demo={demo} onStart={() => setPhase("play")} />;
  if (phase === "play") {
    return (
      <DemoGame
        demo={demo}
        onFinish={(count) => {
          setCorrectCount(count);
          setPhase("lead");
        }}
      />
    );
  }
  if (phase === "lead") {
    return (
      <Lead
        demo={demo}
        correctCount={correctCount}
        onAgain={onAgain}
        onSent={(email) => {
          setSentTo(email);
          setPhase("sent");
        }}
      />
    );
  }
  return <Sent demo={demo} email={sentTo} />;
}

function Intro({ demo, onStart }: { demo: Demo; onStart: () => void }) {
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    start.current?.focus();
  }, []);

  return (
    <main className={`${styles.screen} ${styles.introScreen}`}>
      <div className={styles.inner}>
        <div className={styles.letter} aria-hidden="true">
          α
        </div>
        <p className={styles.kicker}>Estrella de prueba</p>
        <h1 className={styles.title}>Probá E-Stellarium</h1>
        <p className={styles.lead}>Jugá una estrella de Python, igual que los alumnos. Sin cuenta y sin pagar nada.</p>
        <ul className={styles.facts}>
          <li>
            <b>{demo.questions.length} juegos</b> de Python
          </li>
          <li>Sin reloj</li>
          <li>
            Al final, un <b>cupón del {demo.coupon.percent} %</b>
          </li>
        </ul>
        <div className={styles.buttons}>
          <button ref={start} type="button" className={styles.go} onClick={onStart}>
            Empezar
          </button>
        </div>
        <p className={styles.login}>
          ¿Ya sos alumno? <Link to="/login">Entrá a tu cuenta</Link>
        </p>
      </div>
    </main>
  );
}

function Lead({
  demo,
  correctCount,
  onAgain,
  onSent,
}: {
  demo: Demo;
  correctCount: number;
  onAgain: () => void;
  onSent: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    if (!email.trim()) {
      setError("Escribí tu email.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api("/demo/coupon", { method: "POST", body: JSON.stringify({ email }) });
      onSent(email.trim().toLowerCase());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos pedir el cupón. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={styles.screen}>
      <div className={`${styles.inner} ${styles.wide}`}>
        <div className={styles.letter} aria-hidden="true">
          α
        </div>
        <p className={styles.kicker}>Estrella de prueba</p>
        <h1 className={styles.title}>¡Encendiste tu primera estrella!</h1>
        <p className={styles.score}>
          Acertaste <b>{correctCount}</b> de {demo.questions.length}.
        </p>
        <p className={styles.hint}>
          Dejá tu email y te mandamos un cupón del <b>{demo.coupon.percent} %</b> para tu primera compra en WeAreSRV.
          Vale {demo.coupon.hours} horas.
        </p>
        <form className={styles.form} onSubmit={submit} noValidate>
          <label htmlFor="demo-email">Tu email</label>
          <div className={styles.row}>
            <input
              id="demo-email"
              type="email"
              autoComplete="email"
              placeholder="nombre@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error !== null}
              aria-describedby={error ? "demo-error" : undefined}
            />
            <button type="submit" className={styles.go} disabled={sending}>
              {sending ? "Enviando..." : "Quiero mi cupón"}
            </button>
          </div>
          {error && (
            <p id="demo-error" className={styles.error} role="alert">
              {error}
            </p>
          )}
          <p className={styles.small}>
            Un cupón por email. No guardamos tu progreso: si después comprás, empezás tu constelación desde cero.
          </p>
        </form>
        <div className={styles.buttons}>
          <button type="button" className={styles.ghost} onClick={onAgain}>
            Jugar de nuevo
          </button>
        </div>
      </div>
    </main>
  );
}

function Sent({ demo, email }: { demo: Demo; email: string }) {
  return (
    <main className={styles.screen}>
      <div className={`${styles.inner} ${styles.wide}`}>
        <div className={`${styles.letter} ${styles.mint}`} aria-hidden="true">
          α
        </div>
        <p className={`${styles.kicker} ${styles.mintText}`}>Cupón en camino</p>
        <h1 className={styles.title}>Revisá tu mail</h1>
        <p className={styles.score} role="status">
          Te lo mandamos a <b>{email}</b>.
        </p>
        <p className={styles.hint}>
          Es del {demo.coupon.percent} % y vale {demo.coupon.hours} horas desde ahora. Si no lo ves, fijate en spam.
        </p>
        <div className={styles.buttons}>
          <a className={styles.go} href={SRV_WEB}>
            Ver los cursos
          </a>
        </div>
      </div>
    </main>
  );
}

function DemoGame({ demo, onFinish }: { demo: Demo; onFinish: (correctCount: number) => void }) {
  const { questions } = demo;
  const [results, setResults] = useState<(StepResult | undefined)[]>(() => questions.map(() => undefined));
  const [step, setStep] = useState(0);
  const [landing, setLanding] = useState<number | null>(null);
  const [response, setResponse] = useState<AnswerResponse | null>(null);
  const [answer, setAnswer] = useState<DemoAnswer | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Los juegos esperan una pregunta de estrella: la demo no usa attempt ni solved
  const question = { ...questions[step]!, attempt: 0, solved: false } as StudentQuestion;
  // Y un resultado de estrella: en la demo no hay XP ni insignias
  const result: AnswerResult | null = answer && {
    ...answer,
    xpGained: 0,
    starXp: 0,
    starCompleted: false,
    newBadges: [],
  };

  async function check() {
    if (!response || checking) return;
    setChecking(true);
    setError(null);
    try {
      const graded = await api<DemoAnswer>("/demo/answer", {
        method: "POST",
        body: JSON.stringify({ demoId: demo.demoId, questionId: question.id, response }),
      });
      // flushSync aplica estos cambios ya, así la pantalla muestra el veredicto antes de animar
      flushSync(() => {
        setAnswer(graded);
        setResults((previous) => {
          const next = [...previous];
          next[step] = graded.correct ? "ok" : "bad";
          return next;
        });
        setLanding(step);
      });
      animateVerdict(graded.correct, step);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos comprobar tu respuesta. Probá de nuevo.");
    } finally {
      setChecking(false);
    }
  }

  // Igual que en las estrellas: si acertó, una chispa viaja hasta su estrellita y la enciende
  function animateVerdict(correct: boolean, landed: number) {
    const land = () => setLanding((current) => (current === landed ? null : current));
    const origin = document.querySelector("[data-answer]");
    const target = document.querySelector(`[data-step="${landed}"]`);
    if (!correct) {
      setTimeout(land, 350);
      return;
    }
    if (!origin || !target) {
      land();
      return;
    }
    burst(centerOf(origin), "#bdf5dc");
    travel(centerOf(origin), centerOf(target), () => {
      land();
      burst(centerOf(target), "#ffffff", 10);
    });
  }

  function next() {
    if (step + 1 >= questions.length) {
      onFinish(results.filter((r) => r === "ok").length);
      return;
    }
    setResponse(null);
    setAnswer(null);
    setLanding(null);
    setStep(step + 1);
  }

  return (
    <div className={gameStyles.page}>
      <header className={gameStyles.wrap}>
        <div className={gameStyles.top}>
          <Link to="/login" className={gameStyles.close} aria-label="Salir de la demo">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
          <MiniConstellation
            total={questions.length}
            current={step}
            results={results.map((r, i) => (i === landing ? undefined : r))}
          />
          <span className={styles.free}>Sin cuenta</span>
        </div>
        <p className={gameStyles.where}>
          <b className={styles.kickerInline}>Estrella de prueba</b>, pregunta {step + 1} de {questions.length}
        </p>
      </header>

      <main className={gameStyles.wrap}>
        <div className={gameStyles.stage} key={question.id}>
          <p className={gameStyles.kind}>{KIND[question.type]}</p>
          <h1 className={gameStyles.prompt}>{question.prompt}</h1>
          {(question.type === "output" || question.type === "multiple_choice") && (
            <ChoiceGame
              question={question}
              response={response as { choice: number } | null}
              onChange={setResponse}
              result={result}
            />
          )}
          {question.type === "fill_blank" && <FillBlankGame question={question} onChange={setResponse} result={result} />}
          {question.type === "order_lines" && (
            <OrderLinesGame question={question} onChange={setResponse} result={result} />
          )}
        </div>
      </main>

      {result ? (
        <Verdict result={result} onNext={next} missTitle="No era esa" />
      ) : (
        <div className={gameStyles.dock}>
          <div className={gameStyles.wrap}>
            {error && (
              <p className={gameStyles.error} role="alert">
                {error}
              </p>
            )}
            <button type="button" className={gameStyles.go} disabled={response === null || checking} onClick={check}>
              {checking ? "Comprobando..." : "Comprobar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
