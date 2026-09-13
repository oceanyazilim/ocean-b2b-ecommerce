import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("HealthController", () => {
  it("reports ok with service metadata", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const body = controller.get();

    expect(body.status).toBe("ok");
    expect(body.service).toBe("ocean-api");
    expect(typeof body.uptimeSeconds).toBe("number");
  });
});
