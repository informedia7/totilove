#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');

// Load environment vars from project root .env
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const emailService = require(path.resolve(__dirname, '..', 'services', 'emailService'));

async function main() {
    const [, , recipientArg] = process.argv;
    const recipient = recipientArg || process.env.TEST_EMAIL_TO || process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL;

    if (!recipient) {
        console.error('Usage: node scripts/test-email.js <recipient-email>');
        console.error('Alternatively set TEST_EMAIL_TO, EMAIL_FROM, or RESEND_FROM_EMAIL in your environment.');
        process.exit(1);
    }

    console.log('🧪 Email diagnostic');
    console.log('Provider:', emailService.provider);
    console.log('From:', emailService.getFromHeader());
    console.log('To:', recipient);

    if (!emailService.isConfigured) {
        console.error('❌ Email service is not configured.');
        console.error('   Provide RESEND_API_KEY or SMTP credentials before running this test.');
        process.exit(1);
    }

    const timestamp = new Date().toISOString();
    const payload = {
        subject: `Totilove Email Diagnostic (${timestamp})`,
        html: `<p>This is a Totilove email diagnostic sent at <strong>${timestamp}</strong>.</p>` +
            '<p>If you received this, outbound email is working.</p>',
        text: `Totilove email diagnostic sent at ${timestamp}.`
    };

    try {
        const result = await emailService.dispatchEmail(recipient, payload);
        if (result.success) {
            console.log('✅ Email delivered via', emailService.provider, 'Message ID:', result.messageId || 'n/a');
            process.exit(0);
        }
        console.error('❌ Email dispatch reported failure:', result.error || 'Unknown error');
        process.exit(1);
    } catch (error) {
        console.error('❌ Unexpected error while sending email:', error);
        process.exit(1);
    }
}

main();
