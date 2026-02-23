import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";

declare module "express-serve-static-core" {
  interface Request {
    brandId?: string;
  }
}

const getHeaderBrandId = (req: Request): string | null => {
  const header = req.headers["x-brand-id"];
  if (!header) {
    return null;
  }
  if (Array.isArray(header)) {
    return header[0] || null;
  }
  return header;
};

export const requireBrandContext = async (req: Request, res: Response, next: NextFunction) => {
  const orgId = req.auth?.orgId;
  const brandId = getHeaderBrandId(req);

  if (!orgId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!brandId) {
    return res.status(400).json({ code: "BRAND_CONTEXT_REQUIRED", message: "Brand context required" });
  }

  const result = await db.query(
    "SELECT id FROM brands WHERE id = $1 AND org_id = $2",
    [brandId, orgId]
  );

  if ((result.rowCount ?? 0) === 0) {
    return res.status(403).json({ code: "BRAND_ACCESS_DENIED", message: "Brand does not belong to your organization" });
  }

  req.brandId = brandId;
  return next();
};

export const requireBrandOwnershipFromParam = async (req: Request, res: Response, next: NextFunction) => {
  const orgId = req.auth?.orgId;
  const brandId = req.params.brandId;

  if (!orgId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!brandId) {
    return res.status(400).json({ error: "brandId required" });
  }

  const result = await db.query(
    "SELECT id FROM brands WHERE id = $1 AND org_id = $2",
    [brandId, orgId]
  );

  if ((result.rowCount ?? 0) === 0) {
    return res.status(403).json({ code: "BRAND_ACCESS_DENIED", message: "Brand does not belong to your organization" });
  }

  req.brandId = brandId;
  return next();
};
