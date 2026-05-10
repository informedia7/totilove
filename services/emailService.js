const nodemailer = require('nodemailer');
let Resend = null;
try {
    ({ Resend } = require('resend'));
} catch (error) {
    // Keep service functional with SMTP-only mode when Resend SDK is unavailable.
    Resend = null;
}
const config = require('../config/config');

const RESEND_FALLBACK_FROM =
    config.email?.resend?.defaultFromEmail || 'onboarding@resend.dev';

class EmailService {
    constructor() {
        this.resend = null;
        this.transporter = null;
        this.primaryProvider = null;
        this.smtpConfigured = false;
        this.resendConfigured = false;
        this.fromName = process.env.SMTP_FROM_NAME || config.email?.smtp?.fromName || 'Totilove1';
        this.usingDefaultFromEmail = false;
        this.fromEmail = this.determineFromEmail();
        this.baseUrl = config.email?.baseUrl || process.env.BASE_URL || 'http://localhost:3001';
        this.isConfigured = false;
        this.init();
    }

    /**
     * Match totilove_remote: explicit from (env/config/SMTP user), else Resend sandbox sender.
     */
    determineFromEmail() {
        const configured =
            process.env.EMAIL_FROM ||
            process.env.RESEND_FROM_EMAIL ||
            config.email?.resend?.fromEmail ||
            process.env.SMTP_USER ||
            config.email?.smtp?.user ||
            '';
        const trimmed = typeof configured === 'string' ? configured.trim() : '';
        if (trimmed) {
            this.usingDefaultFromEmail = false;
            return trimmed;
        }
        this.usingDefaultFromEmail = true;
        return RESEND_FALLBACK_FROM;
    }

    init() {
        const resendApiKey = (
            process.env.RESEND_API_KEY ||
            config.email?.resend?.apiKey ||
            ''
        ).trim();

        // Configure Resend first so it can act as primary provider (key only is enough with fallback from).
        if (resendApiKey) {
            if (!Resend) {
                console.warn('⚠️ Resend SDK not installed - Resend API disabled (run: npm install resend)');
            } else {
                try {
                    this.resend = new Resend(resendApiKey);
                    this.resendConfigured = true;
                    this.primaryProvider = 'resend';
                    this.isConfigured = true;
                    if (this.usingDefaultFromEmail) {
                        console.warn(
                            '⚠️ No EMAIL_FROM / RESEND_FROM_EMAIL / SMTP_USER — using Resend fallback sender %s (set RESEND_FROM_EMAIL for production).',
                            this.fromEmail
                        );
                    }
                    console.log('✅ Email service configured with Resend API (primary)');
                } catch (error) {
                    this.resendConfigured = false;
                    console.error('❌ Failed to configure Resend API:', error.message);
                }
            }
        } else {
            console.warn('⚠️ RESEND_API_KEY not set - Resend API disabled');
        }

        // Email SMTP configuration from environment variables and config
        const emailConfig = {
            host: process.env.SMTP_HOST || config.email?.smtp?.host || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || String(config.email?.smtp?.port || '587'), 10),
            secure: process.env.SMTP_SECURE === 'true' || Boolean(config.email?.smtp?.secure),
            auth: {
                user: process.env.SMTP_USER || config.email?.smtp?.user || '',
                pass: process.env.SMTP_PASSWORD || config.email?.smtp?.password || ''
            }
        };

        // Only create transporter if credentials are provided
        if (emailConfig.auth.user && emailConfig.auth.pass) {
            try {
                this.transporter = nodemailer.createTransport(emailConfig);
                this.smtpConfigured = true;
                this.isConfigured = true;
                if (!this.primaryProvider) {
                    this.primaryProvider = 'smtp';
                    console.log('✅ Email service configured with SMTP (primary)');
                } else {
                    console.log('✅ SMTP fallback configured successfully');
                }
            } catch (error) {
                console.error('❌ Failed to configure email service:', error.message);
                this.smtpConfigured = false;
            }
        } else {
            this.smtpConfigured = false;
            console.warn('⚠️ SMTP fallback not configured - SMTP credentials missing');
            console.warn('   Set SMTP_USER and SMTP_PASSWORD environment variables to enable fallback');
        }

