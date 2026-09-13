import { Injectable } from "@nestjs/common";
import type { Prisma, User } from "@ocean/db";
import type { AuthUser } from "@ocean/types";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string, tx: Prisma.TransactionClient = this.prisma): Promise<User | null> {
    return tx.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  findById(id: string, tx: Prisma.TransactionClient = this.prisma): Promise<User | null> {
    return tx.user.findUnique({ where: { id } });
  }

  create(
    data: { email: string; name: string; passwordHash: string },
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<User> {
    return tx.user.create({ data: { ...data, email: data.email.toLowerCase() } });
  }

  markEmailVerified(id: string, tx: Prisma.TransactionClient = this.prisma): Promise<User> {
    return tx.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
  }

  setPassword(
    id: string,
    passwordHash: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<User> {
    return tx.user.update({ where: { id }, data: { passwordHash } });
  }
}
