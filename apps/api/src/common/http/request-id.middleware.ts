import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

const HEADER = "x-request-id";
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(HEADER);
  const id = incoming && SAFE_ID.test(incoming) ? incoming : `req_${randomUUID()}`;
  req.requestId = id;
  res.setHeader(HEADER, id);
  next();
}
