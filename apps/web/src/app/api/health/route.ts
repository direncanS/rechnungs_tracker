import { NextResponse } from "next/server";
import fs from "fs";

const SENTINEL_PATH = "/tmp/.healthcheck-ready";

export async function GET() {
  const bootPhase = process.env.APP_BOOT_PHASE ?? "1";

  // Phase 0: scaffold validation — no sentinel check
  if (bootPhase === "0") {
    return NextResponse.json({
      status: "ok",
      phase: 0,
      timestamp: new Date().toISOString(),
    });
  }

  // Phase 1+: require sentinel file from entrypoint.sh
  const sentinelExists = fs.existsSync(SENTINEL_PATH);

  if (!sentinelExists) {
    return NextResponse.json(
      {
        status: "not_ready",
        phase: 1,
        message: "Waiting for migrations and seed to complete",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: "ok",
    phase: 1,
    timestamp: new Date().toISOString(),
  });
}
