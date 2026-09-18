import { Injectable } from "@nestjs/common";
import { Prisma } from "@ocean/db";
import type {
  AddCartItemInput,
  Address,
  BuyerInput,
  CartDetail,
  CartStatus,
  CheckoutInput,
  CreateCartInput,
  UpdateCartInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { PaymentMethodsService } from "../payments/payment-methods.service";
import { PaymentsService } from "../payments/payments.service";
import { ShippingEligibilityService } from "../shipping/shipping-eligibility.service";
import { IdempotencyService } from "./idempotency.service";
import { LineQuoterService } from "./line-quoter.service";
import { OrderPlacementService } from "./order-placement.service";

const include = { items: { orderBy: { createdAt: "asc" as const } } } satisfies Prisma.CartInclude;
type CartRow = Prisma.CartGetPayload<{ include: typeof include }>;

const json = (value: unknown) =>
  value === null || value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

// Carts are priced on every read and never store money. The storefront (Phase 8) drives them
// through its own API; the admin exposes them so staff and tests can exercise checkout now.
@Injectable()
export class CartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoter: LineQuoterService,
    private readonly placement: OrderPlacementService,
    private readonly idempotency: IdempotencyService,
    private readonly shippingEligibility: ShippingEligibilityService,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly payments: PaymentsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.CartWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  async get(ctx: TenantContext, id: string): Promise<CartDetail> {
    const row = await this.prisma.cart.findFirst({ where: { ...this.scope(ctx), id }, include });
    if (!row) throw new NotFoundError("Cart");
    return this.toDetail(ctx, row);
  }

  private async toDetail(ctx: TenantContext, row: CartRow): Promise<CartDetail> {
    const buyer = await this.quoter.resolveBuyer(ctx, {
      customerId: row.customerId,
      companyId: row.companyId,
      companyLocationId: row.companyLocationId,
    });
    const quote = await this.quoter.quote(
      ctx,
      buyer,
      row.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      {
        shippingAddress: (row.shippingAddress as unknown as Address | null) ?? null,
        billingAddress: (row.billingAddress as unknown as Address | null) ?? null,
        shippingRateId: row.shippingRateId,
      },
    );
    const shippingAddress = (row.shippingAddress as unknown as Address | null) ?? null;
    const [availableShippingRates, paymentMethod] = await Promise.all([
      this.shippingEligibility.eligibleRates(ctx, {
        countryCode: shippingAddress?.countryCode ?? null,
        subtotal: quote.totals.subtotal.amount,
        weightGrams: quote.shippableWeightGrams,
      }),
      row.paymentMethodId ? this.paymentMethods.get(ctx, row.paymentMethodId).catch(() => null) : null,
    ]);
    const shippingRate = row.shippingRateId
      ? (availableShippingRates.find((r) => r.id === row.shippingRateId) ?? null)
      : null;
    const byVariant = new Map(row.items.map((i) => [i.variantId, i]));
    return {
      id: row.id,
      status: row.status as CartStatus,
      buyer: buyer.summary,
      catalogRestricted: quote.catalogRestricted,
      email: row.email,
      currency: row.currency,
      poNumber: row.poNumber,
      note: row.note,
      shippingAddress,
      billingAddress: (row.billingAddress as unknown as Address | null) ?? null,
      items: quote.lines.map((l) => {
        const item = byVariant.get(l.variantId)!;
        return {
          ...l,
          id: item.id,
          properties: (item.properties as Record<string, string> | null) ?? null,
        };
      }),
      totals: quote.totals,
      shippingRate,
      availableShippingRates,
      paymentMethod,
      ready: quote.ready,
      problems: quote.problems,
      completedOrderId: row.completedOrderId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async create(ctx: TenantContext, input: CreateCartInput): Promise<CartDetail> {
    const buyer = await this.quoter.resolveBuyer(ctx, input.buyer);
    const store = await this.prisma.store.findUnique({
      where: { id: ctx.storeId as string },
      select: { defaultCurrency: true },
    });
    const currency = store?.defaultCurrency ?? "TRY";
    if (input.currency && input.currency !== currency) {
      throw new ValidationError(`Carts use the store currency (${currency}) until markets exist.`, [
        { path: "currency", message: `Must be ${currency}` },
      ]);
    }
    await this.assertVariants(
      ctx,
      input.items.map((i) => i.variantId),
    );
    const merged = new Map<string, AddCartItemInput>();
    for (const item of input.items) {
      const prev = merged.get(item.variantId);
      merged.set(
        item.variantId,
        prev ? { ...prev, quantity: prev.quantity + item.quantity } : item,
      );
    }
    const created = await this.prisma.cart.create({
      data: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        customerId: buyer.customerId,
        companyId: buyer.companyId,
        companyLocationId: buyer.companyLocationId,
        email: input.email ?? buyer.summary.customer?.email ?? null,
        currency,
        poNumber: input.poNumber ?? null,
        note: input.note ?? null,
        items: {
          create: [...merged.values()].map((i) => ({
            storeId: ctx.storeId as string,
            variantId: i.variantId,
            quantity: i.quantity,
            properties: json(i.properties),
          })),
        },
      },
    });
    return this.get(ctx, created.id);
  }

  async update(ctx: TenantContext, id: string, input: UpdateCartInput): Promise<CartDetail> {
    const current = await this.requireActive(ctx, id);
    const data: Prisma.CartUncheckedUpdateInput = {};
    if (input.buyer !== undefined) {
      const buyer = await this.quoter.resolveBuyer(ctx, this.mergeBuyer(current, input.buyer));
      data.customerId = buyer.customerId;
      data.companyId = buyer.companyId;
      data.companyLocationId = buyer.companyLocationId;
    }
    if (input.email !== undefined) data.email = input.email;
    if (input.poNumber !== undefined) data.poNumber = input.poNumber;
    if (input.note !== undefined) data.note = input.note;
    if (input.shippingAddress !== undefined) {
      data.shippingAddress = input.shippingAddress ? json(input.shippingAddress) : Prisma.DbNull;
    }
    if (input.billingAddress !== undefined) {
      data.billingAddress = input.billingAddress ? json(input.billingAddress) : Prisma.DbNull;
    }
    if (input.shippingRateId !== undefined) {
      if (input.shippingRateId) {
        const rate = await this.prisma.shippingRate.findFirst({
          where: { id: input.shippingRateId, storeId: ctx.storeId as string },
        });
        if (!rate) {
          throw new ValidationError("Unknown shipping rate.", [
            { path: "shippingRateId", message: "Not found" },
          ]);
        }
      }
      data.shippingRateId = input.shippingRateId;
    }
    if (input.paymentMethodId !== undefined) {
      if (input.paymentMethodId) {
        const method = await this.prisma.paymentMethod.findFirst({
          where: { id: input.paymentMethodId, storeId: ctx.storeId as string, isEnabled: true },
        });
        if (!method) {
          throw new ValidationError("Unknown or disabled payment method.", [
            { path: "paymentMethodId", message: "Not found" },
          ]);
        }
      }
      data.paymentMethodId = input.paymentMethodId;
    }
    await this.prisma.cart.update({ where: { id }, data });
    return this.get(ctx, id);
  }

  async addItem(ctx: TenantContext, id: string, input: AddCartItemInput): Promise<CartDetail> {
    await this.requireActive(ctx, id);
    await this.assertVariants(ctx, [input.variantId]);
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: id, variantId: input.variantId } },
      create: {
        cartId: id,
        storeId: ctx.storeId as string,
        variantId: input.variantId,
        quantity: input.quantity,
        properties: json(input.properties),
      },
      update: {
        quantity: { increment: input.quantity },
        ...(input.properties ? { properties: json(input.properties) } : {}),
      },
    });
    await this.touch(id);
    return this.get(ctx, id);
  }

  async updateItem(ctx: TenantContext, id: string, itemId: string, quantity: number) {
    await this.requireActive(ctx, id);
    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cartId: id } });
    if (!item) throw new NotFoundError("Cart item");
    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    await this.touch(id);
    return this.get(ctx, id);
  }

  async removeItem(ctx: TenantContext, id: string, itemId: string): Promise<CartDetail> {
    await this.requireActive(ctx, id);
    await this.prisma.cartItem.deleteMany({ where: { id: itemId, cartId: id } });
    await this.touch(id);
    return this.get(ctx, id);
  }

  // Checkout (spec §79): everything is re-derived from the cart and the buyer; the request
  // only contributes addresses, contact email, PO number and note.
  async checkout(
    ctx: TenantContext,
    id: string,
    input: CheckoutInput,
    idempotencyKey: string | null,
    meta: RequestMeta,
  ): Promise<{ orderId: string }> {
    return this.idempotency.run(ctx, `checkout:${id}`, idempotencyKey, input, async () => {
      const cart = await this.prisma.cart.findFirst({ where: { ...this.scope(ctx), id }, include });
      if (!cart) throw new NotFoundError("Cart");
      if (cart.status === "completed" && cart.completedOrderId) {
        throw new ConflictError("This cart was already checked out.");
      }
      if (cart.status !== "active") throw new ConflictError("This cart is no longer active.");
      const buyer = await this.quoter.resolveBuyer(ctx, {
        customerId: cart.customerId,
        companyId: cart.companyId,
        companyLocationId: cart.companyLocationId,
      });
      const shippingAddress =
        input.shippingAddress === undefined
          ? ((cart.shippingAddress as unknown as Address | null) ?? null)
          : input.shippingAddress;
      // Billing falls back to shipping so every order has both addresses when it has one.
      const billingAddress =
        input.billingAddress === undefined
          ? ((cart.billingAddress as unknown as Address | null) ?? shippingAddress)
          : (input.billingAddress ?? shippingAddress);
      const shippingRateId =
        input.shippingRateId === undefined ? cart.shippingRateId : input.shippingRateId;
      const paymentMethodId =
        input.paymentMethodId === undefined ? cart.paymentMethodId : input.paymentMethodId;
      const orderId = await this.placement.place(
        ctx,
        {
          buyer,
          lines: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          email: input.email === undefined ? cart.email : input.email,
          poNumber: input.poNumber === undefined ? cart.poNumber : input.poNumber,
          note: input.note === undefined ? cart.note : input.note,
          shippingAddress,
          billingAddress,
          shippingRateId,
          source: "storefront",
          cartId: cart.id,
        },
        meta,
      );
      if (paymentMethodId) {
        await this.payments.charge(ctx, orderId, { paymentMethodId }, meta);
      }
      return { orderId };
    });
  }

  private mergeBuyer(current: CartRow, patch: BuyerInput): BuyerInput {
    return {
      customerId: patch.customerId === undefined ? current.customerId : patch.customerId,
      companyId: patch.companyId === undefined ? current.companyId : patch.companyId,
      companyLocationId:
        patch.companyLocationId === undefined ? current.companyLocationId : patch.companyLocationId,
    };
  }

  private async requireActive(ctx: TenantContext, id: string): Promise<CartRow> {
    const row = await this.prisma.cart.findFirst({ where: { ...this.scope(ctx), id }, include });
    if (!row) throw new NotFoundError("Cart");
    if (row.status !== "active") throw new ConflictError("This cart is no longer active.");
    return row;
  }

  private touch(id: string) {
    return this.prisma.cart.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  private async assertVariants(ctx: TenantContext, ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const found = await this.prisma.productVariant.count({
      where: { storeId: ctx.storeId as string, deletedAt: null, id: { in: unique } },
    });
    if (found !== unique.length) {
      throw new ValidationError("One or more items are not in this store.", [
        { path: "items", message: "Unknown variant" },
      ]);
    }
  }
}
