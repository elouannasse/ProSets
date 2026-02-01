import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StripeService } from './stripe.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import Stripe from 'stripe';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
  ) {}

  /**
   * Create a Stripe checkout session for an asset purchase
   */
  async createCheckoutSession(auth0Id: string, dto: CreateCheckoutDto) {
    try {
      // 1. Get user
      const user = await this.prisma.user.findUnique({
        where: { auth0Id },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // 2. Check if asset exists and is ACTIVE
      const asset = await this.prisma.asset.findUnique({
        where: { id: dto.assetId },
        include: { vendor: true },
      });

      if (!asset) {
        throw new NotFoundException('Asset not found');
      }

      if (asset.status !== 'ACTIVE') {
        throw new BadRequestException('Asset is not available for purchase');
      }

      if (asset.deletedAt) {
        throw new BadRequestException('Asset has been deleted');
      }

      // 3. Check if user is trying to buy their own asset
      if (asset.vendorId === user.id) {
        throw new BadRequestException('You cannot purchase your own asset');
      }

      // 4. Check if user already owns this asset
      const existingOrder = await this.prisma.order.findFirst({
        where: {
          userId: user.id,
          assetId: asset.id,
          status: 'PAID',
        },
      });

      if (existingOrder) {
        throw new ConflictException('You already own this asset');
      }

      // 5. Check for pending orders
      const pendingOrder = await this.prisma.order.findFirst({
        where: {
          userId: user.id,
          assetId: asset.id,
          status: 'PENDING',
          createdAt: {
            gte: new Date(Date.now() - 30 * 60 * 1000), // Last 30 minutes
          },
        },
      });

      if (pendingOrder) {
        this.logger.warn(
          `User ${user.id} has a pending order ${pendingOrder.id} for asset ${asset.id}`,
        );
        // Optionally reuse the existing pending order
      }

      // 6. Create order with PENDING status
      const order = await this.prisma.order.create({
        data: {
          userId: user.id,
          assetId: asset.id,
          totalAmount: asset.price,
          status: 'PENDING',
        },
      });

      this.logger.log(`Order created: ${order.id} for user ${user.id}, asset ${asset.id}`);

      // 7. Create Stripe checkout session
      const { sessionId, url } = await this.stripeService.createCheckoutSession({
        orderId: order.id,
        userId: user.id,
        assetId: asset.id,
        assetTitle: asset.title,
        assetPrice: asset.price,
        customerEmail: user.email,
      });

      // 8. Update order with Stripe session ID
      await this.prisma.order.update({
        where: { id: order.id },
        data: { stripeSessionId: sessionId },
      });

      this.logger.log(`Checkout session created: ${sessionId} for order ${order.id}`);

      return {
        sessionId,
        url,
        orderId: order.id,
      };
    } catch (error) {
      this.logger.error('Error creating checkout session:', error);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(payload: Buffer, signature: string) {
    try {
      // Construct and verify webhook event
      const event = this.stripeService.constructWebhookEvent(payload, signature);

      this.logger.log(`Received Stripe webhook event: ${event.type}`);

      // Handle different event types
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
          break;

        case 'payment_intent.succeeded':
          this.logger.log(`Payment intent succeeded: ${event.data.object.id}`);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
      }

      return { received: true };
    } catch (error) {
      this.logger.error('Error handling webhook:', error);
      throw error;
    }
  }

  /**
   * Handle successful checkout completion
   */
  private async handleCheckoutComplete(session: Stripe.Checkout.Session) {
    try {
      const { orderId, userId, assetId } = session.metadata;

      if (!orderId) {
        this.logger.error('Missing orderId in session metadata');
        return;
      }

      // 1. Find the order
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { asset: true, user: true },
      });

      if (!order) {
        this.logger.error(`Order ${orderId} not found for session ${session.id}`);
        return;
      }

      // 2. Check idempotency - if order is already PAID, skip processing
      if (order.status === 'PAID') {
        this.logger.warn(`Order ${orderId} is already marked as PAID, skipping webhook`);
        return;
      }

      // 3. Update order status to PAID
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PAID',
          updatedAt: new Date(),
        },
      });

      // 4. Create payment record
      const paymentIntentId = session.payment_intent as string;
      await this.prisma.payment.create({
        data: {
          orderId: order.id,
          stripePaymentId: paymentIntentId,
          amount: order.totalAmount,
          status: 'SUCCEEDED',
        },
      });

      this.logger.log(
        `✅ Payment successful: Order ${orderId}, Amount: €${order.totalAmount}, Asset: ${order.asset.title}`,
      );

      // 5. Optional: Send confirmation email (implement later)
      // await this.emailService.sendPurchaseConfirmation(order.user.email, order);

      // 6. Optional: Notify vendor (implement later)
      // await this.notificationService.notifyVendor(order.asset.vendorId, order);
    } catch (error) {
      this.logger.error('Error handling checkout completion:', error);
      throw error;
    }
  }

  /**
   * Handle payment failure
   */
  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
    try {
      const { orderId } = paymentIntent.metadata;

      if (!orderId) {
        this.logger.error('Missing orderId in payment intent metadata');
        return;
      }

      // Update order status to FAILED
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'FAILED' },
      });

      // Create payment record with FAILED status
      await this.prisma.payment.create({
        data: {
          orderId,
          stripePaymentId: paymentIntent.id,
          amount: paymentIntent.amount / 100, // Convert from cents
          status: 'FAILED',
        },
      });

      this.logger.warn(`❌ Payment failed for order ${orderId}: ${paymentIntent.last_payment_error?.message}`);
    } catch (error) {
      this.logger.error('Error handling payment failure:', error);
    }
  }

  /**
   * Get payment details by order ID
   */
  async getPaymentByOrderId(orderId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId },
      include: {
        order: {
          include: {
            asset: true,
            user: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  /**
   * Get all payments (admin only)
   */
  async getAllPayments(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            include: {
              asset: { select: { id: true, title: true, price: true } },
              user: { select: { id: true, email: true, name: true } },
            },
          },
        },
      }),
      this.prisma.payment.count(),
    ]);

    return {
      data: payments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

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
