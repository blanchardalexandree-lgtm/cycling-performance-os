import { requireUser } from "@/lib/auth";
import { MobileMore, Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh">
      <Nav userName={user.name} />
      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-5 sm:px-6 lg:pl-62 lg:pb-10 lg:pt-8">
        <MobileMore />
        {children}
      </main>
    </div>
  );
}
