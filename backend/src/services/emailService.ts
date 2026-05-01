import nodemailer from 'nodemailer';

// ============================================
// TRANSPORTER SETUP
// ============================================

function createTransporter() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    // Production: swap Ethereal for your real SMTP provider
    // Recommended: Resend (resend.com) or Brevo — both have generous free tiers
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Development: Ethereal (fake SMTP, preview URLs logged to console)
  return null; // lazy-initialized below
}

let _transporter: nodemailer.Transporter | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (_transporter) return _transporter;

  if (process.env.NODE_ENV === 'production') {
    _transporter = createTransporter()!;
  } else {
    const testAccount = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('📧 Ethereal test account ready');
  }

  return _transporter;
}

// ============================================
// EMAIL TEMPLATES
// ============================================

const FROM = `"Proxima" <noreply@proxima.ng>`;

const baseStyle = `
  font-family: Arial, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  color: #333;
`;

function wrapTemplate(body: string): string {
  return `
    <div style="${baseStyle}">
      <div style="background: #1a1a2e; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 24px;">Proxima</h1>
        <p style="color: #aaa; margin: 4px 0 0; font-size: 13px;">Find your next home</p>
      </div>
      <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        ${body}
      </div>
      <p style="text-align: center; font-size: 12px; color: #aaa; margin-top: 16px;">
        © ${new Date().getFullYear()} Proxima Technologies Ltd · Lagos, Nigeria
      </p>
    </div>
  `;
}

// ============================================
// EMAIL FUNCTIONS
// ============================================

/**
 * OTP verification email — sent to renters and agents during login/signup
 */
export async function sendOTPEmail(email: string, otp: string): Promise<void> {
  const transporter = await getTransporter();

  const html = wrapTemplate(`
    <h2 style="margin-top: 0;">Your verification code</h2>
    <p style="color: #666;">Enter this code to continue. It expires in <strong>10 minutes</strong>.</p>
    <div style="background: #f4f4f4; padding: 24px; text-align: center; border-radius: 8px; margin: 24px 0;">
      <span style="font-size: 48px; font-weight: bold; letter-spacing: 12px; color: #1a1a2e;">${otp}</span>
    </div>
    <p style="font-size: 13px; color: #999;">If you didn't request this, you can safely ignore this email.</p>
  `);

  const info = await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `${otp} is your Proxima verification code`,
    html,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('📧 OTP email preview:', nodemailer.getTestMessageUrl(info));
  }
}

/**
 * Account claim email — sent when admin creates an agent account on their behalf.
 * The agent uses this link to set their password and activate the account.
 */
export async function sendAccountClaimEmail(
  email: string,
  name: string,
  claimUrl: string
): Promise<void> {
  const transporter = await getTransporter();

  const html = wrapTemplate(`
    <h2 style="margin-top: 0;">Welcome to Proxima, ${name}!</h2>
    <p>An account has been created for you on <strong>Proxima</strong> — Nigeria's property rental marketplace.</p>
    <p>Your listings will reach thousands of renters across Lagos, Abuja, and beyond. Click below to set your password and activate your agent account:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${claimUrl}"
         style="background: #1a1a2e; color: #fff; padding: 14px 32px; border-radius: 6px;
                text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
        Activate My Account
      </a>
    </div>
    <p style="font-size: 13px; color: #999;">
      This link expires in <strong>48 hours</strong>. If you weren't expecting this email,
      please ignore it — no account will be activated without your action.
    </p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    <p style="font-size: 13px; color: #666;">
      Questions? Reply to this email or reach us on WhatsApp.
    </p>
  `);

  const info = await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Activate your Proxima agent account',
    html,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('📧 Account claim email preview:', nodemailer.getTestMessageUrl(info));
  }
}

/**
 * Password reset email — for agents/renters who forgot their password
 */
export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetUrl: string
): Promise<void> {
  const transporter = await getTransporter();

  const html = wrapTemplate(`
    <h2 style="margin-top: 0;">Reset your password</h2>
    <p>Hi ${name}, we received a request to reset your Proxima password.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetUrl}"
         style="background: #1a1a2e; color: #fff; padding: 14px 32px; border-radius: 6px;
                text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
        Reset Password
      </a>
    </div>
    <p style="font-size: 13px; color: #999;">
      This link expires in <strong>1 hour</strong>. If you didn't request a reset,
      you can safely ignore this email — your password won't change.
    </p>
  `);

  const info = await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Reset your Proxima password',
    html,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('📧 Password reset email preview:', nodemailer.getTestMessageUrl(info));
  }
}

/**
 * Agent verification approved email
 */
export async function sendVerificationApprovedEmail(
  email: string,
  name: string
): Promise<void> {
  const transporter = await getTransporter();

  const html = wrapTemplate(`
    <h2 style="margin-top: 0;">You're verified! 🎉</h2>
    <p>Hi ${name}, your Proxima agent profile has been verified.</p>
    <p>You can now:</p>
    <ul style="color: #555; line-height: 1.8;">
      <li>List properties on behalf of landlords</li>
      <li>Receive booking inquiries from renters</li>
      <li>Build your verified agent reputation on Proxima</li>
    </ul>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${process.env.APP_URL}/dashboard"
         style="background: #1a1a2e; color: #fff; padding: 14px 32px; border-radius: 6px;
                text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
        Go to Dashboard
      </a>
    </div>
  `);

  const info = await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Your Proxima agent account is verified ✓',
    html,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('📧 Verification approved email preview:', nodemailer.getTestMessageUrl(info));
  }
}