import styles from "./StarReadout.module.css";

// La letra grande del visor. Si lleva número (κ²), el número va más chico, arriba, sin pisar el texto de al lado
export function BigLetter({ letter }: { letter: string }) {
  const [base, ...index] = [...letter];
  return (
    <div className={styles.letter} aria-hidden="true">
      {base}
      {index.length > 0 && <span className={styles.letterIndex}>{index.join("")}</span>}
    </div>
  );
}
