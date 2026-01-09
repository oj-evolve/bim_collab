const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");

// Configure your email transporter
// For Gmail, use an App Password: https://myaccount.google.com/apppasswords
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "ojevolve@gmail.com",
        pass: "INSERT_YOUR_16_CHAR_APP_PASSWORD_HERE"     // TODO: Use the generated App Password, NOT your login password
    }
});

exports.sendContactEmail = onDocumentCreated("contact_messages/{messageId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        return;
    }

    const data = snapshot.data();
    const { name, email, message, userRole, projectId } = data;

    const mailOptions = {
        from: '"BIM Viewer" <ojevolve@gmail.com>',
        to: "ojevolve@gmail.com",
        subject: `New Contact Message from ${name}`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 600px;">
                <h2 style="color: #4f46e5; margin-top: 0;">New Contact Message</h2>
                <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <p style="margin: 5px 0;"><strong>From:</strong> ${name} (<a href="mailto:${email}">${email}</a>)</p>
                    <p style="margin: 5px 0;"><strong>Role:</strong> ${userRole || 'Guest'}</p>
                    <p style="margin: 5px 0;"><strong>Project ID:</strong> ${projectId}</p>
                </div>
                <h3 style="color: #1e293b; font-size: 16px;">Message:</h3>
                <p style="white-space: pre-wrap; color: #334155; line-height: 1.6;">${message}</p>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                <p style="font-size: 12px; color: #94a3b8;">This is an automated notification from your BIM Viewer application.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        logger.info(`Email sent successfully for message ID: ${event.params.messageId}`);
    } catch (error) {
        logger.error("Error sending email:", error);
    }
});