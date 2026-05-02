import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "No access token. Please sign out and sign in again." }, { status: 403 });
  }

  const accessToken = session.accessToken;

  try {
    const response = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=50&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json({ error: error.message }, { status: response.status });
    }

    const repos = await response.json();

    // Return only the fields we need
    const simplified = repos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      description: repo.description,
      stars: repo.stargazers_count,
      isPrivate: repo.private,
      language: repo.language,
      updatedAt: repo.updated_at,
      defaultBranch: repo.default_branch,
      htmlUrl: repo.html_url,
    }));

    return NextResponse.json(simplified);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch repositories from GitHub." }, { status: 500 });
  }
}
