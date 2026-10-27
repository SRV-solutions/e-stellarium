function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} en las variables de entorno`);
  return value;
}

export const config = {
  appUrl: required("APP_URL"),
};