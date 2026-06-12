import { Resend } from 'resend';

/**
 * Shared Resend client singleton.
 *
 * Requires RESEND_API_KEY environment variable.
 * Falls back to NO-OP mode if the key is not set,
 * so the app doesn't crash during local development.
 */
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS = process.env.EMAIL_FROM || 'noreply@example.com';

/**
 * Send a password reset email.
 *
 * @param {string} to — recipient email
 * @param {string} resetUrl — full reset link with token
 * @returns {Promise<boolean>} whether the email was sent
 */
export async function sendPasswordResetEmail(to, resetUrl) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping email send');
    console.warn(`[email] Would have sent reset link to ${to}: ${resetUrl}`);
    return false;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: 'Reset your password — ElianApp',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9f9f9; margin: 0; padding: 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; margin: 0 auto; padding: 32px 16px;">
            <tr>
              <td style="text-align: center; padding-bottom: 24px;">
                <h1 style="font-size: 28px; font-weight: 900; letter-spacing: -0.05em; color: #1a1a2e; margin: 0;">ElianApp</h1>
              </td>
            </tr>
            <tr>
              <td style="background-color: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                <h2 style="font-size: 20px; font-weight: 700; color: #1a1a2e; margin: 0 0 12px 0;">Reset your password</h2>
                <p style="font-size: 14px; color: #666; line-height: 1.6; margin: 0 0 24px 0;">
                  We received a request to reset your password. Click the button below to choose a new one.
                  This link expires in <strong>1 hour</strong>.
                </p>
                <table cellpadding="0" cellspacing="0" style="margin: 0 auto 24px auto;">
                  <tr>
                    <td style="background-color: #1a1a2e; border-radius: 12px; padding: 14px 32px;">
                      <a href="${resetUrl}" style="color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; display: inline-block;">
                        Reset password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="font-size: 13px; color: #999; line-height: 1.5; margin: 0;">
                  If you didn't request this, you can safely ignore this email.
                  <br/>
                  <a href="${resetUrl}" style="color: #666; word-break: break-all;">${resetUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });

  if (error) {
    console.error('[email] Failed to send password reset email:', error);
    return false;
  }

  return true;
}

/**
 * Send an invite email to join a group.
 *
 * @param {string} to — recipient email
 * @param {string} inviteUrl — full invite link with token
 * @param {string} groupName — name of the group
 * @param {string} inviterName — name of the person who invited
 * @returns {Promise<boolean>} whether the email was sent
 */
export async function sendInviteEmail(to, inviteUrl, groupName, inviterName) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping email send');
    console.warn(`[email] Would have sent invite to ${to} for group "${groupName}": ${inviteUrl}`);
    return false;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `${inviterName} invited you to "${groupName}" — ElianApp`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9f9f9; margin: 0; padding: 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; margin: 0 auto; padding: 32px 16px;">
            <tr>
              <td style="text-align: center; padding-bottom: 24px;">
                <h1 style="font-size: 28px; font-weight: 900; letter-spacing: -0.05em; color: #1a1a2e; margin: 0;">ElianApp</h1>
              </td>
            </tr>
            <tr>
              <td style="background-color: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                <h2 style="font-size: 20px; font-weight: 700; color: #1a1a2e; margin: 0 0 12px 0;">You're invited!</h2>
                <p style="font-size: 14px; color: #666; line-height: 1.6; margin: 0 0 24px 0;">
                  <strong>${inviterName}</strong> invited you to join the group <strong>"${groupName}"</strong> on ElianApp.
                  Click the button below to accept and start splitting expenses.
                </p>
                <table cellpadding="0" cellspacing="0" style="margin: 0 auto 24px auto;">
                  <tr>
                    <td style="background-color: #1a1a2e; border-radius: 12px; padding: 14px 32px;">
                      <a href="${inviteUrl}" style="color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; display: inline-block;">
                        Join group
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="font-size: 13px; color: #999; line-height: 1.5; margin: 0;">
                  This link expires in <strong>7 days</strong>.
                  <br/>
                  <a href="${inviteUrl}" style="color: #666; word-break: break-all;">${inviteUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });

  if (error) {
    console.error('[email] Failed to send invite email:', error);
    return false;
  }

  return true;
}
