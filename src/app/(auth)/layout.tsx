import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[400px] flex-col gap-8">
        <div className="flex items-center gap-3">
          <Image src="/wattsup.svg" alt="" width={36} height={36} priority />
          <span className="text-xl font-bold tracking-tight">
            {/* Logotype : exempté de contraste (WCAG 1.4.3), lu comme un seul nom. */}
            <span aria-hidden>
              WattsUp<span className="text-solar"> Energy</span>
            </span>
            <span className="sr-only">WattsUp Energy</span>
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
