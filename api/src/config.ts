function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} en las variables de entorno`);
  return value;
}

export const config = {
  appUrl: required("APP_URL"),
  // La clave de los HMAC de la bitácora y de los dígitos verificadores. Distinta en cada entorno
  integritySecret: required("INTEGRITY_SECRET"),
};