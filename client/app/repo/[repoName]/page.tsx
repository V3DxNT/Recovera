import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import RepoDashboard from "@/components/RepoDashboard";

export default async function RepoPage(props: { params: Promise<{ repoName: string }> }) {
  const session = await getServerSession(authOptions);
  const params = await props.params;

  if (!session) {
    redirect("/");
  }

  // Ensure repoName is decoded in case of URL encoding
  const repoName = decodeURIComponent(params.repoName);

  return (
    <div className="min-h-screen bg-black text-white">
      <RepoDashboard repoName={repoName} />
    </div>
  );
}
