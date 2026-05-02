import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import ImportRepo from "@/components/ImportRepo";

export default async function ImportPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-black text-white pt-20">
      <ImportRepo />
    </div>
  );
}
