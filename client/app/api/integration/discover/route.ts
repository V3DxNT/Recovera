import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { discoverAwsResources } from "@/lib/aws/DiscoverResources";
import { matchResourcesToRepos } from "@/lib/aws/repoMapper";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const credentialId = searchParams.get("credentialId");

    if (!credentialId) {
      return NextResponse.json({ error: "Missing credentialId" }, { status: 400 });
    }

    // 1. Fetch AWS Credential
    const credential = await prisma.cloudCredential.findUnique({
      where: { id: credentialId },
    });

    if (!credential) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }

    // 2. Fetch User's GitHub repos from DB (previously synced or via API)
    // For now, let's try to get them from the user's account access token
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { accounts: true },
    });

    const githubAccount = user?.accounts.find(a => a.provider === "github");

    // 2 & 3. Run GitHub fetch and AWS discovery in parallel
    console.log("[Discover] Starting parallel discovery for user:", session.user.email);
    const startTime = Date.now();

    const [githubRepos, resources] = await Promise.all([
      (async () => {
        console.log("[Discover] Fetching GitHub repositories...");
        let repos: string[] = [];
        if (githubAccount?.access_token) {
          try {
            const res = await fetch("https://api.github.com/user/repos?per_page=100", {
              headers: { Authorization: `Bearer ${githubAccount.access_token}` },
            });
            if (res.ok) {
              const data = await res.json();
              repos = data.map((r: any) => r.full_name);
            }
          } catch (e) {
            console.error("Failed to fetch GitHub repos:", e);
          }
        }
        return repos;
      })(),
      discoverAwsResources(credential)
    ]);

    const duration = Date.now() - startTime;
    console.log(`[Discover] Completed discovery in ${duration}ms. Found ${resources.length} AWS resources and ${githubRepos.length} GitHub repos.`);

    // 4. Match them
    const suggestedMappings = matchResourcesToRepos(resources, githubRepos);

    return NextResponse.json({
      success: true,
      mappings: suggestedMappings,
      githubRepos, // Also return full list for manual selection
    });

  } catch (error: any) {
    console.error("Discovery Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
