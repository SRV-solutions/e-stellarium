import { THEME_SWATCH } from "../../lib/theme";
import type { ThemeId } from "../../types";
import styles from "./ThemeSwatch.module.css";

// La muestra de un tema: un cuadradito con su fondo, una superficie y su línea. Lo usan la tienda y el inventario.
export function ThemeSwatch({ id }: { id: string }) {
  const colors = THEME_SWATCH[id as ThemeId] ?? THEME_SWATCH.marino;
  return (
    <span className={styles.swatch} style={{ background: colors.night, borderColor: colors.line }} aria-hidden="true">
      <i className={styles.surface} style={{ background: colors.surface, borderColor: colors.line }} />
      <i className={styles.line} style={{ background: colors.line }} />
    </span>
  );
}
