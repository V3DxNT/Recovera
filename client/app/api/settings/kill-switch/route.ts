import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { enabled } = await req.json();

    const setting = await prisma.systemSetting.upsert({
      where: { key: "MANUAL_CIRCUIT_BREAKER" },
      update: { value: enabled ? "true" : "false" },
      create: { key: "MANUAL_CIRCUIT_BREAKER", value: enabled ? "true" : "false" },
    });

    return NextResponse.json({ success: true, enabled: setting.value === "true" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "MANUAL_CIRCUIT_BREAKER" },
    });

    return NextResponse.json({ enabled: setting?.value === "true" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
