const nodemailer = require('nodemailer');
const config = require('../config/config');

class EmailService {
    constructor() {
        this.transporter = null;
        this.isConfigured = false;
        this.init();
    }

    init() {
        // Email configuration from environment variables
        const emailConfig = {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASSWORD || ''
            }
        };

        // Only create transporter if credentials are provided
        if (emailConfig.auth.user && emailConfig.auth.pass) {
            try {
                this.transporter = nodemailer.createTransport(emailConfig);
                this.isConfigured = true;
                console.log('✅ Email service configured successfully');
            } catch (error) {
                console.error('❌ Failed to configure email service:', error.message);
                this.isConfigured = false;
            }
        } else {
            console.warn('⚠️ Email service not configured - SMTP credentials missing');
            console.warn('   Set SMTP_USER and SMTP_PASSWORD environment variables to enable email');
        }
    }

    /**
     * Send email verification email
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

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const confirmationUrl = `${baseUrl}/api/verify-email?token=${token}`;

        const mailOptions = {
            from: `"${process.env.SMTP_FROM_NAME || 'Totilove'}" <${process.env.SMTP_USER}>`,
            to: to,
            subject: 'Verify Your Email Address - Totilove',
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
                        .button:hover { background: #5568d3; }
                        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Welcome to Totilove!</h1>
                        </div>
                        <div class="content">
                            <p>Hi ${real_name},</p>
                            <p>Thank you for registering with Totilove! To complete your registration and start connecting with others, please verify your email address using one of the methods below:</p>
                            
                            <div style="background: white; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; border: 2px solid #667eea;">
                                <h3 style="margin: 0 0 1rem 0; color: #667eea; font-size: 1.1rem;">Method 1: Click the Link (Easiest)</h3>
                                <div style="text-align: center; margin-bottom: 1rem;">
                                    <a href="${confirmationUrl}" class="button">Verify Email Address</a>
                                </div>
                                <p style="font-size: 0.9rem; color: #666; margin: 0;">Or copy and paste this link into your browser:</p>
                                <p style="word-break: break-all; color: #667eea; font-size: 0.85rem; margin: 0.5rem 0 0 0;">${confirmationUrl}</p>
                            </div>
                            
                            ${verificationCode ? `
                            <div style="background: #f0f7ff; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; border: 2px solid #4a90e2;">
                                <h3 style="margin: 0 0 1rem 0; color: #4a90e2; font-size: 1.1rem;">Method 2: Enter Verification Code</h3>
                                <p style="margin: 0 0 1rem 0; font-size: 0.95rem;">If the link doesn't work, you can verify using this 6-digit code:</p>
                                <div style="text-align: center; background: white; padding: 1.5rem; border-radius: 8px; border: 2px dashed #4a90e2;">
                                    <div style="font-size: 2.5rem; font-weight: 700; color: #4a90e2; letter-spacing: 0.5rem; font-family: 'Courier New', monospace;">${verificationCode}</div>
                                    <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #666;">Enter this code on the account page to verify your email</p>
                                </div>
                            </div>
                            ` : ''}
                            
                            <p style="margin-top: 1.5rem; font-size: 0.9rem; color: #666;">Both methods will expire in 24 hours.</p>
                            <p style="margin-top: 0.5rem; font-size: 0.9rem; color: #666;">If you didn't create an account with Totilove, please ignore this email.</p>
                        </div>
                        <div class="footer">
                            <p>&copy; ${new Date().getFullYear()} Totilove. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            text: `
                Welcome to Totilove!
                
                Hi ${real_name},
                
                Thank you for registering with Totilove! To complete your registration, please verify your email address using one of these methods:
                
                Method 1: Click this link:
                ${confirmationUrl}
                
                ${verificationCode ? `Method 2: Enter this verification code on the account page:
                ${verificationCode}` : ''}
                
                Both methods will expire in 24 hours.
                
                If you didn't create an account with Totilove, please ignore this email.
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('✅ Verification email sent:', info.messageId);
            return { success: true, messageId: info.messageId };
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

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;

        const mailOptions = {
            from: `"${process.env.SMTP_FROM_NAME || 'Totilove'}" <${process.env.SMTP_USER}>`,
            to: to,
            subject: 'Reset Your Password - Totilove',
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
                            <p>&copy; ${new Date().getFullYear()} Totilove. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            return { success: true, messageId: info.messageId };
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
            await this.transporter.verify();
            return true;
        } catch (error) {
            console.error('❌ Email connection test failed:', error);
            return false;
        }
    }
}

module.exports = new EmailService();
