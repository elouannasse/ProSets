import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import Stripe from 'stripe';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private ordersService: OrdersService,
  ) {
    this.stripe = new Stripe(this.configService.get('stripe.secretKey'), {
      apiVersion: '2024-11-20.acacia',
    });
  }

  async createCheckoutSession(
    auth0Id: string,
    createCheckoutSessionDto: CreateCheckoutSessionDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    const order = await this.prisma.order.findUnique({
      where: { id: createCheckoutSessionDto.orderId },
      include: { asset: true },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    if (order.userId !== user.id) {
      throw new BadRequestException('Unauthorized');
    }

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: this.configService.get('stripe.currency'),
            product_data: {
              name: order.asset.title,
              description: order.asset.description,
            },
            unit_amount: Math.round(Number(order.totalAmount) * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${this.configService.get('FRONTEND_URL')}/orders/${order.id}?success=true`,
      cancel_url: `${this.configService.get('FRONTEND_URL')}/orders/${order.id}?canceled=true`,
      metadata: {
        orderId: order.id,
      },
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: session.id },
    });

    return { sessionId: session.id, url: session.url };
  }

  async handleWebhook(signature: string, rawBody: Buffer) {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.configService.get('stripe.webhookSecret'),
      );
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException('Webhook signature verification failed');
    }

    this.logger.log(`Received webhook event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }

    return { received: true };
  }

  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    const orderId = session.metadata.orderId;

    await this.ordersService.updateStatus(orderId, 'PAID');

    await this.prisma.payment.create({
      data: {
        orderId,
        stripePaymentId: session.payment_intent as string,
        amount: session.amount_total / 100,
        status: 'SUCCEEDED',
      },
    });

    this.logger.log(`Order ${orderId} marked as PAID`);
  }

  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    this.logger.log(`PaymentIntent succeeded: ${paymentIntent.id}`);
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
    this.logger.error(`PaymentIntent failed: ${paymentIntent.id}`);
  }
}
