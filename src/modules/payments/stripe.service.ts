import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(private configService: ConfigService) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-12-18.acacia',
    });

    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || '';
    this.logger.log('Stripe service initialized');
  }

  /**
   * Create a Stripe Checkout Session
   */
  async createCheckoutSession(params: {
    orderId: string;
    userId: string;
    assetId: string;
    assetTitle: string;
    assetPrice: number;
    customerEmail?: string;
  }): Promise<{ sessionId: string; url: string }> {
    try {
      const { orderId, userId, assetId, assetTitle, assetPrice, customerEmail } = params;

      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: assetTitle,
                description: `Purchase of digital asset: ${assetTitle}`,
              },
              unit_amount: Math.round(assetPrice * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/cancel`,
        customer_email: customerEmail,
        metadata: {
          orderId,
          userId,
          assetId,
        },
        payment_intent_data: {
          metadata: {
            orderId,
            userId,
            assetId,
          },
        },
      });

      this.logger.log(`Stripe checkout session created: ${session.id} for order ${orderId}`);

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      this.logger.error('Failed to create Stripe checkout session:', error);
      throw new BadRequestException('Failed to create checkout session');
    }
  }

  /**
   * Construct and verify webhook event from Stripe
   */
  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    try {
      if (!this.webhookSecret) {
        this.logger.warn('Webhook secret not configured, skipping signature verification');
        return JSON.parse(payload.toString()) as Stripe.Event;
      }

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );

      return event;
    } catch (error) {
      this.logger.error('Webhook signature verification failed:', error);
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  /**
   * Retrieve a checkout session by ID
   */
  async retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    try {
      return await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent'],
      });
    } catch (error) {
      this.logger.error(`Failed to retrieve session ${sessionId}:`, error);
      throw new BadRequestException('Failed to retrieve checkout session');
    }
  }

  /**
   * Retrieve a payment intent by ID
   */
  async retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      this.logger.error(`Failed to retrieve payment intent ${paymentIntentId}:`, error);
      throw new BadRequestException('Failed to retrieve payment intent');
    }
  }

  /**
   * Create a refund for a payment
   */
  async createRefund(paymentIntentId: string, amount?: number): Promise<Stripe.Refund> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined, // Partial refund if amount specified
      });

      this.logger.log(`Refund created: ${refund.id} for payment ${paymentIntentId}`);
      return refund;
    } catch (error) {
      this.logger.error('Failed to create refund:', error);
      throw new BadRequestException('Failed to create refund');
    }
  }
}
