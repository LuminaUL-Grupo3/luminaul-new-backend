import { CodeMail } from './mail-sender';

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

interface CodeMailCopy {
  subject: string;
  heading: string;
  intro: string;
  ignoreNote: string;
}

const VERIFICATION_COPY: CodeMailCopy = {
  subject: 'Verifica tu cuenta de LuminaUL',
  heading: 'Verifica tu correo institucional',
  intro: 'Usa este código para activar tu cuenta de LuminaUL:',
  ignoreNote: 'Si no creaste una cuenta en LuminaUL, puedes ignorar este correo.',
};

const PASSWORD_RESET_COPY: CodeMailCopy = {
  subject: 'Restablece tu contraseña de LuminaUL',
  heading: 'Restablece tu contraseña',
  intro: 'Usa este código para crear una nueva contraseña en LuminaUL:',
  ignoreNote:
    'Si no pediste restablecer tu contraseña, ignora este correo: tu contraseña actual sigue vigente.',
};

export function renderVerificationCodeMail(mail: CodeMail): RenderedMail {
  return renderCodeMail(mail, VERIFICATION_COPY);
}

export function renderPasswordResetMail(mail: CodeMail): RenderedMail {
  return renderCodeMail(mail, PASSWORD_RESET_COPY);
}

// Hora de vencimiento en la zona horaria de la universidad
function formatExpiry(expiresAt: Date): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
  }).format(expiresAt);
}

// El nombre lo escribe el usuario al registrarse: se escapa antes de insertarlo en el HTML
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCodeMail(mail: CodeMail, copy: CodeMailCopy): RenderedMail {
  const expiry = `El código vence a las ${formatExpiry(mail.expiresAt)} (hora de Lima) y solo puede usarse una vez.`;
  const greeting = `Hola, ${mail.name}:`;

  const text = [
    greeting,
    '',
    copy.intro,
    '',
    `    ${mail.code}`,
    '',
    expiry,
    'Nunca te pediremos este código por teléfono ni por chat.',
    '',
    copy.ignoreNote,
    '',
    '— LuminaUL · Universidad de Lima',
  ].join('\n');

  // Estilos en línea y tablas: muchos clientes de correo ignoran <style> y CSS moderno
  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#2c352e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4ef;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e8e5dc;border-radius:12px;">
            <tr>
              <td style="padding:28px 28px 8px;font-size:20px;font-weight:bold;color:#2c352e;">
                Lumina<span style="color:#c7471f;">UL</span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 0;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#2c352e;">${copy.heading}</h1>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">${copy.intro}</p>
                <p style="margin:0 0 20px;padding:16px;background:#fff1e6;border-radius:8px;text-align:center;font-size:30px;font-weight:bold;letter-spacing:8px;color:#b43d19;font-family:'Courier New',monospace;">${mail.code}</p>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#5f6a58;">${expiry}</p>
                <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#5f6a58;">Nunca te pediremos este código por teléfono ni por chat.</p>
                <p style="margin:0 0 28px;font-size:12px;line-height:1.6;color:#8a9180;">${copy.ignoreNote}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #eeeee6;font-size:11px;color:#8a9180;">
                LuminaUL · Universidad de Lima
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: copy.subject, text, html };
}
