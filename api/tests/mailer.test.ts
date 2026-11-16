import { afterEach, describe, expect, it, vi } from "vitest";

// El setup reemplaza el mailer por uno falso: acá traemos el verdadero
const { sendMail } = await vi.importActual<typeof import("../src/lib/mailer.js")>("../src/lib/mailer.js");

const mail = { to: "alumno@example.com", subject: "Hola", html: "<p>Hola</p>" };

describe("sendMail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sin RESEND_API_KEY no llama a Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await sendMail(mail);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con RESEND_API_KEY lo manda por Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_clave");
    vi.stubEnv("MAIL_FROM", "E-Stellarium <no-reply@wearesrv.com>");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await sendMail(mail);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_clave");
    expect(JSON.parse(init.body)).toEqual({
      from: "E-Stellarium <no-reply@wearesrv.com>",
      to: ["alumno@example.com"],
      subject: "Hola",
      html: "<p>Hola</p>",
    });
  });

  it("si Resend responde con error, falla", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_clave");
    vi.stubEnv("MAIL_FROM", "x <x@wearesrv.com>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "dominio sin verificar" }));
    await expect(sendMail(mail)).rejects.toThrow("Resend respondió 403");
  });
});
