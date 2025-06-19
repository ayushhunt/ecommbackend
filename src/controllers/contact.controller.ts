import { Request, Response } from 'express';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const contactController =  async (req: Request, res: Response) => {
    try {
      const { name, email, subject, message } = req.body;

      // Validation
      if (!name || !email || !message) {
        res.status(400).json({
          success: false,
          message: 'Name, email, and message are required fields'
        });
        return;
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          success: false,
          message: 'Please provide a valid email address'
        });
        return;
      }

      // Send email using Resend
      const emailData = await resend.emails.send({
        from: process.env.FROM_EMAIL || 'noreply@yourdomain.com', // Use your verified domain
        to: ['ayushoo7hunt@gmail.com'], // Your default email address
        subject: subject ? `Contact Form: ${subject}` : 'New Contact Form Submission',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
              New Contact Form Submission
            </h2>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #007bff; margin-top: 0;">Contact Details</h3>
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Subject:</strong> ${subject || 'No subject provided'}</p>
            </div>
            
            <div style="background-color: #ffffff; padding: 20px; border-left: 4px solid #007bff; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">Message</h3>
              <p style="line-height: 1.6; color: #555;">${message.replace(/\n/g, '<br>')}</p>
            </div>
            
            <div style="background-color: #e9ecef; padding: 15px; border-radius: 8px; margin-top: 20px;">
              <p style="margin: 0; color: #666; font-size: 14px;">
                <strong>Reply to:</strong> ${email}<br>
                <strong>Received:</strong> ${new Date().toLocaleString()}
              </p>
            </div>
          </div>
        `,
        // Also send a plain text version
        text: `
          New Contact Form Submission
          
          Name: ${name}
          Email: ${email}
          Subject: ${subject || 'No subject provided'}
          
          Message:
          ${message}
          
          Reply to: ${email}
          Received: ${new Date().toLocaleString()}
        `
      });

      // Send confirmation email to the user
      await resend.emails.send({
        from: 'Relot Support <noreply@relot.in>',
        to: [email],
        subject: 'Thank you for contacting us - Relot',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #007bff;">Thank you for contacting us!</h2>
            
            <p>Dear ${name},</p>
            
            <p>We have received your message and will get back to you as soon as possible, usually within 24-48 hours.</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">Your Message Summary</h3>
              <p><strong>Subject:</strong> ${subject || 'No subject provided'}</p>
              <p><strong>Message:</strong></p>
              <p style="background-color: white; padding: 15px; border-left: 4px solid #007bff; margin: 10px 0;">
                ${message.replace(/\n/g, '<br>')}
              </p>
            </div>
            
            <p>If you have any urgent questions, please don't hesitate to call us at +91-9319198930.</p>
            
            <p>Best regards,<br>
            The Relot Team</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        `,
        text: `
          Thank you for contacting us!
          
          Dear ${name},
          
          We have received your message and will get back to you as soon as possible, usually within 24-48 hours.
          
          Your Message Summary:
          Subject: ${subject || 'No subject provided'}
          Message: ${message}
          
          If you have any urgent questions, please don't hesitate to call us at +91-9319198930.
          
          Best regards,
          The Relot Team
        `
      });

      res.status(200).json({
        success: true,
        message: 'Your message has been sent successfully! We will get back to you soon.',
        data: {
          id: emailData.data?.id,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Contact form error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to send your message. Please try again later or contact us directly.',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }
