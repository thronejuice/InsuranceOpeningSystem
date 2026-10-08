import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
}

export interface SentEmailRecord {
  to: string;
  subject: string;
  text: string;
  html: string;
  from: string;
  sentAt: Date;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private sentEmails: SentEmailRecord[] = [];
  private readonly mailpitUrl: string;
  private readonly defaultFrom: string;

  constructor(private readonly config: ConfigService) {
    this.mailpitUrl = this.config.get<string>('MAILPIT_URL', 'http://localhost:8025');
    this.defaultFrom = this.config.get<string>('MAIL_FROM', 'no-reply@insurance.example.com');
  }

  async send(options: SendMailOptions): Promise<boolean> {
    const from = options.from ?? this.defaultFrom;
    const record: SentEmailRecord = {
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      from,
      sentAt: new Date(),
    };

    // Store in-memory for testing / auditing
    this.sentEmails.push(record);

    // Attempt to dispatch to Mailpit HTTP API if available
    try {
      const response = await fetch(`${this.mailpitUrl}/api/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: { Email: from, Name: 'Insurance System' },
          To: [{ Email: options.to }],
          Subject: options.subject,
          Text: options.text,
          HTML: options.html,
        }),
        signal: AbortSignal.timeout(1000), // Short timeout to never block if offline
      });

      if (response.ok) {
        this.logger.debug(`Email sent to ${options.to} via Mailpit`);
      }
    } catch {
      // Graceful fallback when Mailpit is offline or in unit tests
      this.logger.debug(`Mailpit dispatch skipped for ${options.to} (offline or mock)`);
    }

    return true;
  }

  getSentEmails(): SentEmailRecord[] {
    return [...this.sentEmails];
  }

  clearSentEmails(): void {
    this.sentEmails = [];
  }
}

