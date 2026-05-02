import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encrypt";
import { validateCredentials } from "@/lib/aws/ValidateCredentials";

/**
 * Phase 1 — Validate & store credentials only.
 * Returns credentialId for the subsequent discover + provision steps.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { provider, label, accessKeyId, secretAccessKey, region } = body;

    if (!accessKeyId || !secretAccessKey || !region || provider !== "aws") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Encrypt both credentials
    const encryptedAccessKey = encrypt(accessKeyId);
    const encryptedSecret = encrypt(secretAccessKey);

    // 2. Find the user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 3. Save credential to DB
    const credential = await prisma.cloudCredential.upsert({
      where: {
        userId_provider_label: {
          userId: user.id,
          provider: "aws",
          label: label || "My AWS Account",
        },
      },
      update: {
        accessKeyId: encryptedAccessKey,
        secretAccessKey: encryptedSecret,
        region,
        isActive: true,
        lastVerifiedAT: new Date(),
      },
      create: {
        userId: user.id,
        provider: "aws",
        label: label || "My AWS Account",
        accessKeyId: encryptedAccessKey,
        secretAccessKey: encryptedSecret,
        region,
        isActive: true,
        lastVerifiedAT: new Date(),
      },
    });

    // 4. Validate credentials with AWS STS
    const identity = await validateCredentials(credential);

    return NextResponse.json({
      success: true,
      credentialId: credential.id,
      accountId: identity.accountId,
    });
  } catch (error: any) {
    console.error("Credential Validation Error:", error);
    
    const status = error.message === "INSUFFICIENT_PERMISSIONS" ? 403 : 
                   (error.message === "INVALID_SECRET" || error.message === "INVALID_ACCESS_KEY") ? 401 : 500;

    return NextResponse.json(
      { 
        error: error.message || "Failed to validate credentials.",
        code: error.message 
      },
      { status }
    );
  }
}
