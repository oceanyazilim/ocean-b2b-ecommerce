import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  addCartItemSchema,
  checkoutSchema,
  createStorefrontCartSchema,
  updateCartItemSchema,
  type AddCartItemInput,
  type CheckoutInput,
  type CreateStorefrontCartInput,
  type UpdateCartItemInput,
} from "@ocean/types";
import type { Request, Response } from "express";

import { Public } from "../../common/auth/public.decorator";
import { NotFoundError } from "../../common/errors/domain-error";
import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { StorefrontGuard } from "../../common/tenant/storefront.guard";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { CartsService } from "../orders/carts.service";

function cartCookieName(storeId: string): string {
  return `ocean_cart_${storeId}`;
}

function buyerFor(tenant: TenantContext) {
  return tenant.actor.type === "customer" ? { customerId: tenant.actor.id } : {};
}

// One cart per browser (guest) or per signed-in customer, tracked by a plain (non-sensitive)
// cart-id cookie — the cart itself already enforces tenant scoping, so the cookie only needs to
// point at it, not authenticate anything.
@Controller("storefront/v1/cart")
@Public()
@UseGuards(StorefrontGuard)
export class StorefrontCartController {
  constructor(
    private readonly carts: CartsService,
    private readonly prisma: PrismaService,
  ) {}

  private async currentCartId(req: Request, tenant: TenantContext): Promise<string | null> {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const id = cookies[cartCookieName(tenant.storeId as string)];
    if (!id) return null;
    const row = await this.prisma.cart.findFirst({
      where: { id, storeId: tenant.storeId as string, status: "active" },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  private requireCartId(id: string | null): string {
    if (!id) throw new NotFoundError("Cart");
    return id;
  }

  private attachCartCookie(res: Response, storeId: string, cartId: string) {
    res.cookie(cartCookieName(storeId), cartId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  @Get()
  async get(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const existing = await this.currentCartId(req, tenant);
    if (existing) return this.carts.get(tenant, existing);
    const created = await this.carts.create(tenant, { buyer: buyerFor(tenant), items: [] });
    this.attachCartCookie(res, tenant.storeId as string, created.id);
    return created;
  }

  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createStorefrontCartSchema)) body: CreateStorefrontCartInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const created = await this.carts.create(tenant, { buyer: buyerFor(tenant), items: body.items });
    this.attachCartCookie(res, tenant.storeId as string, created.id);
    return created;
  }

  @Post("items")
  @HttpCode(200)
  async addItem(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(addCartItemSchema)) body: AddCartItemInput,
  ) {
    let cartId = await this.currentCartId(req, tenant);
    if (!cartId) {
      const created = await this.carts.create(tenant, { buyer: buyerFor(tenant), items: [] });
      cartId = created.id;
      this.attachCartCookie(res, tenant.storeId as string, cartId);
    }
    return this.carts.addItem(tenant, cartId, body);
  }

  @Patch("items/:itemId")
  async updateItem(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: Request,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(updateCartItemSchema)) body: UpdateCartItemInput,
  ) {
    const cartId = this.requireCartId(await this.currentCartId(req, tenant));
    return this.carts.updateItem(tenant, cartId, itemId, body.quantity);
  }

  @Delete("items/:itemId")
  async removeItem(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: Request,
    @Param("itemId") itemId: string,
  ) {
    const cartId = this.requireCartId(await this.currentCartId(req, tenant));
    return this.carts.removeItem(tenant, cartId, itemId);
  }

  @Post("checkout")
  async checkout(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(checkoutSchema)) body: CheckoutInput,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @ReqMeta() meta: RequestMeta,
  ) {
    const cartId = this.requireCartId(await this.currentCartId(req, tenant));
    return this.carts.checkout(tenant, cartId, body, idempotencyKey ?? null, meta);
  }
}