        if (!this.isConfigured) {
            console.warn('⚠️ Email service not configured - no provider available');
            console.warn('   Set RESEND_API_KEY (optional: RESEND_FROM_EMAIL), or SMTP_USER + SMTP_PASSWORD');
        }
    }

    buildFromAddress() {
        return `"${this.fromName}" <${this.fromEmail}>`;
    }

    getProviderOrder() {
        const providers = [];

        if (this.primaryProvider === 'resend' && this.resendConfigured) {
            providers.push('resend');
        }
        if (this.primaryProvider === 'smtp' && this.smtpConfigured) {
            providers.push('smtp');
        }

        if (this.resendConfigured && !providers.includes('resend')) {
            providers.push('resend');
        }
        if (this.smtpConfigured && !providers.includes('smtp')) {
            providers.push('smtp');
        }

        return providers;
    }

    async sendWithResend(mailOptions) {
        if (!this.resendConfigured || !this.resend) {
            throw new Error('Resend is not configured');
        }

        const response = await this.resend.emails.send({
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject,
            html: mailOptions.html,
            text: mailOptions.text
        });

        if (response && response.error) {
            throw new Error(response.error.message || 'Unknown Resend API error');
        }

        const messageId = response?.data?.id || response?.id || null;
        return { success: true, provider: 'resend', messageId };
    }

    async sendWithSmtp(mailOptions) {
        if (!this.smtpConfigured || !this.transporter) {
            throw new Error('SMTP is not configured');
        }

        const info = await this.transporter.sendMail(mailOptions);
        return { success: true, provider: 'smtp', messageId: info.messageId };
    }

    async deliverEmail(mailOptions) {
        if (!this.isConfigured) {
            return { success: false, error: 'Email service not configured' };
        }

        const providers = this.getProviderOrder();
        const errors = [];

        for (const provider of providers) {
            try {
                if (provider === 'resend') {
                    return await this.sendWithResend(mailOptions);
                }
                if (provider === 'smtp') {
                    return await this.sendWithSmtp(mailOptions);
                }
            } catch (error) {
                const providerError = `${provider}: ${error.message}`;
                errors.push(providerError);
                console.error(`❌ Email send failed via ${provider}:`, error.message);
            }
        }

        return {
            success: false,
            error: errors.length ? errors.join(' | ') : 'No email providers available'
        };
    }

    /**
     * Send email verification email (registration + resend).
     * HTML and `text` parts must stay in sync; many clients show plain text only.
     * Method 2 (numbered steps + code) renders only when `verificationCode` is passed — registration does this when `verification_code` exists on `email_verification_tokens`.
     *
     * @param {string} to - Recipient email address
     * @param {string} real_name - Username
     * @param {string} token - Verification token
     * @returns {Promise<Object>}
     */
    async sendVerificationEmail(to, real_name, token, verificationCode = null) {
        if (!this.isConfigured) {
            console.warn('⚠️ Email service not configured - cannot send verification email');
            return { success: false, error: 'Email service not configured' };
        }

        const confirmationUrl = `${this.baseUrl}/api/verify-email?token=${token}`;

        const mailOptions = {
            from: this.buildFromAddress(),
            to: to,
            subject: 'Verify Your Email Address - Totilove1',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                        .header h1 { margin: 0; color: #eab308; }
                        .button { display: inline-block; padding: 12px 30px; background: #eab308; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                        .button:hover { background: #ca8a04; }
                        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                    </style>
                </head>
                <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #ffffff;">
                    <div class="container" style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div class="header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="margin: 0; color: #eab308; font-size: 2rem; line-height: 1.2;">Welcome to Totilove1!</h1>
                        </div>
                        <div class="content" style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                            <p>Hi ${real_name},</p>
                            <p>Thank you for registering with Totilove1! To complete your registration and start connecting with others, please verify your email address using one of the methods below:</p>
                            
                            <div style="background: white; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; border: 2px solid #eab308;">
                                <h3 style="margin: 0 0 1rem 0; color: #ca8a04; font-size: 1.1rem;">Method 1: Click the Link (Easiest)</h3>
                                <div style="text-align: center; margin-bottom: 1rem;">
                                    <a href="${confirmationUrl}" class="button" style="display: inline-block; padding: 12px 30px; background: #eab308; color: #ffffff; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: 700;">Verify Email Address</a>
                                </div>
                                <p style="font-size: 0.9rem; color: #666; margin: 0;">Or copy and paste this link into your browser:</p>
                                <p style="word-break: break-all; color: #ca8a04; font-size: 0.85rem; margin: 0.5rem 0 0 0;">${confirmationUrl}</p>
                            </div>
                            
                            ${verificationCode ? `
                            <div style="background: #f0f7ff; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; border: 2px solid #4a90e2;">
                                <h3 style="margin: 0 0 1rem 0; color: #4a90e2; font-size: 1.1rem;">Method 2: Enter Verification Code</h3>
                                <p style="margin: 0 0 1rem 0; font-size: 0.95rem;">If the link doesn't work, you can verify using this 6-digit code:</p>
                                <ol style="margin: 0 0 1rem 1.25rem; padding: 0; font-size: 0.95rem; line-height: 1.65; color: #333;">
                                    <li style="margin-bottom: 0.35rem;">Login with your email and password</li>
                                    <li style="margin-bottom: 0.35rem;">Go to: Account</li>
                                    <li style="margin-bottom: 0.35rem;">Click on: &lsquo;Email Not Verified&rsquo; under SECURITY</li>
                                    <li style="margin-bottom: 0;">In &lsquo;Verify with Code&rsquo; enter the 6-digit verification code from your email:</li>
                                </ol>
                                <div style="text-align: center; background: white; padding: 1.5rem; border-radius: 8px; border: 2px dashed #4a90e2;">
                                    <div style="font-size: 2.5rem; font-weight: 700; color: #4a90e2; letter-spacing: 0.5rem; font-family: 'Courier New', monospace;">${verificationCode}</div>
                                    <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #666;">Enter this code on the account page to verify your email</p>
                                </div>
                            </div>
                            ` : ''}
                            
                            <p style="margin-top: 1.5rem; font-size: 0.9rem; color: #666;">Both methods will expire in 24 hours.</p>
                            <p style="margin-top: 0.5rem; font-size: 0.9rem; color: #666;">If you didn't create an account with Totilove1, please ignore this email.</p>
                        </div>
                        <div class="footer" style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
                            <p style="margin: 0;">&copy; ${new Date().getFullYear()} Totilove1. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            text: `
                Welcome to Totilove1!
                
                Hi ${real_name},
                
                Thank you for registering with Totilove1! To complete your registration, please verify your email address using one of these methods:
                
                Method 1: Click this link:
                ${confirmationUrl}
                
                ${verificationCode ? `Method 2: Enter Verification Code

                If the link doesn't work, you can verify using this 6-digit code:

                1. Login with your email and password
                2. Go to: Account
                3. Click on: 'Email Not Verified' under SECURITY
                4. In 'Verify with Code' enter the 6-digit verification code from your email:

                ${verificationCode}

                Enter this code on the account page to verify your email` : ''}
                
                Both methods will expire in 24 hours.
                
                If you didn't create an account with Totilove1, please ignore this email.
            `
        };

        try {
            const result = await this.deliverEmail(mailOptions);
            if (result.success) {
                console.log(`✅ Verification email sent via ${result.provider}:`, result.messageId || 'no-message-id');
            }
            return result;
        } catch (error) {
            console.error('❌ Failed to send verification email:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send password reset email
     * @param {string} to - Recipient email address
     * @param {string} real_name - Username
     * @param {string} token - Reset token
     * @returns {Promise<Object>}
     */
    async sendPasswordResetEmail(to, real_name, token) {
        if (!this.isConfigured) {
            return { success: false, error: 'Email service not configured' };
        }

        const resetUrl = `${this.baseUrl}/reset-password?token=${token}`;

        const mailOptions = {
            from: this.buildFromAddress(),
            to: to,
            subject: 'Reset Your Password - Totilove1',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Password Reset Request</h1>
                        </div>
                        <div class="content">
                            <p>Hi ${real_name},</p>
                            <p>We received a request to reset your password. Click the button below to reset it:</p>
                            <div style="text-align: center;">
                                <a href="${resetUrl}" class="button">Reset Password</a>
                            </div>
                            <p>Or copy and paste this link into your browser:</p>
                            <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
                            <p>This link will expire in 1 hour.</p>
                            <p>If you didn't request a password reset, please ignore this email.</p>
                        </div>
                        <div class="footer">
                            <p>&copy; ${new Date().getFullYear()} Totilove1. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        try {
            return await this.deliverEmail(mailOptions);
        } catch (error) {
            console.error('❌ Failed to send password reset email:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test email configuration
     * @returns {Promise<boolean>}
     */
    async testConnection() {
        if (!this.isConfigured) {
            return false;
        }

        try {
            if (this.primaryProvider === 'resend' && this.resendConfigured) {
                return true;
            }

            if (this.transporter) {
                await this.transporter.verify();
                return true;
            }

            return true;
        } catch (error) {
            console.error('❌ Email connection test failed:', error);
            return false;
        }
    }
}

module.exports = new EmailService();
