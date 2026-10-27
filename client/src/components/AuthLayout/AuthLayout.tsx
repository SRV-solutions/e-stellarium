import type { ReactNode } from "react";
import { CosmicBackground } from "../CosmicBackground/CosmicBackground";
import { Orbit } from "../Orbit/Orbit";
import { BrandGauge } from "../BrandGauge/BrandGauge";
import logo from "../../assets/logo-srv.png";
import styles from "./AuthLayout.module.css";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.screen}>
      <section className={styles.sky}>
        <CosmicBackground />

        <div className={styles.brand}>
          <img src={logo} alt="" className={styles.brandLogo} />
          E-Stellarium
        </div>

        <div className={styles.gaugeWrap}>
          <Orbit />
          <div className={styles.gaugeLayer}>
            <BrandGauge />
          </div>
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
        <div className={styles.box}>{children}</div>
      </section>
    </main>
  );
}